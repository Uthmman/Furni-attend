
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  parse,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isValid,
  subMonths,
  subWeeks,
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Employee } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Copy, Phone, Trash2, Edit, Calendar } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, doc, deleteDoc } from "firebase/firestore";
import type { AttendanceRecord } from "@/lib/types";
import { EmployeeForm } from "../employee-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";


const getInitials = (name: string) => {
  if (!name) return "";
  const names = name.split(" ");
  return names.map((n) => n[0]).join("").toUpperCase();
};

const calculateHoursWorked = (morningEntry?: string, afternoonEntry?: string): number => {
    if (!morningEntry || !afternoonEntry) return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    const morningEntryTime = parse(morningEntry, "HH:mm", new Date());
    const afternoonEntryTime = parse(afternoonEntry, "HH:mm", new Date());
    
    let totalHours = 0;

    if(morningEntryTime < morningEndTime) {
        const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
        totalHours += morningWorkMs / (1000 * 60 * 60);
    }
    
    if(afternoonEntryTime < afternoonEndTime) {
        const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
        totalHours += afternoonWorkMs / (1000 * 60 * 60);
    }

    return Math.max(0, totalHours);
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

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}


export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { employeeId } = params;
  const { setTitle } = usePageTitle();
  const [_copiedValue, copy] = useCopyToClipboard();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const employeeDocRef = useMemoFirebase(() => {
    if (!firestore || !employeeId || !user) return null;
    return doc(firestore, 'employees', employeeId as string);
  }, [firestore, employeeId, user]);
  
  const { data: employee, loading: employeeLoading } = useDoc(employeeDocRef);

  const attendanceCollectionRef = useMemoFirebase(() => {
    if (!firestore || !employeeId || !user) return null;
    return collection(firestore, 'employees', employeeId as string, 'attendance');
  }, [firestore, employeeId, user]);

  const { data: attendanceRecords, loading: attendanceLoading } = useCollection(attendanceCollectionRef);


  const employeeAttendance = useMemo(() => 
    (attendanceRecords || []).map(r => ({...r, date: getDateFromRecord(r.date)})).sort((a, b) => b.date.getTime() - a.date.getTime()),
    [attendanceRecords]
  );
  
  useEffect(() => {
    if (employee) {
      setTitle(employee.name);
    }
  }, [employee, setTitle]);

  const hourlyRate = useMemo(() => {
    if (!employee) return 0;
    return employee.hourlyRate ||
        (employee.dailyRate ? employee.dailyRate / 8 : 0) ||
        (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
  }, [employee]);

  const firstAttendanceDate = useMemo(() => {
    if (employee?.attendanceStartDate) {
      return new Date(employee.attendanceStartDate);
    }
    if (employeeAttendance.length === 0) return new Date();
    // Since it's sorted descending, last element is the earliest
    return new Date(employeeAttendance[employeeAttendance.length - 1].date);
  }, [employee, employeeAttendance]);

  const periodOptions = useMemo(() => {
    if (!employee || !isValid(firstAttendanceDate)) return [];
    
    const today = new Date();
    const interval = { start: firstAttendanceDate, end: today };
    const options: { value: string, label: string }[] = [];

    if (employee.paymentMethod === 'Monthly') {
      const months = eachMonthOfInterval(interval);
      // Also include current month if not already there
      if (!months.find(m => m.getMonth() === today.getMonth() && m.getFullYear() === today.getFullYear())) {
        months.push(startOfMonth(today));
      }
      months.reverse().forEach(monthStart => {
        options.push({
          value: monthStart.toISOString(),
          label: `${format(monthStart, 'MMMM yyyy')} / ${ethiopianDateFormatter(monthStart, { month: 'long', year: 'numeric' })}`
        });
      });
    } else { // Weekly, Monday to Saturday
       const weeks = eachWeekOfInterval(interval, { weekStartsOn: 1 });
        // Also include current week if not already there
        const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        if (!weeks.find(w => w.getTime() === currentWeekStart.getTime())) {
            weeks.push(currentWeekStart);
        }
      weeks.reverse().forEach(weekStart => {
        const period = { start: startOfWeek(weekStart, { weekStartsOn: 1 }), end: endOfWeek(weekStart, { weekStartsOn: 1 }) };
        const startDay = format(period.start, 'MMM d');
        const endDay = format(period.end, 'MMM d, yyyy');
        const startDayEth = ethiopianDateFormatter(period.start, { day: 'numeric', month: 'short' });
        const endDayEth = ethiopianDateFormatter(period.end, { day: 'numeric', month: 'short', year: 'numeric' });

        options.push({
          value: period.start.toISOString(),
          label: `${startDay} - ${endDay} / ${startDayEth} - ${endDayEth}`
        });
      });
    }
    return options;
  }, [employee, firstAttendanceDate]);

  
  const filteredAttendance = useMemo(() => {
    if (!selectedPeriod || !employee) return [];
    
    const startDate = new Date(selectedPeriod);
    let interval;
    if (employee.paymentMethod === 'Weekly') {
      interval = { start: startOfWeek(startDate, { weekStartsOn: 1 }), end: endOfWeek(startDate, { weekStartsOn: 1 }) };
    } else { // monthly
      interval = { start: startOfMonth(startDate), end: endOfMonth(startDate) };
    }
    return employeeAttendance.filter(r => isWithinInterval(new Date(r.date), interval));
  }, [employeeAttendance, selectedPeriod, employee]);

  const payrollData = useMemo(() => {
    if (!employee) return { hours: 0, amount: 0, daysWorked: 0, overtimePay: 0, totalAmount: 0 };

    const relevantRecords = filteredAttendance.filter(
      (record) => record.morningStatus !== "Absent" || record.afternoonStatus !== "Absent"
    );

    const totalHours = relevantRecords.reduce((acc, record) => {
        let hours = 0;
        if (record.morningStatus !== 'Absent') hours += 4.5; // 8:00 to 12:30
        if (record.afternoonStatus !== 'Absent') hours += 3.5; // 13:30 to 17:00
        return acc + hours;
    }, 0);
    
    const totalOvertimeHours = relevantRecords.reduce((acc, record) => {
        return acc + (record.overtimeHours || 0);
    }, 0);

    const baseAmount = totalHours * (hourlyRate || 0);
    const overtimePay = totalOvertimeHours * (hourlyRate || 0);
    const totalAmount = baseAmount + overtimePay;
    
    const daysWorked = new Set(relevantRecords.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd'))).size

    return {
      hours: totalHours,
      amount: baseAmount,
      daysWorked: daysWorked,
      overtimePay: overtimePay,
      totalAmount: totalAmount
    };
  }, [employee, filteredAttendance, hourlyRate]);

  const handleDelete = async () => {
    if (!employeeId || !firestore) return;
    try {
      await deleteDoc(doc(firestore, "employees", employeeId as string));
      toast({
        title: "Employee Deleted",
        description: `${employee?.name} has been removed from the list.`,
      });
      router.push("/employees");
    } catch (error) {
      console.error("Error deleting employee: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete employee. Please try again.",
      });
    }
  };
  
  useEffect(() => {
    if (periodOptions.length > 0 && !selectedPeriod) {
        setSelectedPeriod(periodOptions[0].value);
    }
  }, [periodOptions, selectedPeriod]);

  if (employeeLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>
  }

  if (!employee) {
    return <div>Employee not found</div>;
  }

  return (
    <div className="flex flex-col gap-6">
       <EmployeeForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        employee={employee}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setIsFormOpen(true)}>
            <Edit className="mr-2 h-4 w-4" /> Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                employee and all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <Card>
            <CardHeader className="items-center">
              <Avatar className="w-24 h-24 text-3xl">
                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
              </Avatar>
              <CardTitle className="pt-4">{employee.name}</CardTitle>
              <Badge variant="secondary">{employee.position}</Badge>
            </CardHeader>
            <CardContent className="text-sm">
                <div className="grid gap-4">
                     {employee.attendanceStartDate && (
                       <div className="flex items-center justify-between">
                            <p className="font-semibold">Start Date</p>
                             <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <p className="text-muted-foreground">{format(new Date(employee.attendanceStartDate), "MMM d, yyyy")} / {ethiopianDateFormatter(new Date(employee.attendanceStartDate), { day: 'numeric', month: 'short', year: 'numeric'})}</p>
                             </div>
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">Phone Number</p>
                        <Button variant="ghost" size="sm" asChild>
                            <a href={`tel:${employee.phone}`}>
                                <Phone className="mr-2 h-4 w-4" />
                                {employee.phone}
                            </a>
                        </Button>
                    </div>
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">Account Number</p>
                        <div className="flex items-center gap-2">
                           <p className="text-muted-foreground">{employee.accountNumber}</p>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(employee.accountNumber)}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div>
                        <p className="font-semibold">Payment Method</p>
                        <Badge variant="outline">{employee.paymentMethod}</Badge>
                    </div>
                    <div>
                        <p className="font-semibold">{employee.paymentMethod} Rate</p>
                        <p className="text-muted-foreground">ETB {employee.monthlyRate || employee.dailyRate || "N/A"}</p>
                    </div>
                    <div>
                        <p className="font-semibold">Calculated Hourly Rate</p>
                        <p className="text-muted-foreground">ETB {hourlyRate.toFixed(2)}</p>
                    </div>
                </div>
            </CardContent>
          </Card>
          
           <Card>
                <CardHeader>
                    <CardTitle>Payroll Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                     <div>
                        <p className="font-semibold">Total Days Worked</p>
                        <p className="text-2xl font-bold">{payrollData.daysWorked.toFixed(0)}</p>
                    </div>
                    <div>
                        <p className="font-semibold">Total Hours Worked</p>
                        <p className="text-2xl font-bold">{payrollData.hours.toFixed(2)}</p>
                    </div>
                    {payrollData.overtimePay > 0 && (
                        <div>
                            <p className="font-semibold">Overtime Pay</p>
                            <p className="text-2xl font-bold">ETB {payrollData.overtimePay.toFixed(2)}</p>
                        </div>
                    )}
                    <div>
                        <p className="font-semibold">Calculated Payroll</p>
                        <p className="text-2xl font-bold text-primary">ETB {payrollData.totalAmount.toFixed(2)}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendance History</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
               <div className="flex flex-col gap-4">
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger>
                          <SelectValue placeholder="Select a period" />
                      </SelectTrigger>
                      <SelectContent>
                          {periodOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
               </div>
              <div className="flex-1 mt-4">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Morning</TableHead>
                        <TableHead>Afternoon</TableHead>
                        <TableHead>Overtime</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredAttendance.length > 0 ? (
                        filteredAttendance.map((record) => (
                        <TableRow key={record.id}>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span>{format(getDateFromRecord(record.date), 'EEE, MMM d')}</span>
                                    <span className="text-xs text-muted-foreground">{ethiopianDateFormatter(getDateFromRecord(record.date), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={record.morningStatus === 'Absent' ? 'destructive' : 'secondary'}>
                                    {record.morningStatus}
                                </Badge>
                                <p className="text-xs text-muted-foreground">{record.morningEntry || 'N/A'}</p>
                            </TableCell>
                            <TableCell>
                                <Badge variant={record.afternoonStatus === 'Absent' ? 'destructive' : 'secondary'}>
                                    {record.afternoonStatus}
                                </Badge>
                                <p className="text-xs text-muted-foreground">{record.afternoonEntry || 'N/A'}</p>
                            </TableCell>
                            <TableCell>{record.overtimeHours ? `${record.overtimeHours} hr(s)` : "N/A"}</TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={5} className="text-center h-24">
                            {selectedPeriod ? "No attendance records for this period." : "Please select a period to view records."}
                        </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
