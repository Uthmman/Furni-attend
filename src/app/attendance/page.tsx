
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AttendanceRecord, Employee, AttendanceStatus } from "@/lib/types";
import { format, isValid, getDay, isAfter, startOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useCollection, useFirestore, useMemoFirebase, errorEmitter, FirestorePermissionError, useUser } from "@/firebase";
import { collection, doc, setDoc, writeBatch, type CollectionReference, type Query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useDayPicker, type CaptionProps, useNavigation } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";


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
  const isSaturday = getDay(selectedDate) === 6;
  const isSunday = getDay(selectedDate) === 0;
  
  const formattedDate = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);
  
  const attendanceCollectionRef: Query<AttendanceRecord> | null = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance', formattedDate, 'records') as Query<AttendanceRecord>;
  }, [firestore, user, formattedDate]);

  const { data: attendanceRecords, loading: attendanceLoading } = useCollection(attendanceCollectionRef);

  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [
    selectedEmployeeAttendance,
    setSelectedEmployeeAttendance,
  ] = useState<DailyAttendance | null>(null);

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

            if (isPastOrToday && isMonthly) {
                if (isSunday) {
                    morningStatus = "Present";
                    afternoonStatus = "Present";
                    morningEntry = "08:00";
                    afternoonEntry = "13:30";
                }
                if (isSaturday) {
                    afternoonStatus = "Present";
                    if(!afternoonEntry) afternoonEntry = "13:30";
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
  }, [employees, attendanceRecords, selectedDate, isSaturday, isSunday]);


  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
  };

  const openDialogForEmployee = (employeeId: string) => {
    const employeeData = attendance.find((att) => att.employeeId === employeeId);
    if (employeeData) {
      setSelectedEmployeeAttendance({ ...employeeData });
      setIsDialogOpen(true);
    }
  };

  const handleDialogInputChange = (
    field: keyof DailyAttendance,
    value: string | number
  ) => {
    if (selectedEmployeeAttendance) {
      const updated = { ...selectedEmployeeAttendance, [field]: value };
       if (field === 'morningStatus') {
            if (value === 'Absent') {
                updated.morningEntry = "";
            } else if ((value === 'Present' || value === 'Late') && !updated.morningEntry) {
                updated.morningEntry = "08:00";
            }
        }
        if (field === 'afternoonStatus') {
            if (value === 'Absent') {
                updated.afternoonEntry = "";
            } else if ((value === 'Present' || value === 'Late') && !updated.afternoonEntry) {
                updated.afternoonEntry = "13:30";
            }
        }
        if (updated.morningStatus === 'Absent' && updated.afternoonStatus === 'Absent') {
            updated.overtimeHours = 0;
        }
      setSelectedEmployeeAttendance(updated);
    }
  };

  const handleSaveDialog = () => {
    if (!selectedEmployeeAttendance || !firestore) return;

    const att = selectedEmployeeAttendance;
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    const recordRef = doc(firestore, 'attendance', dateStr, 'records', att.employeeId);
    const employeeAttendanceRef = doc(firestore, 'employees', att.employeeId, 'attendance', dateStr);
    
    const record: Partial<AttendanceRecord> = {
        employeeId: att.employeeId,
        date: selectedDate.toISOString(),
        morningStatus: att.morningStatus,
        afternoonStatus: att.afternoonStatus,
        morningEntry: att.morningEntry || "",
        afternoonEntry: att.afternoonEntry || "",
        overtimeHours: att.overtimeHours || 0,
    };
    
    const batch = writeBatch(firestore);
    batch.set(recordRef, record, { merge: true });
    batch.set(employeeAttendanceRef, record, { merge: true });

    batch.commit()
      .then(() => {
        toast({ title: "Attendance saved!" });
        setAttendance((prev) =>
          prev.map((a) =>
            a.employeeId === att.employeeId ? att : a
          )
        );
      })
      .catch((e) => {
        const permissionError = new FirestorePermissionError({
            path: recordRef.path,
            operation: 'write',
            requestResourceData: record,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
    
    setIsDialogOpen(false);
    setSelectedEmployeeAttendance(null);
  };
  
  const selectedEmployeeDetails: Employee | undefined = useMemo(() => {
      if (!isUserLoading && employees) {
        return employees.find(e => e.id === selectedEmployeeAttendance?.employeeId);
      }
      return undefined;
  }, [selectedEmployeeAttendance, employees, isUserLoading]);

  const isMonthlySaturday = useMemo(() => {
    if (!selectedEmployeeDetails) return false;
    const isPastOrToday = !isAfter(startOfDay(selectedDate), startOfDay(new Date()));
    return selectedEmployeeDetails.paymentMethod === 'Monthly' && isSaturday && isPastOrToday;
  }, [selectedEmployeeDetails, isSaturday, selectedDate]);

  const isPresetSunday = useMemo(() => {
    if (!selectedEmployeeDetails) return false;
    const isPastOrToday = !isAfter(startOfDay(selectedDate), startOfDay(new Date()));
    return isSunday && selectedEmployeeDetails.paymentMethod === 'Monthly' && isPastOrToday;
  }, [isSunday, selectedEmployeeDetails, selectedDate]);

  const hourlyRate: number = useMemo(() => {
    if (!selectedEmployeeDetails) return 0;
    return selectedEmployeeDetails.hourlyRate ||
        (selectedEmployeeDetails.dailyRate ? selectedEmployeeDetails.dailyRate / 8 : 0) ||
        (selectedEmployeeDetails.monthlyRate ? selectedEmployeeDetails.monthlyRate / 23.625 / 8 : 0);
  }, [selectedEmployeeDetails]);
  
  const overtimePay: number = useMemo(() => {
      if (!selectedEmployeeAttendance?.overtimeHours || !hourlyRate) return 0;
      return selectedEmployeeAttendance.overtimeHours * hourlyRate;
  }, [selectedEmployeeAttendance, hourlyRate]);


  const handleSaveChanges = async () => {
    if (!firestore) return;
    const batch = writeBatch(firestore);
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    attendance.forEach((att) => {
        const recordRef = doc(firestore, 'attendance', dateStr, 'records', att.employeeId);
        const employeeAttendanceRef = doc(firestore, 'employees', att.employeeId, 'attendance', dateStr);

        const record: Partial<AttendanceRecord> = {
            employeeId: att.employeeId,
            date: selectedDate.toISOString(),
            morningStatus: att.morningStatus,
            afternoonStatus: att.afternoonStatus,
            morningEntry: att.morningEntry || "",
            afternoonEntry: att.afternoonEntry || "",
            overtimeHours: att.overtimeHours || 0,
        };
        batch.set(recordRef, record, { merge: true });
        batch.set(employeeAttendanceRef, record, { merge: true });
    });

    batch.commit()
        .then(() => {
            toast({ title: "All attendance changes saved!" });
        })
        .catch((e) => {
             const permissionError = new FirestorePermissionError({
                path: `/attendance/${dateStr}/records`,
                operation: 'write',
                requestResourceData: attendance,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
  };
  
  if (employeesLoading || isUserLoading) {
      return <div>Loading...</div>
  }
  
  const CalendarCaption = useCallback(
    (props: CaptionProps) => {
      const { fromYear, toYear } = useDayPicker();
      const { goToMonth, nextMonth, previousMonth } = useNavigation();

      const years = Array.from(
        { length: (toYear ?? 0) - (fromYear ?? 0) + 1 },
        (_, i) => (fromYear ?? 0) + i
      );

      return (
        <div className="flex justify-between items-center w-full px-2">
           <Button variant="outline" size="icon" className="h-7 w-7" disabled={!previousMonth} onClick={() => previousMonth && goToMonth(previousMonth)}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-2">
                <Select
                    value={props.displayMonth.getMonth().toString()}
                    onValueChange={(value) => {
                        const newDate = new Date(props.displayMonth);
                        newDate.setMonth(parseInt(value));
                        goToMonth(newDate);
                    }}
                >
                    <SelectTrigger className="w-auto border-none focus:ring-0">
                         <SelectValue asChild>
                            <span className="font-medium text-base">{format(props.displayMonth, 'MMMM')}</span>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {Array.from({length: 12}, (_, i) => (
                           <SelectItem key={i} value={i.toString()}>{format(new Date(2000, i, 1), 'MMMM')}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <Select
                    value={props.displayMonth.getFullYear().toString()}
                    onValueChange={(value) => {
                        const newDate = new Date(props.displayMonth);
                        newDate.setFullYear(parseInt(value));
                        goToMonth(newDate);
                    }}
                >
                    <SelectTrigger className="w-auto border-none focus:ring-0">
                        <SelectValue asChild>
                           <span className="font-medium text-base">{props.displayMonth.getFullYear()}</span>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {years.map(year => (
                           <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={!nextMonth} onClick={() => nextMonth && goToMonth(nextMonth)}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
      );
    },
    []
  );

  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between">
         <div/>
        <Button onClick={handleSaveChanges}>Save All Changes</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Select Date</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                components={{ Caption: CalendarCaption }}
                captionLayout="dropdown-buttons"
                fromYear={2015}
                toYear={2035}
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
                {!attendanceLoading && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {attendance.map((att) => {
                        const overallStatus = getOverallStatus(att.morningStatus, att.afternoonStatus);
                        return (
                            <button key={att.employeeId} onClick={() => openDialogForEmployee(att.employeeId)} className="text-left">
                                <Card className="hover:bg-accent transition-colors">
                                    <CardContent className="flex items-center justify-between p-4">
                                        <p className="font-medium">{att.employeeName}</p>
                                        <Badge variant={getStatusVariant(overallStatus)} className="capitalize">
                                            {overallStatus}
                                        </Badge>
                                    </CardContent>
                                </Card>
                            </button>
                        )
                    })}
                </div>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              Log Attendance for {selectedEmployeeAttendance?.employeeName}
            </DialogTitle>
          </DialogHeader>
          {selectedEmployeeAttendance && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="morningStatus" className="text-right">
                  Morning
                </Label>
                <Select
                  value={selectedEmployeeAttendance.morningStatus}
                  onValueChange={(value: AttendanceStatus) =>
                    handleDialogInputChange("morningStatus", value)
                  }
                  disabled={isPresetSunday}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Present">Present</SelectItem>
                    <SelectItem value="Late">Late</SelectItem>
                    <SelectItem value="Absent">Absent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="morning" className="text-right">
                  Entry Time
                </Label>
                <Input
                  id="morning"
                  type="time"
                  className="col-span-3"
                  value={selectedEmployeeAttendance.morningEntry}
                  onChange={(e) =>
                    handleDialogInputChange("morningEntry", e.target.value)
                  }
                  disabled={selectedEmployeeAttendance.morningStatus === 'Absent' || isPresetSunday}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="afternoonStatus" className="text-right">
                  Afternoon
                </Label>
                <Select
                  value={selectedEmployeeAttendance.afternoonStatus}
                  onValueChange={(value: AttendanceStatus) =>
                    handleDialogInputChange("afternoonStatus", value)
                  }
                  disabled={isMonthlySaturday || isPresetSunday}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Present">Present</SelectItem>
                    <SelectItem value="Late">Late</SelectItem>
                    <SelectItem value="Absent">Absent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="afternoon" className="text-right">
                  Entry Time
                </Label>
                <Input
                  id="afternoon"
                  type="time"
                  className="col-span-3"
                  value={selectedEmployeeAttendance.afternoonEntry}
                  onChange={(e) =>
                    handleDialogInputChange("afternoonEntry", e.target.value)
                  }
                  disabled={selectedEmployeeAttendance.afternoonStatus === 'Absent' || isMonthlySaturday || isPresetSunday}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="overtime" className="text-right">
                  Overtime (hrs)
                </Label>
                <Input
                  id="overtime"
                  type="number"
                  className="col-span-3"
                  min="0"
                  value={selectedEmployeeAttendance.overtimeHours}
                  onChange={(e) =>
                    handleDialogInputChange("overtimeHours", Number(e.target.value))
                  }
                  disabled={selectedEmployeeAttendance.morningStatus === 'Absent' && selectedEmployeeAttendance.afternoonStatus === 'Absent'}
                />
              </div>
               {overtimePay > 0 && (
                 <div className="grid grid-cols-4 items-center gap-4">
                    <p className="col-span-1 text-right text-sm font-medium">Overtime Pay</p>
                    <p className="col-span-3 text-lg font-semibold text-primary">
                        ETB {overtimePay.toFixed(2)}
                    </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveDialog}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
