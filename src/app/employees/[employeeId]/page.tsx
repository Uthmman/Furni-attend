

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
  isWithinInterval,
  parse,
  isValid,
  addDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Employee } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Copy, Phone, Trash2, Edit, Calendar } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, doc, deleteDoc, getDocs } from "firebase/firestore";
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

const calculateHoursWorked = (record: AttendanceRecord): number => {
    if (!record || (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent')) return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    let totalHours = 0;

    if (record.morningStatus !== 'Absent' && record.morningEntry) {
        const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
        if(morningEntryTime < morningEndTime) {
            const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
            totalHours += morningWorkMs / (1000 * 60 * 60);
        }
    }
    
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
        if(afternoonEntryTime < afternoonEndTime) {
            const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
            totalHours += afternoonWorkMs / (1000 * 60 * 60);
        }
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

const getEthiopianMonthDays = (year: number, month: number): number => {
    if (month < 1 || month > 13) return 0;
    if (month <= 12) return 30;
    // Pagume (13th month)
    const isLeap = (year + 1) % 4 === 0;
    return isLeap ? 6 : 5;
};

const toEthiopian = (date: Date) => {
    const ethiopicDate = new Intl.DateTimeFormat('en-US-u-ca-ethiopic', { year: 'numeric', month: 'numeric', day: 'numeric' });
    const parts = ethiopicDate.formatToParts(date);
    let day = '1', month = '1', year = '1970';
    for (const part of parts) {
        if (part.type === 'day') day = part.value;
        if (part.type === 'month') month = part.value;
        if (part.type === 'year') year = part.value;
    }
    return {
        day: parseInt(day),
        month: parseInt(month),
        year: parseInt(year),
    };
};

const toGregorian = (ethYear: number, ethMonth: number, ethDay: number): Date => {
    // This is an approximation. For exact conversion, a library is better.
    // The core idea is to find an anchor date and calculate the offset.
    // Anchor: 1st day of Meskerem 1 EC is Sep 11, 8 AD (Julian).
    // Let's use a simpler, albeit less accurate, approximation based on offsets from today.
    const today = new Date();
    const ethToday = toEthiopian(today);

    // Approximate days since our epoch
    const ethDays = (ethYear - ethToday.year) * 365.25 + (ethMonth - ethToday.month) * 30 + (ethDay - ethToday.day);
    
    return addDays(today, Math.round(ethDays));
};


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

  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  const employeeDocRef = useMemoFirebase(() => {
    if (!firestore || !employeeId || !user) return null;
    return doc(firestore, 'employees', employeeId as string);
  }, [firestore, employeeId, user]);
  
  const { data: employee, loading: employeeLoading } = useDoc(employeeDocRef);
  
  useEffect(() => {
    const fetchAllAttendance = async () => {
        if (!firestore || !employee?.attendanceStartDate) {
            setAttendanceLoading(false);
            return;
        }
        setAttendanceLoading(true);

        const allRecords: AttendanceRecord[] = [];
        let date = new Date(employee.attendanceStartDate);
        const today = new Date();

        while (date <= today) {
            const dateStr = format(date, "yyyy-MM-dd");
            const attColRef = collection(firestore, 'attendance', dateStr, 'records');
            try {
                const querySnapshot = await getDocs(attColRef);
                querySnapshot.forEach(docSnap => {
                    if(docSnap.data().employeeId === employeeId) {
                        allRecords.push({ id: `${dateStr}-${docSnap.id}`, ...docSnap.data() } as AttendanceRecord);
                    }
                });
            } catch(e) {
                 const permissionError = new FirestorePermissionError({
                    path: attColRef.path,
                    operation: 'list',
                });
                errorEmitter.emit('permission-error', permissionError);
            }
            date = addDays(date, 1);
        }
        
        setAllAttendance(allRecords);
        setAttendanceLoading(false);
    };

    if (!isUserLoading && employee) {
        fetchAllAttendance();
    }
  }, [firestore, employeeId, isUserLoading, employee]);


  const employeeAttendance = useMemo(() => 
    (allAttendance || []).map(r => ({...r, date: getDateFromRecord(r.date)})).sort((a, b) => b.date.getTime() - a.date.getTime()),
    [allAttendance]
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
    return new Date();
  }, [employee]);

  const periodOptions = useMemo(() => {
    if (!employee || !isValid(firstAttendanceDate)) return [];
    
    const today = new Date();
    const options: { value: string, label: string }[] = [];

    if (employee.paymentMethod === 'Monthly') {
        let currentMonthStart = toGregorian(toEthiopian(today).year, toEthiopian(today).month, 1);
        
        for(let i=0; i < 12; i++){
            const ethDate = toEthiopian(currentMonthStart);
            const monthStart = toGregorian(ethDate.year, ethDate.month, 1);
            
            // Heuristic to check if we've gone too far back in time
            if (monthStart < addDays(firstAttendanceDate, -31)) break;

            const monthName = ethiopianDateFormatter(monthStart, { month: 'long' });
            options.push({
                value: monthStart.toISOString(),
                label: `${monthName} ${ethDate.year}`
            });

            // Go to previous month
            const prevMonthDate = addDays(monthStart, -5); // Go back a few days to be sure we are in the previous month
            const prevEthDate = toEthiopian(prevMonthDate);
            currentMonthStart = toGregorian(prevEthDate.year, prevEthDate.month, 1);
        }

    } else { // Weekly
        let currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 }); // Start of current week (Sunday)
        for(let i=0; i<12; i++){
            const weekStart = currentWeekStart;
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
            if (weekEnd < firstAttendanceDate) break;
            
            const startDayEth = ethiopianDateFormatter(weekStart, { day: 'numeric', month: 'short' });
            const endDayEth = ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' });
            
            options.push({
                value: weekStart.toISOString(),
                label: `${startDayEth} - ${endDayEth}`
            });
            currentWeekStart = addDays(currentWeekStart, -7);
        }
    }
    return options;
  }, [employee, firstAttendanceDate]);

  
  const filteredAttendance = useMemo(() => {
    if (!selectedPeriod || !employee) return [];
    
    const startDate = new Date(selectedPeriod);
    let interval;
    if (employee.paymentMethod === 'Weekly') {
      const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
      interval = { start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 0 }) };
    } else { // monthly
      const ethDate = toEthiopian(startDate);
      const daysInMonth = getEthiopianMonthDays(ethDate.year, ethDate.month);
      interval = { start: startDate, end: addDays(startDate, daysInMonth - 1) };
    }
    return employeeAttendance.filter(r => isWithinInterval(new Date(r.date), interval));
  }, [employeeAttendance, selectedPeriod, employee]);

  const payrollData = useMemo(() => {
    if (!employee) return { hours: 0, amount: 0, daysWorked: 0, overtimePay: 0, totalAmount: 0 };

    const totalOvertimeHours = filteredAttendance.reduce((acc, record) => {
        return acc + (record.overtimeHours || 0);
    }, 0);
    
    const totalHours = filteredAttendance.reduce((acc, record) => {
        return acc + calculateHoursWorked(record);
    }, 0);

    const baseAmount = totalHours * (hourlyRate || 0);
    const overtimePay = totalOvertimeHours * (hourlyRate || 0);
    const totalAmount = baseAmount + overtimePay;
    
    const daysWorked = new Set(filteredAttendance.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd'))).size

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
       const permissionError = new FirestorePermissionError({
          path: `employees/${employeeId}`,
          operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
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
                                <p className="text-muted-foreground">{format(new Date(employee.attendanceStartDate), "MMM d, yyyy")} / {ethiopianDateFormatter(new Date(employee.attendanceStartDate), { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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


    

    