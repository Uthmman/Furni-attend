
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
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
import type { Employee, PayrollSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Copy, Phone, Trash2, Edit, Calendar, UserMinus, Send, Loader2, XCircle } from "lucide-react";
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
import { sendAdminPayrollSummary } from "@/app/payroll/actions";


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

    if (getDay(recordDate) === 0) { // Sunday check
        if (record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent') return 8;
        return 0;
    }

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
    // Saturdays counted as 0.5625 units because missing afternoon is not deducted (4.5h work)
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
  const [isSending, setIsSending] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

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
  
  const settingsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'metadata', 'payroll_settings');
  }, [firestore, user]);
  const { data: settings } = useDoc<PayrollSettings>(settingsRef);
  
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

  const displayedHistory = useMemo(() => {
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

    const days = eachDayOfInterval(interval);
    const today = new Date();
    const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));

    return days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existingRecord = employeeAttendance.find(r => r.id === dateStr);
        
        if (existingRecord) return existingRecord;

        // Create a virtual record for missing days in the past
        const isPast = day <= today;
        const hasStarted = day >= employeeStartDate;
        const isSunday = getDay(day) === 0;

        return {
            id: dateStr,
            employeeId: employee.id,
            date: day.toISOString(),
            morningStatus: (isPast && hasStarted && !isSunday) ? 'Absent' : 'Present',
            afternoonStatus: (isPast && hasStarted && !isSunday) ? 'Absent' : 'Present',
            isVirtual: true,
        } as any;
    }).reverse(); // Latest dates at the top
  }, [employeeAttendance, selectedPeriod, employee]);

  const payrollData = useMemo(() => {
    if (!employee || !selectedPeriod) return { totalAmount: 0, periodLabel: "" };

    const normalOTRate = settings?.normalOvertimeRate || 1.5;
    const sundayOTRate = settings?.sundayOvertimeRate || 2.0;

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
        let sundayOTAmount = 0;
        let sundayOTHours = 0;

        const filteredAttendanceRecords = employeeAttendance.filter(r => {
             const startDate = startOfDay(new Date(selectedPeriod));
             const ethDate = toEthiopian(startDate);
             const daysInMonthCount = getEthiopianMonthDays(ethDate.year, ethDate.month);
             const interval = { start: startOfDay(startDate), end: endOfDay(addDays(startDate, daysInMonthCount - 1)) };
             return isWithinInterval(new Date(r.date), interval);
        });

        const minutesLate = filteredAttendanceRecords.reduce((acc, r) => {
            const recordDateStr = r.id; 
            if (!recordDateStr) return acc;
            
            const recordDate = parse(recordDateStr, "yyyy-MM-dd", new Date());
            const formattedDate = format(recordDate, 'MMM d');
            const isSaturday = getDay(recordDate) === 6;
            const isSunday = getDay(recordDate) === 0;

            if (isSunday) {
                const isWorking = r.morningStatus === 'Present' || r.morningStatus === 'Late' || r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late';
                if (isWorking) {
                    sundayOTAmount += 8 * hourlyRateCalc * sundayOTRate;
                    sundayOTHours += 8;
                }
                return acc;
            }

            let morningIsUnpaidAbsence = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));
            let afternoonIsUnpaidAbsence = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));

            if (morningIsUnpaidAbsence) {
                totalHoursAbsent += 4.5;
            }
            
            // POLICY: Monthly staff afternoon absence on Saturday is NOT deducted
            if (afternoonIsUnpaidAbsence && !isSaturday) {
                totalHoursAbsent += 3.5;
            }

            const currentMinutesLate = calculateMinutesLate(r);
            return acc + currentMinutesLate;
        }, 0);

        const interval = { start: startDate, end: addDays(startDate, daysInMonthCount - 1) };
        const periodDays = eachDayOfInterval(interval);
        const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));
        const recordedDates = new Set(filteredAttendanceRecords.map(r => r.id));

        const today = new Date();
        periodDays.forEach(day => {
            if (day >= employeeStartDate && getDay(day) !== 0 && day <= today) {
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    if (getDay(day) === 6) {
                        totalHoursAbsent += 4.5; // Saturday unrecorded is only 4.5h deduction
                    } else {
                        totalHoursAbsent += 8;
                    }
                }
            }
        });

      const absenceDeduction = totalHoursAbsent * hourlyRateCalc;
      const lateDeduction = minutesLate * minuteRate;

      const manualOTHours = filteredAttendanceRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
      const manualOTPay = manualOTHours * hourlyRateCalc * normalOTRate;
      
      const totalOTPay = manualOTPay + sundayOTAmount;
      const netSalary = baseSalary - (absenceDeduction + lateDeduction) + totalOTPay;

      return {
          totalAmount: netSalary,
          baseSalary: baseSalary,
          lateDeduction: lateDeduction,
          absenceDeduction: absenceDeduction,
          hoursAbsent: totalHoursAbsent,
          minutesLate: minutesLate,
          periodLabel: selectedPeriodLabel,
          overtimePay: totalOTPay,
          overtimeHours: manualOTHours + sundayOTHours,
          hourlyRate: hourlyRateCalc
      };

    } else { // Weekly logic
      const currentHourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
      
      const startDate = startOfDay(new Date(selectedPeriod));
      const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
      const interval = { start: startOfDay(weekStart), end: endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 })) };
      
      const relevantAttendance = employeeAttendance.filter(r => isWithinInterval(new Date(r.date), interval));

      const totalOTHours = relevantAttendance.reduce((acc, record) => {
          return acc + (record.overtimeHours || 0);
      }, 0);
      
      let totalHours = relevantAttendance.reduce((acc, record) => {
          return acc + calculateHoursWorked(record);
      }, 0);

      const overtimePay = totalOTHours * (currentHourlyRate || 0) * normalOTRate;
      
      let totalMinutesLate = 0;
      let totalHoursAbsent = 0;

      const periodDays = eachDayOfInterval(interval);
      const recordedDates = new Set(relevantAttendance.map(r => r.id));
      const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));
      const today = new Date();

      periodDays.forEach(day => {
          if (day >= employeeStartDate && day <= today) {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (!recordedDates.has(dayStr)) {
                if (getDay(day) !== 0) {
                    totalHoursAbsent += 8; 
                }
            }
          }
      });

      relevantAttendance.forEach(record => {
          totalMinutesLate += calculateMinutesLate(record);
          if (record.morningStatus === 'Absent') totalHoursAbsent += 4.5;
          if (record.afternoonStatus === 'Absent') totalHoursAbsent += 3.5;
      });
      
      const baseAmount = totalHours * (currentHourlyRate || 0);
      const totalAmount = baseAmount + overtimePay;
      
      const daysWorked = new Set(relevantAttendance.filter(r => r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent').map(r => r.id)).size;

      return {
        hours: totalHours,
        daysWorked: daysWorked,
        overtimePay: overtimePay,
        totalAmount: totalAmount,
        periodLabel: selectedPeriodLabel,
        hoursAbsent: totalHoursAbsent,
        minutesLate: totalMinutesLate,
        overtimeHours: totalOTHours,
        hourlyRate: currentHourlyRate
      };
    }
  }, [employee, employeeAttendance, periodOptions, selectedPeriod, settings, allAttendance]);

  const handleViewSummary = () => {
    if (!employee || !payrollData) return;

    let summaryMessage = `💰 *Payroll Summary* for *${employee.name}*\n`;
    summaryMessage += `📅 Period: ${payrollData.periodLabel}\n\n`;

    if (employee.paymentMethod === 'Monthly') {
      summaryMessage += `Base Salary: ETB ${(payrollData.baseSalary || 0).toFixed(2)}\n`;
      if ((payrollData.lateDeduction || 0) > 0) {
        summaryMessage += `Late Deduction (${payrollData.minutesLate || 0} mins): - ETB ${(payrollData.lateDeduction || 0).toFixed(2)}\n`;
      }
      if ((payrollData.absenceDeduction || 0) > 0) {
        summaryMessage += `Absence Deduction (${(payrollData.hoursAbsent || 0).toFixed(1)} hrs): - ETB ${(payrollData.absenceDeduction || 0).toFixed(2)}\n`;
      }
      if ((payrollData.overtimePay || 0) > 0) {
        summaryMessage += `Overtime Pay: + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
      }
      summaryMessage += `--------------------\n`;
      summaryMessage += `*Net Salary: ETB ${(payrollData.totalAmount || 0).toFixed(2)}*`;
    } else { // Weekly
      summaryMessage += `Base Pay (${(payrollData.hours || 0).toFixed(2)} hrs): ETB ${( (payrollData.hours || 0) * (payrollData.hourlyRate || 0)).toFixed(2)}\n`;
      if ((payrollData.overtimePay || 0) > 0) {
        summaryMessage += `Overtime Pay (${payrollData.overtimeHours} hrs): + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
      }
      summaryMessage += `--------------------\n`;
      summaryMessage += `*Total Payout: ETB ${(payrollData.totalAmount || 0).toFixed(2)}*`;
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

  const handleSendToTelegram = async () => {
      setIsSending(true);
      const result = await sendAdminPayrollSummary(summaryText);
      setIsSending(false);
      if (result.success) {
          toast({ title: "Sent to Telegram!", description: "Admin notified successfully." });
      } else {
          toast({ variant: "destructive", title: "Failed to send", description: result.error });
      }
  };

  const handleStartDeletionCountdown = () => {
    setIsDeleting(true);
    setDeleteCountdown(3);
    
    const timer = setInterval(() => {
      setDeleteCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          executeDelete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    deleteTimerRef.current = timer;
  };

  const handleCancelDeletion = () => {
    if (deleteTimerRef.current) {
      clearInterval(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    setIsDeleting(false);
    setDeleteCountdown(0);
    toast({
      title: "Deletion Cancelled",
      description: "Employee record was not removed.",
    });
  };

  const executeDelete = () => {
    if (!employeeId || !firestore) return;

    router.push("/employees");
    toast({
      title: "Deletion Complete",
      description: `${employee?.name} has been removed.`,
    });

    deleteDoc(doc(firestore, "employees", employeeId as string))
      .catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `employees/${employeeId}`,
          operation: 'delete',
        }));
        toast({
          variant: 'destructive',
          title: "Deletion Failed",
          description: "Could not remove employee from database.",
        });
      });
  };

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    };
  }, []);
  
  const renderAttendanceBadge = (status: string, isVirtual?: boolean) => {
    return (
      <Badge 
        variant={status === 'Absent' ? 'destructive' : 'outline'}
        className={cn(
          "shadow-none px-1.5 h-5 text-[10px]",
          status === 'Present' && "bg-secondary text-secondary-foreground border-transparent",
          status === 'Late' && "bg-amber-100 text-amber-700 border-amber-200",
          status === 'Permission' && "bg-blue-100 text-blue-700 border-blue-200",
          isVirtual && status === 'Absent' && "opacity-50"
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
          <DialogFooter className="gap-2">
             <Button variant="outline" onClick={handleSendToTelegram} disabled={isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send to Admin
              </Button>
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
              <AlertDialogTitle>{isDeleting ? "Aborting Possible..." : "Final Confirmation"}</AlertDialogTitle>
              <AlertDialogDescription>
                {isDeleting 
                  ? `Deleting ${employee.name} in ${deleteCountdown}s...` 
                  : "This action cannot be undone. All personal attendance data for this employee will be lost."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {isDeleting ? (
                <Button variant="outline" onClick={handleCancelDeletion} className="gap-2 border-destructive text-destructive hover:bg-destructive/5">
                  <XCircle className="h-4 w-4" /> Cancel Deletion
                </Button>
              ) : (
                <>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button variant="destructive" onClick={handleStartDeletionCountdown}>
                    Confirm Delete
                  </Button>
                </>
              )}
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
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <p className="text-muted-foreground font-medium">{format(new Date(employee.attendanceStartDate), "MMM d, yyyy")}</p>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground uppercase">{ethiopianDateFormatter(new Date(employee.attendanceStartDate), { day: 'numeric', month: 'short', year: 'numeric' })} AM</p>
                                </div>
                          </div>
                      )}
                      {employee.status === 'Inactive' && employee.inactiveDate && (
                          <div className="flex items-center justify-between">
                                <p className="font-semibold">Inactive Date</p>
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-2">
                                    <UserMinus className="h-4 w-4 text-destructive" />
                                    <p className="text-destructive font-bold">{format(new Date(employee.inactiveDate), "MMM d, yyyy")}</p>
                                  </div>
                                  <p className="text-[10px] text-destructive/70 uppercase">{ethiopianDateFormatter(new Date(employee.inactiveDate), { day: 'numeric', month: 'short', year: 'numeric' })} AM</p>
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
                      <div className="flex items-center justify-between">
                          <p className="font-semibold">Payment Method</p>
                          <Badge variant="outline">{employee.paymentMethod}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                          <p className="font-semibold">{employee.paymentMethod} Rate</p>
                          <p className="text-muted-foreground">ETB {employee.monthlyRate || employee.dailyRate || "N/A"}</p>
                      </div>
                      <div className="flex items-center justify-between border-t pt-2 mt-2">
                          <p className="font-semibold">Period Hourly Rate</p>
                          <p className="text-primary font-bold">ETB {payrollData.hourlyRate?.toFixed(2) || "N/A"}</p>
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
                                    <p className="font-semibold">Total Overtime Pay</p>
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
                                    <p className="text-2xl font-bold text-primary">+ ETB {(payrollData.overtimePay || 0).toFixed(2)}</p>
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
                    {displayedHistory.length > 0 ? (
                        displayedHistory.map((record) => (
                        <TableRow key={record.id} className={cn(record.isVirtual && "bg-muted/10")}>
                            <TableCell>
                                <div className="flex flex-col min-w-[80px]">
                                    <span className="font-medium whitespace-nowrap">{format(getDateFromRecord(record.date), 'EEE, MMM d')}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase whitespace-nowrap">
                                        {ethiopianDateFormatter(getDateFromRecord(record.date), { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                  {renderAttendanceBadge(record.morningStatus, record.isVirtual)}
                                  {record.morningEntry && <p className="text-[10px] font-mono text-muted-foreground">{record.morningEntry}</p>}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                  {renderAttendanceBadge(record.afternoonStatus, record.isVirtual)}
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
