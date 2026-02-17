
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttendanceRecord, Employee, AttendanceStatus } from "@/lib/types";
import { format, isValid, getDay, isAfter, startOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useCollection, useFirestore, useMemoFirebase, errorEmitter, FirestorePermissionError, useUser } from "@/firebase";
import { collection, doc, writeBatch, type CollectionReference, type Query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { HorizontalDatePicker } from "@/components/ui/horizontal-date-picker";
import { Plus } from "lucide-react";


type DailyAttendance = {
  employeeId: string;
  employeeName: string;
  morningStatus: AttendanceStatus;
  afternoonStatus: AttendanceStatus;
  morningEntry?: string;
  afternoonEntry?: string;
  overtimeHours?: number;
};

const getStatusVariant = (status: AttendanceStatus) => {
  switch (status) {
    case "Permission":
        return "default";
    case "Present":
    case "Late":
      return "secondary";
    case "Absent":
      return "destructive";
    default:
      return "outline";
  }
};

const getOverallStatus = (morning: AttendanceStatus, afternoon: AttendanceStatus): AttendanceStatus => {
    if (morning === 'Permission' || afternoon === 'Permission') return 'Permission';
    if (morning === 'Absent' && afternoon === 'Absent') return 'Absent';
    if (morning === 'Late' || afternoon === 'Late') return 'Late';
    if (morning === 'Present' || afternoon === 'Present') return 'Present';
    return 'Absent';
}

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  if (!isValid(date)) return "Invalid Date";
  try {
      return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
  } catch (e) {
      console.error("Error formatting Ethiopian date:", e);
      return "Invalid Date";
  }
};

export default function AttendancePage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  
  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef as CollectionReference<Employee>);
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const formattedDate = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);
  
  const attendanceCollectionRef: Query<AttendanceRecord> | null = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance', formattedDate, 'records') as Query<AttendanceRecord>;
  }, [firestore, user, formattedDate]);

  const { data: attendanceRecords, loading: attendanceLoading } = useCollection(attendanceCollectionRef);

  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  
  // Dialog states
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
  const [isLateDialogOpen, setIsLateDialogOpen] = useState(false);
  const [isOvertimeDialogOpen, setIsOvertimeDialogOpen] = useState(false);
  
  // Data for dialogs
  const [selectedEmployeeAttendance, setSelectedEmployeeAttendance] = useState<DailyAttendance | null>(null);
  const [lateDialogData, setLateDialogData] = useState<{ session: 'morning' | 'afternoon', time: string } | null>(null);

  useEffect(() => {
    setTitle("Log Attendance");
  }, [setTitle]);

  useEffect(() => {
    if (employees) {
        const dailyAttendance: DailyAttendance[] = employees.map((emp) => {
            const record = attendanceRecords?.find((r) => r.employeeId === emp.id);
            
            let morningStatus: AttendanceStatus = record?.morningStatus || "Absent";
            let afternoonStatus: AttendanceStatus = record?.afternoonStatus || "Absent";
            let morningEntry = record?.morningEntry || "";
            let afternoonEntry = record?.afternoonEntry || "";

            const isMonthly = emp.paymentMethod === 'Monthly';
            const isPastOrToday = !isAfter(startOfDay(selectedDate), startOfDay(new Date()));
            const isSunday = getDay(selectedDate) === 0;
            const isSaturday = getDay(selectedDate) === 6;

            if (isPastOrToday && isMonthly) {
                if (isSunday) {
                    morningStatus = "Present";
                    afternoonStatus = "Present";
                    morningEntry = "08:00";
                    afternoonEntry = "13:30";
                } else if (isSaturday) {
                    if (!record || record.afternoonStatus === undefined || record.afternoonStatus === null) {
                         afternoonStatus = "Present";
                         afternoonEntry = "13:30";
                    }
                }
            }

            return {
                employeeId: emp.id,
                employeeName: emp.name,
                morningStatus: morningStatus,
                afternoonStatus: afternoonStatus,
                morningEntry: morningEntry,
                afternoonEntry: afternoonEntry,
                overtimeHours: record?.overtimeHours || 0,
            };
        });
        setAttendance(dailyAttendance);
    }
  }, [employees, attendanceRecords, selectedDate]);


  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
  };

  const saveAttendance = async (attendanceData: DailyAttendance) => {
    if (!firestore) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    const recordRef = doc(firestore, 'attendance', dateStr, 'records', attendanceData.employeeId);
    const employeeAttendanceRef = doc(firestore, 'employees', attendanceData.employeeId, 'attendance', dateStr);
    
    const record: Partial<AttendanceRecord> = {
        employeeId: attendanceData.employeeId,
        date: selectedDate.toISOString(),
        morningStatus: attendanceData.morningStatus,
        afternoonStatus: attendanceData.afternoonStatus,
        morningEntry: attendanceData.morningEntry || "",
        afternoonEntry: attendanceData.afternoonEntry || "",
        overtimeHours: attendanceData.overtimeHours || 0,
    };
    
    const batch = writeBatch(firestore);
    batch.set(recordRef, record, { merge: true });
    batch.set(employeeAttendanceRef, record, { merge: true });

    try {
        await batch.commit();
        toast({ title: "Attendance saved!" });
        setAttendance((prev) =>
          prev.map((a) =>
            a.employeeId === attendanceData.employeeId ? attendanceData : a
          )
        );
      } catch(e) {
        const permissionError = new FirestorePermissionError({
            path: recordRef.path,
            operation: 'write',
            requestResourceData: record,
        });
        errorEmitter.emit('permission-error', permissionError);
      };
  };

  const openAttendanceDialog = (employeeId: string) => {
    const employeeData = attendance.find((att) => att.employeeId === employeeId);
    if (employeeData) {
      setSelectedEmployeeAttendance({ ...employeeData });
      setIsAttendanceDialogOpen(true);
    }
  };

  const openOvertimeDialog = (employeeId: string) => {
    const employeeData = attendance.find((att) => att.employeeId === employeeId);
    if (employeeData) {
      setSelectedEmployeeAttendance({ ...employeeData });
      setIsOvertimeDialogOpen(true);
    }
  };

  const handleStatusClick = async (session: 'morning' | 'afternoon', status: AttendanceStatus) => {
      if (!selectedEmployeeAttendance || !firestore) return;

      const employee = employees?.find(e => e.id === selectedEmployeeAttendance.employeeId);
      const isMonthly = employee?.paymentMethod === 'Monthly';
      const isSunday = getDay(selectedDate) === 0;

      if (isSunday && isMonthly) {
          toast({ variant: 'destructive', title: "Cannot Change", description: "Attendance for monthly employees on Sundays cannot be changed."});
          return;
      }

      if (status === 'Late') {
          setLateDialogData({ session, time: session === 'morning' ? '08:00' : '13:30' });
          setIsLateDialogOpen(true);
          return;
      }

      const updatedAttendance = { ...selectedEmployeeAttendance };
      let entryTime = "";
      if (status === 'Present' || status === 'Permission') {
          entryTime = session === 'morning' ? '08:00' : '13:30';
      }

      if (session === 'morning') {
          updatedAttendance.morningStatus = status;
          updatedAttendance.morningEntry = entryTime;
      } else {
          updatedAttendance.afternoonStatus = status;
          updatedAttendance.afternoonEntry = entryTime;
      }

      if (updatedAttendance.morningStatus === 'Absent' && updatedAttendance.afternoonStatus === 'Absent') {
          updatedAttendance.overtimeHours = 0;
      }

      await saveAttendance(updatedAttendance);
      setIsAttendanceDialogOpen(false);
  };

  const handleSaveLateTime = async () => {
    if (!selectedEmployeeAttendance || !lateDialogData || !firestore) return;

    const updatedAttendance = { ...selectedEmployeeAttendance };
    if (lateDialogData.session === 'morning') {
        updatedAttendance.morningStatus = 'Late';
        updatedAttendance.morningEntry = lateDialogData.time;
    } else {
        updatedAttendance.afternoonStatus = 'Late';
        updatedAttendance.afternoonEntry = lateDialogData.time;
    }
    
    await saveAttendance(updatedAttendance);
    
    setIsLateDialogOpen(false);
    setIsAttendanceDialogOpen(false);
    setLateDialogData(null);
    setSelectedEmployeeAttendance(null);
  };
  
  const handleOvertimeInputChange = (value: number) => {
      if(selectedEmployeeAttendance) {
          setSelectedEmployeeAttendance({ ...selectedEmployeeAttendance, overtimeHours: value });
      }
  };

  const handleSaveOvertime = async () => {
    if (!selectedEmployeeAttendance || !firestore) return;
    await saveAttendance(selectedEmployeeAttendance);
    setIsOvertimeDialogOpen(false);
    setSelectedEmployeeAttendance(null);
  };

  const selectedEmployeeDetails: Employee | undefined = useMemo(() => {
      if (!isUserLoading && employees) {
        return employees.find(e => e.id === selectedEmployeeAttendance?.employeeId);
      }
      return undefined;
  }, [selectedEmployeeAttendance, employees, isUserLoading]);

  const isSundayAndShouldBeDisabled = getDay(selectedDate) === 0 && selectedEmployeeDetails?.paymentMethod === 'Monthly';

  if (employeesLoading || isUserLoading) {
      return <div>Loading...</div>
  }
  
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="flex justify-center">
              <HorizontalDatePicker 
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
              />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Employee Attendance for {format(selectedDate, "PPP")}
              </CardTitle>
              <CardDescription>
                {ethiopianDateFormatter(selectedDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
                {attendanceLoading && <p>Loading attendance...</p>}
                {!attendanceLoading && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                    {attendance.map((att) => {
                        const overallStatus = getOverallStatus(att.morningStatus, att.afternoonStatus);
                        return (
                            <div key={att.employeeId} className="flex items-center gap-2">
                                <button onClick={() => openAttendanceDialog(att.employeeId)} className="text-left flex-1">
                                    <Card className="hover:bg-accent transition-colors">
                                        <CardContent className="flex items-center justify-between p-4">
                                            <p className="font-medium">{att.employeeName}</p>
                                            <Badge variant={getStatusVariant(overallStatus)} className="capitalize">
                                                {overallStatus}
                                            </Badge>
                                        </CardContent>
                                    </Card>
                                </button>
                                <Button variant="outline" size="icon" onClick={() => openOvertimeDialog(att.employeeId)} aria-label="Log Overtime">
                                    <Plus className="h-4 w-4"/>
                                </Button>
                            </div>
                        )
                    })}
                </div>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Log Attendance for {selectedEmployeeAttendance?.employeeName}
            </DialogTitle>
          </DialogHeader>
          {selectedEmployeeAttendance && (
            <div className="grid gap-6 py-4">
              <div className="grid gap-2">
                  <Label>Morning</Label>
                  <div className="text-sm text-muted-foreground">
                    Status: <Badge variant={getStatusVariant(selectedEmployeeAttendance.morningStatus)}>{selectedEmployeeAttendance.morningStatus}</Badge>
                    {selectedEmployeeAttendance.morningEntry && ` at ${selectedEmployeeAttendance.morningEntry}`}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Present')} disabled={isSundayAndShouldBeDisabled}>Present</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Late')} disabled={isSundayAndShouldBeDisabled}>Late</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Absent')} disabled={isSundayAndShouldBeDisabled}>Absent</Button>
                      {selectedEmployeeDetails?.paymentMethod === 'Monthly' && <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Permission')} disabled={isSundayAndShouldBeDisabled}>Permission</Button>}
                  </div>
              </div>
              <div className="grid gap-2">
                  <Label>Afternoon</Label>
                   <div className="text-sm text-muted-foreground">
                    Status: <Badge variant={getStatusVariant(selectedEmployeeAttendance.afternoonStatus)}>{selectedEmployeeAttendance.afternoonStatus}</Badge>
                    {selectedEmployeeAttendance.afternoonEntry && ` at ${selectedEmployeeAttendance.afternoonEntry}`}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Present')} disabled={isSundayAndShouldBeDisabled}>Present</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Late')} disabled={isSundayAndShouldBeDisabled}>Late</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Absent')} disabled={isSundayAndShouldBeDisabled}>Absent</Button>
                      {selectedEmployeeDetails?.paymentMethod === 'Monthly' && <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Permission')} disabled={isSundayAndShouldBeDisabled}>Permission</Button>}
                  </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      <Dialog open={isLateDialogOpen} onOpenChange={setIsLateDialogOpen}>
          <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                  <DialogTitle>Enter Late Entry Time</DialogTitle>
              </DialogHeader>
              <Input 
                  id="lateTime"
                  type="time"
                  value={lateDialogData?.time}
                  onChange={(e) => setLateDialogData(prev => prev ? {...prev, time: e.target.value} : null)}
              />
              <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={handleSaveLateTime}>Save Time</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={isOvertimeDialogOpen} onOpenChange={setIsOvertimeDialogOpen}>
          <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                  <DialogTitle>Log Overtime</DialogTitle>
                  <DialogDescription>For {selectedEmployeeAttendance?.employeeName}</DialogDescription>
              </DialogHeader>
               <div className="grid gap-4 py-4">
                  <Label htmlFor="overtime">Overtime Hours</Label>
                  <Input 
                      id="overtime"
                      type="number"
                      min="0"
                      value={selectedEmployeeAttendance?.overtimeHours || 0}
                      onChange={(e) => handleOvertimeInputChange(Number(e.target.value))}
                  />
              </div>
              <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={handleSaveOvertime}>Save Overtime</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}

    