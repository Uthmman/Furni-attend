"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
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
  getDay,
  eachDayOfInterval,
  startOfDay,
  endOfDay,
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Employee } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Copy, Phone, Trash2, Edit, Calendar } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from "@/firebase";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";


const getInitials = (name: string) => {
  if (!name) return "";
  const names = name.split(" ");
  return names.map((n) => n[0]).join("").toUpperCase();
};

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}

const calculateHoursWorked = (record: AttendanceRecord): number => {
    if (!record) return 0;
    const recordDate = getDateFromRecord(record.date);

    if (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent') return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    let totalHours = 0;

    if (record.morningStatus !== 'Absent' && record.morningEntry) {
        try {
            const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
            if(isValid(morningEntryTime) && morningEntryTime < morningEndTime) {
                const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
                totalHours += morningWorkMs / (1000 * 60 * 60);
            }
        } catch(e){}
    }
    
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        try {
            const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
            if(isValid(afternoonEntryTime) && afternoonEntryTime < afternoonEndTime) {
                const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
                totalHours += afternoonWorkMs / (1000 * 60 * 60);
            }
        } catch(e){}
    }

    return Math.max(0, totalHours);
};


const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  if (!isValid(date)) return "Invalid Date";
  try {
      const customOptions: Intl.DateTimeFormatOptions = { ...options };
        if (customOptions.era) delete customOptions.era;
      return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", customOptions).format(date);
  } catch (e) {
      console.error("Error formatting Ethiopian date:", e);
      return "Invalid Date";
  }
};

const getEthiopianMonthDays = (year: number, month: number): number => {
    if (month < 1 || month > 13) return 0;
    if (month <= 12) return 30;
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
    // Robust search logic with noon-reference
    let date = new Date(ethYear + 7, ethMonth + 7, ethDay, 12, 0, 0);
    for (let i = 0; i < 60; i++) {
        const eth = toEthiopian(date);
        if (eth.year === ethYear && eth.month === ethMonth && eth.day === ethDay) {
            return startOfDay(date);
        }
        if (eth.year < ethYear || (eth.year === ethYear && eth.month < ethMonth) || (eth.year === ethYear && eth.month === ethMonth && eth.day < ethDay)) {
            date.setDate(date.getDate() + 1);
        } else {
            date.setDate(date.getDate() - 1);
        }
    }
    return startOfDay(date);
};

const getMonthlyWorkingUnits = (monthStart: Date, daysInMonth: number) => {
    const interval = { start: monthStart, end: addDays(monthStart, daysInMonth - 1) };
    const days = eachDayOfInterval(interval);
    let weekdays = 0;
    let saturdays = 0;
    days.forEach(day => {
        const d = getDay(day);
        if (d >= 1 && d <= 5) weekdays++;
        else if (d === 6) saturdays++;
    });
    return weekdays + (saturdays * 0.5625);
};

const calculateMinutesLate = (record: AttendanceRecord): number => {
    if (!record) return 0;
    let minutesLate = 0;
    if (record.morningStatus === 'Late' && record.morningEntry) {
        const morningStartTime = parse("08:00", "HH:mm", new Date());
        try {
            const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
            if (isValid(morningEntryTime) && morningEntryTime > morningStartTime) {
                minutesLate += (morningEntryTime.getTime() - morningStartTime.getTime()) / (1000 * 60);
            }
        } catch(e) {}
    }
    if (record.afternoonStatus === 'Late' && record.afternoonEntry) {
        const afternoonStartTime = parse("13:30", "HH:mm", new Date());
        try {
            const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
            if (isValid(afternoonEntryTime) && afternoonEntryTime > afternoonStartTime) {
                minutesLate += (afternoonEntryTime.getTime() - afternoonStartTime.getTime()) / (1000 * 60);
            }
        } catch(e) {}
    }
    return Math.round(minutesLate);
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
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");

  const employeeDocRef = useMemoFirebase(() => {
    if (!firestore || !employeeId || !user) return null;
    return doc(firestore, 'employees', employeeId as string);
  }, [firestore, employeeId, user]);
  
  const { data: employee, loading: employeeLoading } = useDoc(employeeDocRef);
  
  const attendanceColRef = useMemoFirebase(() => {
      if (!firestore || !employeeId || !user) return null;
      return collection(firestore, 'employees', employeeId as string, 'attendance');
  }, [firestore, employeeId, user]);
  const { data: allAttendance, isLoading: attendanceLoading } = useCollection<AttendanceRecord>(attendanceColRef);
  
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);

  const employeeAttendance = useMemo(() => 
    (allAttendance || []).map(r => ({...r, date: getDateFromRecord(r.date)})).sort((a, b) => b.date.getTime() - a.date.getTime()),
    [allAttendance]
  );
  
  useEffect(() => {
    if (employee) {
      setTitle(employee.name);
    }
  }, [employee, setTitle]);

  const firstAttendanceDate = useMemo(() => {
    if (employee?.attendanceStartDate) {
      return startOfDay(new Date(employee.attendanceStartDate));
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
            
            if (monthStart < addDays(firstAttendanceDate, -31)) break;

            const monthName = ethiopianDateFormatter(monthStart, { month: 'long' });
            options.push({
                value: format(monthStart, "yyyy-MM-dd"),
                label: `${monthName} ${ethDate.year}`
            });

            const prevMonthDate = addDays(monthStart, -5); 
            const prevEthDate = toEthiopian(prevMonthDate);
            currentMonthStart = toGregorian(prevEthDate.year, prevEthDate.month, 1);
        }

    } else { // Weekly
        let currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 }); 
        for(let i=0; i<12; i++){
            const weekStart = currentWeekStart;
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
            if (weekEnd < firstAttendanceDate) break;
            
            const startDayEth = ethiopianDateFormatter(weekStart, { day: 'numeric', month: 'short' });
            const endDayEth = ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' });
            
            options.push({
                value: format(weekStart, "yyyy-MM-dd"),
                label: `${startDayEth} - ${endDayEth}`
            });
            currentWeekStart = addDays(currentWeekStart, -7);
        }
    }
    return options;
  }, [employee, firstAttendanceDate]);

  
  const filteredAttendance = useMemo(() => {
    if (!selectedPeriod || !employee) return [];
    
    const startDate = startOfDay(new Date(selectedPeriod));
    let interval;
    if (employee.paymentMethod === 'Weekly') {
      const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
      interval = { start: startOfDay(weekStart), end: endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 })) };
    } else { // monthly
      const ethDate = toEthiopian(startDate);
      const daysInMonthCount = getEthiopianMonthDays(ethDate.year, ethDate.month);
      interval = { start: startOfDay(startDate), end: endOfDay(addDays(startDate, daysInMonthCount - 1)) };
    }
    return employeeAttendance.filter(r => isWithinInterval(new Date(r.date), interval));
  }, [employeeAttendance, selectedPeriod, employee]);

  const payrollData = useMemo(() => {
    if (!employee || !selectedPeriod) return { totalAmount: 0, periodLabel: "" };

    const selectedPeriodLabel = periodOptions.find(o => o.value === selectedPeriod)?.label || "";

    if (employee.paymentMethod === 'Monthly') {
        const baseSalary = employee.monthlyRate || 0;
        const startDate = startOfDay(new Date(selectedPeriod));
        const ethDate = toEthiopian(startDate);
        const daysInMonthCount = getEthiopianMonthDays(ethDate.year, ethDate.month);
        const workingUnits = getMonthlyWorkingUnits(startDate, daysInMonthCount);
        
        const hourlyRateCalc = baseSalary / workingUnits / 8;
        const minuteRate = hourlyRateCalc / 60;
        
        const ethYearForPeriod = ethDate.year;
        const permissionDatesInYear = new Set<string>();
        (allAttendance || []).forEach(rec => {
            const recDate = getDateFromRecord(rec.date);
            if (toEthiopian(recDate).year === ethYearForPeriod) {
                if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') {
                    permissionDatesInYear.add(format(recDate, 'yyyy-MM-dd'));
                }
            }
        });
        const sortedPermissionDates = Array.from(permissionDatesInYear).sort();
        const allowedPermissionDates = new Set(sortedPermissionDates.slice(0, 15));


        const absentDates: string[] = [];
        const lateDates: string[] = [];
        let totalHoursAbsent = 0;
        const minutesLate = filteredAttendance.reduce((acc, r) => {
            const recordDate = getDateFromRecord(r.date);
            const formattedDate = format(recordDate, 'MMM d');
            let isAbsent = false;
            
            const recordDateStr = format(recordDate, 'yyyy-MM-dd');
            const isSaturday = getDay(recordDate) === 6;

            let morningIsUnpaidAbsence = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));
            let afternoonIsUnpaidAbsence = !isSaturday && (r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr)));

            if (morningIsUnpaidAbsence) {
                totalHoursAbsent += 4.5;
                isAbsent = true;
            }
            if (afternoonIsUnpaidAbsence) {
                totalHoursAbsent += 3.5;
                isAbsent = true;
            }

            if(isAbsent && !absentDates.includes(formattedDate)) {
                absentDates.push(formattedDate);
            }
            
            const currentMinutesLate = calculateMinutesLate(r);
            if (currentMinutesLate > 0 && !lateDates.includes(formattedDate)) {
                lateDates.push(formattedDate);
            }
            return acc + currentMinutesLate;
        }, 0);

        const interval = { start: startDate, end: addDays(startDate, daysInMonthCount - 1) };
        const periodDays = eachDayOfInterval(interval);
        const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));
        const recordedDates = new Set(filteredAttendance.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

        const today = new Date();
        periodDays.forEach(day => {
            if (day >= employeeStartDate && getDay(day) !== 0 && day <= today) {
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    const formattedDate = format(day, 'MMM d');
                    if (getDay(day) === 6) { 
                        totalHoursAbsent += 4.5;
                    } else {
                        totalHoursAbsent += 8;
                    }
                     if(!absentDates.includes(formattedDate)) {
                        absentDates.push(formattedDate);
                    }
                }
            }
        });

      const absenceDeduction = totalHoursAbsent * hourlyRateCalc;
      const lateDeduction = minutesLate * minuteRate;

      const overtimeHours = filteredAttendance.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
      const overtimePay = overtimeHours * hourlyRateCalc;
      
      const netSalary = baseSalary - (absenceDeduction + lateDeduction) + overtimePay;

      return {
          totalAmount: netSalary,
          baseSalary: baseSalary,
          lateDeduction: lateDeduction,
          absenceDeduction: absenceDeduction,
          hoursAbsent: totalHoursAbsent,
          minutesLate: minutesLate,
          periodLabel: selectedPeriodLabel,
          absentDates: absentDates,
          lateDates: lateDates,
          overtimePay: overtimePay,
          overtimeHours: overtimeHours,
          hourlyRate: hourlyRateCalc
      };

    } else { // Weekly logic
      const currentHourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
      const totalOvertimeHours = filteredAttendance.reduce((acc, record) => {
          return acc + (record.overtimeHours || 0);
      }, 0);
      
      let totalHours = filteredAttendance.reduce((acc, record) => {
          return acc + calculateHoursWorked(record);
      }, 0);

      const overtimePay = totalOvertimeHours * (currentHourlyRate || 0);
      
      let totalMinutesLate = 0;
      let totalHoursAbsent = 0;

      if (selectedPeriod) {
          const startDate = startOfDay(new Date(selectedPeriod));
          const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
          const interval = { start: startOfDay(weekStart), end: endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 })) };
          const periodDays = eachDayOfInterval(interval);
          const recordedDates = new Set(filteredAttendance.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
          const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));
          const today = new Date();

          periodDays.forEach(day => {
              if (day >= employeeStartDate && day <= today) {
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    if(getDay(day) === 6){ // Saturday
                        totalHoursAbsent += 4.5;
                    } else if (getDay(day) !== 0) {
                        totalHoursAbsent += 8;
                    }
                }
              }
          });
      }

      filteredAttendance.forEach(record => {
          totalMinutesLate += calculateMinutesLate(record);
      });
      
      const baseAmount = totalHours * (currentHourlyRate || 0);
      const totalAmount = baseAmount + overtimePay;
      
      const daysWorked = new Set(filteredAttendance.filter(r => r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent').map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd'))).size;

      return {
        hours: totalHours,
        daysWorked: daysWorked,
        overtimePay: overtimePay,
        totalAmount: totalAmount,
        periodLabel: selectedPeriodLabel,
        hoursAbsent: totalHoursAbsent,
        minutesLate: totalMinutesLate,
        overtimeHours: totalOvertimeHours,
        hourlyRate: currentHourlyRate
      };
    }
  }, [employee, allAttendance, filteredAttendance, periodOptions, selectedPeriod]);

  const handleViewSummary = () => {
    if (!employee || !payrollData) return;

    let summaryMessage = `Payroll Summary for ${employee.name}\n`;
    summaryMessage += `Period: ${payrollData.periodLabel}\n\n`;

    if (employee.paymentMethod === 'Monthly') {
      summaryMessage += `Base Salary: ETB ${(payrollData.baseSalary || 0).toFixed(2)}\n`;
      if ((payrollData.lateDeduction || 0) > 0) {
        summaryMessage += `Late Deduction (${payrollData.minutesLate || 0} mins): - ETB ${(payrollData.lateDeduction || 0).toFixed(2)}\n`;
      }
      if ((payrollData.absenceDeduction || 0) > 0) {
        summaryMessage += `Absence Deduction (${(payrollData.hoursAbsent || 0).toFixed(1)} hrs): - ETB ${(payrollData.absenceDeduction || 0).toFixed(2)}\n`;
      }
      if ((payrollData.overtimePay || 0) > 0) {
        summaryMessage += `Overtime Pay (${payrollData.overtimeHours} hrs): + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
      }
      summaryMessage += `--------------------\n`;
      summaryMessage += `Net Salary: ETB ${(payrollData.totalAmount || 0).toFixed(2)}`;
    } else { // Weekly
      summaryMessage += `Base Pay (${(payrollData.hours || 0).toFixed(2)} hrs): ETB ${( (payrollData.hours || 0) * (payrollData.hourlyRate || 0)).toFixed(2)}\n`;
      if ((payrollData.overtimePay || 0) > 0) {
        summaryMessage += `Overtime Pay (${payrollData.overtimeHours} hrs): + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
      }
      summaryMessage += `--------------------\n`;
      summaryMessage += `Total Payout: ETB ${(payrollData.totalAmount || 0).toFixed(2)}`;
    }
    
    setSummaryText(summaryMessage);
    setIsSummaryDialogOpen(true);
  };
  
  const handleCopyToClipboard = () => {
    copy(summaryText);
    toast({
      title: "Copied to clipboard!",
    });
  }

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
  
  const renderAttendanceBadge = (status: string) => {
    return (
      <Badge 
        variant={status === 'Absent' ? 'destructive' : 'outline'}
        className={cn(
          "shadow-none px-1.5 h-5 text-[10px]",
          status === 'Present' && "bg-secondary text-secondary-foreground border-transparent",
          status === 'Late' && "bg-amber-100 text-amber-700 border-amber-200",
          status === 'Permission' && "bg-blue-100 text-blue-700 border-blue-200"
        )}
      >
        {status}
      </Badge>
    );
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
       <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payroll Summary</DialogTitle>
            <DialogDescription>
              For {employee.name} covering {payrollData.periodLabel}
            </DialogDescription>
          </DialogHeader>
          <Textarea readOnly value={summaryText} rows={10} className="text-sm font-mono" />
          <DialogFooter>
             <Button variant="secondary" onClick={handleCopyToClipboard}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline [&>svg]:ml-auto">
                  <div className="flex items-center gap-4 text-left w-full">
                      <Avatar className="w-20 h-20 text-3xl">
                          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-grow">
                          <CardTitle>{employee.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary">{employee.position}</Badge>
                            <Badge variant={employee.status === 'Inactive' ? 'destructive' : 'default'}>{employee.status || 'Active'}</Badge>
                          </div>
                      </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="text-sm pt-0">
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
                          <p className="font-semibold">Current Period Hourly Rate</p>
                          <p className="text-muted-foreground">ETB {payrollData.hourlyRate?.toFixed(2) || "N/A"}</p>
                      </div>
                    </div>
                  </CardContent>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
          
           <Card>
              <CardHeader>
                <CardTitle>Select Period</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          
           <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle>Payroll Summary</CardTitle>
                        <CardDescription>{payrollData.periodLabel}</CardDescription>
                    </div>
                    <Button variant="outline" size="icon" onClick={handleViewSummary}>
                        <Copy className="h-4 w-4" />
                        <span className="sr-only">View Summary</span>
                    </Button>
                </CardHeader>
                <CardContent className="grid gap-4 pt-4">
                     {employee.paymentMethod === 'Monthly' ? (
                        <>
                            <div>
                                <p className="font-semibold">Base Salary</p>
                                <p className="text-2xl font-bold">ETB {(payrollData.baseSalary || 0).toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="font-semibold">Late Deduction ({payrollData.minutesLate || 0} mins)</p>
                                <p className="text-xl font-bold text-amber-600">- ETB {(payrollData.lateDeduction || 0).toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="font-semibold">Absence Deduction ({(payrollData.hoursAbsent || 0).toFixed(1)} hrs)</p>
                                <p className="text-xl font-bold text-destructive">- ETB {(payrollData.absenceDeduction || 0).toFixed(2)}</p>
                            </div>
                            {(payrollData.overtimePay || 0) > 0 && (
                                <div>
                                    <p className="font-semibold">Overtime Pay ({payrollData.overtimeHours} hrs)</p>
                                    <p className="text-xl font-bold text-primary">+ ETB {(payrollData.overtimePay || 0).toFixed(2)}</p>
                                </div>
                            )}
                            <div>
                                <p className="font-semibold">Net Salary</p>
                                <p className="text-2xl font-bold text-primary">ETB {(payrollData.totalAmount || 0).toFixed(2)}</p>
                            </div>
                        </>
                    ) : (
                        <>
                             <div>
                                <p className="font-semibold">Base Pay ({(payrollData.hours || 0).toFixed(2)} hrs)</p>
                                <p className="text-2xl font-bold">ETB {( (payrollData.hours || 0) * (payrollData.hourlyRate || 0)).toFixed(2)}</p>
                            </div>
                            {(payrollData.overtimePay || 0) > 0 && (
                                <div>
                                    <p className="font-semibold">Overtime Pay ({payrollData.overtimeHours} hrs)</p>
                                    <p className="text-2xl font-bold">ETB {(payrollData.overtimePay || 0).toFixed(2)}</p>
                                </div>
                            )}
                            <div>
                                <p className="font-semibold">Total Payout</p>
                                <p className="text-2xl font-bold text-primary">ETB {(payrollData.totalAmount || 0).toFixed(2)}</p>
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
                                <p>Days Worked: {(payrollData.daysWorked || 0)}</p>
                                <p>Hours Absent: {(payrollData.hoursAbsent || 0).toFixed(1)}</p>
                                <p>Minutes Late: {Math.round(payrollData.minutesLate || 0)}</p>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendance History</CardTitle>
               <CardDescription>{payrollData.periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-[100px]">Date</TableHead>
                        <TableHead>Morning</TableHead>
                        <TableHead>Afternoon</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredAttendance.length > 0 ? (
                        filteredAttendance.map((record) => (
                        <TableRow key={record.id}>
                            <TableCell>
                                <div className="flex flex-col min-w-[80px]">
                                    <span className="font-medium whitespace-nowrap">{format(getDateFromRecord(record.date), 'EEE, MMM d')}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase whitespace-nowrap">{ethiopianDateFormatter(getDateFromRecord(record.date), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                  {renderAttendanceBadge(record.morningStatus)}
                                  {record.morningEntry && <p className="text-[10px] font-mono text-muted-foreground">{record.morningEntry}</p>}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                  {renderAttendanceBadge(record.afternoonStatus)}
                                  <div className="flex flex-col">
                                    {record.afternoonEntry && <p className="text-[10px] font-mono text-muted-foreground">{record.afternoonEntry}</p>}
                                    {record.overtimeHours ? (
                                        <Badge variant="secondary" className="w-fit text-[9px] h-4 px-1 mt-0.5 bg-primary/10 text-primary border-none whitespace-nowrap">
                                            +{record.overtimeHours}h OT
                                        </Badge>
                                    ) : null}
                                  </div>
                                </div>
                            </TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={3} className="text-center h-24">
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
