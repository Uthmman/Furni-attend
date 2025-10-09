
"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import type { AttendanceRecord, Employee } from "@/lib/types";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useCollection, useFirestore, useMemoFirebase, errorEmitter, FirestorePermissionError, useUser } from "@/firebase";
import { collection, doc, writeBatch, type CollectionReference, type Query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

type DailyAttendance = {
  employeeId: string;
  employeeName: string;
  status: "Present" | "Absent" | "Late";
  morningEntry?: string;
  afternoonEntry?: string;
  overtimeHours?: number;
};

const getStatusVariant = (status: "Present" | "Absent" | "Late") => {
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
        return {
          employeeId: emp.id,
          employeeName: emp.name,
          status: record?.status || "Present",
          morningEntry: record?.morningEntry || "",
          afternoonEntry: record?.afternoonEntry || "",
          overtimeHours: record?.overtimeHours || 0,
        };
      });
      setAttendance(dailyAttendance);
    }
  }, [employees, attendanceRecords]);


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
       if (field === 'status' && value === 'Absent') {
            updated.morningEntry = "";
            updated.afternoonEntry = "";
            updated.overtimeHours = 0;
        }
      setSelectedEmployeeAttendance(updated);
    }
  };

  const handleSaveDialog = () => {
    if (selectedEmployeeAttendance) {
      setAttendance((prev) =>
        prev.map((att) =>
          att.employeeId === selectedEmployeeAttendance.employeeId
            ? selectedEmployeeAttendance
            : att
        )
      );
    }
    setIsDialogOpen(false);
    setSelectedEmployeeAttendance(null);
  };
  
  const selectedEmployeeDetails: Employee | undefined = useMemo(() => {
      return employees?.find(e => e.id === selectedEmployeeAttendance?.employeeId);
  }, [selectedEmployeeAttendance, employees]);

  const hourlyRate: number = useMemo(() => {
    if (!selectedEmployeeDetails) return 0;
    return selectedEmployeeDetails.hourlyRate ||
        (selectedEmployeeDetails.dailyRate ? selectedEmployeeDetails.dailyRate / 8 : 0) ||
        (selectedEmployeeDetails.monthlyRate ? selectedEmployeeDetails.monthlyRate / 22 / 8 : 0);
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

        const record: Omit<AttendanceRecord, 'id' | 'date'> & { date: string } = {
            employeeId: att.employeeId,
            date: selectedDate.toISOString(),
            status: att.status,
            morningEntry: att.morningEntry || "",
            afternoonEntry: att.afternoonEntry || "",
            overtimeHours: att.overtimeHours || 0,
        };
        batch.set(recordRef, record);
        batch.set(employeeAttendanceRef, record);
    });

    batch.commit()
        .then(() => {
            toast({ title: "Attendance saved!" });
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
              />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Employee Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
                {attendanceLoading && <p>Loading attendance...</p>}
                {!attendanceLoading && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {attendance.map((att) => (
                        <button key={att.employeeId} onClick={() => openDialogForEmployee(att.employeeId)} className="text-left">
                            <Card className="hover:bg-accent transition-colors">
                                <CardContent className="flex items-center justify-between p-4">
                                    <p className="font-medium">{att.employeeName}</p>
                                    <Badge variant={getStatusVariant(att.status)} className="capitalize">
                                        {att.status}
                                    </Badge>
                                </CardContent>
                            </Card>
                        </button>
                    ))}
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
                <Label htmlFor="status" className="text-right">
                  Status
                </Label>
                <Select
                  value={selectedEmployeeAttendance.status}
                  onValueChange={(value: "Present" | "Absent" | "Late") =>
                    handleDialogInputChange("status", value)
                  }
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
                  Morning
                </Label>
                <Input
                  id="morning"
                  type="time"
                  className="col-span-3"
                  value={selectedEmployeeAttendance.morningEntry}
                  onChange={(e) =>
                    handleDialogInputChange("morningEntry", e.target.value)
                  }
                  disabled={selectedEmployeeAttendance.status === 'Absent'}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="afternoon" className="text-right">
                  Afternoon
                </Label>
                <Input
                  id="afternoon"
                  type="time"
                  className="col-span-3"
                  value={selectedEmployeeAttendance.afternoonEntry}
                  onChange={(e) =>
                    handleDialogInputChange("afternoonEntry", e.target.value)
                  }
                  disabled={selectedEmployeeAttendance.status === 'Absent'}
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
                  disabled={selectedEmployeeAttendance.status === 'Absent'}
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
