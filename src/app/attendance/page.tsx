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
import { format, isValid, getDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useCollection, useFirestore, useMemoFirebase, errorEmitter, FirestorePermissionError, useUser } from "@/firebase";
import { collection, doc, writeBatch, type CollectionReference, type Query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { HorizontalDatePicker } from "@/components/ui/horizontal-date-picker";
import { Plus, Sunrise, Sun, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";


type DailyAttendance = {
  employeeId: string;
  employeeName: string;
  morningStatus: AttendanceStatus;
  afternoonStatus: AttendanceStatus;
  morningEntry?: string;
  afternoonEntry?: string;
  overtimeHours?: number;
};

const StatusBadge = ({ status, session }: { status: AttendanceStatus, session?: string }) => {
  const getColors = (s: AttendanceStatus) => {
    switch (s) {
      case "Permission":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "Present":
        return "bg-secondary text-secondary-foreground border-transparent";
      case "Late":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "Absent":
        return "bg-destructive text-destructive-foreground border-transparent";
      default:
        return "bg-muted text-muted-foreground border-transparent";
    }
  };

  const getInitial = (s: AttendanceStatus) => {
    if (s === "Permission") return "PR";
    return s.charAt(0);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {session && <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter leading-none">{session}</span>}
      <Badge 
        variant="outline" 
        className={cn(
          "h-6 px-1.5 sm:px-2.5 min-w-[24px] justify-center text-[10px] sm:text-xs font-bold transition-all",
          getColors(status)
        )}
      >
        <span className="hidden sm:inline">{status}</span>
        <span className="inline sm:hidden">{getInitial(status)}</span>
      </Badge>
    </div>
  );
};

const getStatusBadge = (status: AttendanceStatus) => {
  switch (status) {
    case "Permission":
        return <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">Permission</Badge>;
    case "Present":
        return <Badge variant="secondary">Present</Badge>;
    case "Late":
      return <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">Late</Badge>;
    case "Absent":
      return <Badge variant="destructive">Absent</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

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
  const { data: allEmployees, loading: employeesLoading } = useCollection(employeesCollectionRef as CollectionReference<Employee>);
  
  // Filter for active employees only
  const employees = useMemo(() => allEmployees?.filter(e => e.status !== 'Inactive') || [], [allEmployees]);

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


  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
  }, []);

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
      // Update local state immediately for better responsiveness
      setSelectedEmployeeAttendance(updatedAttendance);
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
                {!attendanceLoading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                      {attendance.length > 0 ? (
                        attendance.map((att) => {
                            return (
                                <div key={att.employeeId} className="flex items-center gap-2">
                                    <button onClick={() => openAttendanceDialog(att.employeeId)} className="text-left flex-1">
                                        <Card className="hover:bg-accent transition-colors">
                                            <CardContent className="flex items-center justify-between p-4">
                                                <p className="font-medium text-sm sm:text-base truncate max-w-[120px]">{att.employeeName}</p>
                                                <div className="flex items-center gap-2 sm:gap-3">
                                                    <StatusBadge status={att.morningStatus} session="AM" />
                                                    <StatusBadge status={att.afternoonStatus} session="PM" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </button>
                                    <Button variant="outline" size="icon" onClick={() => openOvertimeDialog(att.employeeId)} aria-label="Log Overtime">
                                        <Plus className="h-4 w-4"/>
                                    </Button>
                                </div>
                            )
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground col-span-2">No active employees found.</p>
                      )}
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <div className="bg-primary/5 p-6 border-b">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {selectedEmployeeAttendance?.employeeName}
              </DialogTitle>
              <DialogDescription>
                Log attendance for {format(selectedDate, "PPPP")}
              </DialogDescription>
            </DialogHeader>
          </div>
          {selectedEmployeeAttendance && (
            <div className="p-6 space-y-8">
              {/* Morning Session */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    <Sunrise className="h-4 w-4 text-orange-500" />
                    Morning Session
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedEmployeeAttendance.morningStatus)}
                    {selectedEmployeeAttendance.morningEntry && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {selectedEmployeeAttendance.morningEntry}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedEmployeeAttendance.morningStatus === 'Present' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('morning', 'Present')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Present' ? "bg-primary-foreground" : "bg-green-500")} />
                    Present
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.morningStatus === 'Late' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('morning', 'Late')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Late' ? "bg-primary-foreground" : "bg-amber-500")} />
                    Late
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.morningStatus === 'Absent' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('morning', 'Absent')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Absent' ? "bg-primary-foreground" : "bg-destructive")} />
                    Absent
                  </Button>
                  {selectedEmployeeDetails?.paymentMethod === 'Monthly' && (
                    <Button 
                      variant={selectedEmployeeAttendance.morningStatus === 'Permission' ? 'default' : 'outline'} 
                      className="h-12 justify-start gap-3"
                      onClick={() => handleStatusClick('morning', 'Permission')}
                      disabled={isSundayAndShouldBeDisabled}
                    >
                      <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Permission' ? "bg-primary-foreground" : "bg-blue-500")} />
                      Permission
                    </Button>
                  )}
                </div>
              </div>

              {/* Afternoon Session */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    <Sun className="h-4 w-4 text-amber-500" />
                    Afternoon Session
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedEmployeeAttendance.afternoonStatus)}
                    {selectedEmployeeAttendance.afternoonEntry && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {selectedEmployeeAttendance.afternoonEntry}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedEmployeeAttendance.afternoonStatus === 'Present' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('afternoon', 'Present')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Present' ? "bg-primary-foreground" : "bg-green-500")} />
                    Present
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.afternoonStatus === 'Late' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('afternoon', 'Late')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Late' ? "bg-primary-foreground" : "bg-amber-500")} />
                    Late
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.afternoonStatus === 'Absent' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('afternoon', 'Absent')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Absent' ? "bg-primary-foreground" : "bg-destructive")} />
                    Absent
                  </Button>
                  {selectedEmployeeDetails?.paymentMethod === 'Monthly' && (
                    <Button 
                      variant={selectedEmployeeAttendance.afternoonStatus === 'Permission' ? 'default' : 'outline'} 
                      className="h-12 justify-start gap-3"
                      onClick={() => handleStatusClick('afternoon', 'Permission')}
                      disabled={isSundayAndShouldBeDisabled}
                    >
                      <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Permission' ? "bg-primary-foreground" : "bg-blue-500")} />
                      Permission
                    </Button>
                  )}
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
