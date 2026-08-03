
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, isWithinInterval, parse, isValid, addDays, startOfWeek, endOfWeek, getDay, eachDayOfInterval, startOfDay, endOfDay, isSameDay } from "date-fns";
import { Timestamp } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Employee, PayrollSettings, AttendanceRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Copy, Phone, Trash2, Edit, Calendar, UserMinus, Send, Loader2, XCircle, ChevronDown, ChevronUp, CopyIcon, CalendarDays } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, doc, deleteDoc } from "firebase/firestore";
import { EmployeeForm } from "../employee-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sendAdminPayrollSummary } from "@/app/payroll/actions";

const getInitials = (name: string) => {
  if (!name) return "";
  const names = name.split(" ");
  return names.map((n) => n[0]).join("").toUpperCase();
};

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (date instanceof Timestamp) return date.toDate();
  return new Date(date);
}

const calculateHoursWorked = (record: AttendanceRecord): number => {
    if (!record) return 0;
    const recordDate = getDateFromRecord(record.date);
    if (getDay(recordDate) === 0) return (record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent') ? 8 : 0;
    if (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent') return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    let totalHours = 0;
    if (record.morningStatus !== 'Absent' && record.morningEntry) {
        try {
            const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
            if(isValid(morningEntryTime) && morningEntryTime < morningEndTime)
                totalHours += (morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime())) / (1000 * 60 * 60);
        } catch(e){}
    }
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        try {
            const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
            if(isValid(afternoonEntryTime) && afternoonEntryTime < afternoonEndTime)
                totalHours += (afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime())) / (1000 * 60 * 60);
        } catch(e){}
    }
    return Math.max(0, totalHours);
};

const calculateMinutesLate = (record: AttendanceRecord): number => {
    if (!record) return 0;
    let minutesLate = 0;
    if (record.morningStatus === 'Late' && record.morningEntry) {
        const morningStartTime = parse("08:00", "HH:mm", new Date());
        try {
            const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
            if (isValid(morningEntryTime) && morningEntryTime > morningStartTime)
                minutesLate += (morningEntryTime.getTime() - morningStartTime.getTime()) / (1000 * 60);
        } catch(e) {}
    }
    if (record.afternoonStatus === 'Late' && record.afternoonEntry) {
        const afternoonStartTime = parse("13:30", "HH:mm", new Date());
        try {
            const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
            if (isValid(afternoonEntryTime) && afternoonEntryTime > afternoonStartTime)
                minutesLate += (afternoonEntryTime.getTime() - afternoonStartTime.getTime()) / (1000 * 60);
        } catch(e) {}
    }
    return Math.round(minutesLate);
};

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  if (!isValid(date)) return "Invalid Date";
  try {
      const customOptions: Intl.DateTimeFormatOptions = { ...options };
      if (customOptions.era) delete customOptions.era;
      return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", customOptions).format(date);
  } catch (e) { return "Invalid Date"; }
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
    return { day: parseInt(day), month: parseInt(month), year: parseInt(year) };
};

const getEthiopianMonthDays = (year: number, month: number): number => {
    if (month < 1 || month > 13) return 0;
    if (month <= 12) return 30;
    const isLeap = (year + 1) % 4 === 0;
    return isLeap ? 6 : 5;
};

const toGregorian = (ethYear: number, ethMonth: number, ethDay: number): Date => {
    let date = new Date(ethYear + 7, ethMonth + 7, ethDay, 12, 0, 0);
    for (let i = 0; i < 60; i++) {
        const eth = toEthiopian(date);
        if (eth.year === ethYear && eth.month === ethMonth && eth.day === ethDay) return startOfDay(date);
        if (eth.year < ethYear || (eth.year === ethYear && eth.month < ethMonth) || (eth.year === ethYear && eth.month === ethMonth && eth.day < ethDay)) date.setDate(date.getDate() + 1);
        else date.setDate(date.getDate() - 1);
    }
    return startOfDay(date);
};

const getMonthlyWorkingUnits = (monthStart: Date, daysInMonth: number) => {
    const interval = { start: monthStart, end: addDays(monthStart, daysInMonth - 1) };
    const days = eachDayOfInterval(interval);
    let weekdays = 0; let saturdays = 0;
    days.forEach(day => {
        const d = getDay(day);
        if (d >= 1 && d <= 5) weekdays++; else if (d === 6) saturdays++;
    });
    return weekdays + (saturdays * 0.5625);
};

type OvertimeDetail = {
    label: string;
    hours: number;
    amount: number;
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
  
  useEffect(() => { if (employee) setTitle(employee.name); }, [employee, setTitle]);

  const firstAttendanceDate = useMemo(() => {
    if (employee?.attendanceStartDate) return startOfDay(new Date(employee.attendanceStartDate));
    return new Date();
  }, [employee]);

  const periodOptions = useMemo(() => {
    if (!employee || !isValid(firstAttendanceDate)) return [];
    const today = new Date(); const options: { value: string, label: string }[] = [];

    if (employee.paymentMethod === 'Monthly') {
        let currentMonthStart = toGregorian(toEthiopian(today).year, toEthiopian(today).month, 1);
        for(let i=0; i < 12; i++){
            const ethDate = toEthiopian(currentMonthStart);
            const monthStart = toGregorian(ethDate.year, ethDate.month, 1);
            if (monthStart < addDays(firstAttendanceDate, -31)) break;
            options.push({ value: format(monthStart, "yyyy-MM-dd"), label: `${ethiopianDateFormatter(monthStart, { month: 'long' })} ${ethDate.year}` });
            currentMonthStart = toGregorian(ethDate.month === 1 ? ethDate.year - 1 : ethDate.year, ethDate.month === 1 ? 12 : ethDate.month - 1, 1);
        }
    } else {
        let currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 }); 
        for(let i=0; i<12; i++){
            const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 });
            if (weekEnd < firstAttendanceDate) break;
            options.push({ value: format(currentWeekStart, "yyyy-MM-dd"), label: `${ethiopianDateFormatter(currentWeekStart, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' })}` });
            currentWeekStart = addDays(currentWeekStart, -7);
        }
    }
    return options;
  }, [employee, firstAttendanceDate]);

  const displayedHistory = useMemo(() => {
    if (!selectedPeriod || !employee) return [];
    const startDate = startOfDay(new Date(selectedPeriod));
    let interval;
    const today = startOfDay(new Date());

    if (employee.paymentMethod === 'Weekly') {
      const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
      const actualEnd = weekEnd > today ? today : weekEnd;
      interval = { start: startOfDay(weekStart), end: endOfDay(actualEnd) };
    } else {
      const ethDate = toEthiopian(startDate);
      const daysInMonthCount = getEthiopianMonthDays(ethDate.year, ethDate.month);
      const monthEnd = addDays(startDate, daysInMonthCount - 1);
      const actualEnd = monthEnd > today ? today : monthEnd;
      interval = { start: startOfDay(startDate), end: endOfDay(actualEnd) };
    }

    const days = eachDayOfInterval(interval);
    const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));
    return days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existingRecord = employeeAttendance.find(r => format(r.date, 'yyyy-MM-dd') === dateStr);
        if (existingRecord) return existingRecord;
        
        const isSun = getDay(day) === 0;
        return { 
            id: dateStr, 
            employeeId: employee.id, 
            date: day.toISOString(), 
            morningStatus: isSun ? '—' : (day >= employeeStartDate ? 'Absent' : 'Present'), 
            afternoonStatus: isSun ? '—' : (day >= employeeStartDate ? 'Absent' : 'Present'), 
            isVirtual: true,
            isSunday: isSun
        } as any;
    }).reverse();
  }, [employeeAttendance, selectedPeriod, employee]);

  const payrollData = useMemo(() => {
    if (!employee || !selectedPeriod) return { totalAmount: 0, periodLabel: "" };
    const normalOTRate = settings?.normalOvertimeRate || 1.5;
    const sundayOTRate = settings?.sundayOvertimeRate || 2.0;
    const selectedPeriodLabel = periodOptions.find(o => o.value === selectedPeriod)?.label || "";
    let overtimeDetails: OvertimeDetail[] = [];

    if (employee.paymentMethod === 'Monthly') {
        const baseSalary = employee.monthlyRate || 0;
        const startDate = startOfDay(new Date(selectedPeriod));
        const ethDate = toEthiopian(startDate);
        const daysInMonthCount = getEthiopianMonthDays(ethDate.year, ethDate.month);
        const workingUnits = getMonthlyWorkingUnits(startDate, daysInMonthCount);
        const hourlyRateCalc = baseSalary / workingUnits / 8;
        const minuteRate = hourlyRateCalc / 60;
        
        const permissionDatesInYear = new Set<string>();
        (allAttendance || []).forEach(rec => {
            const recDate = getDateFromRecord(rec.date);
            if (toEthiopian(recDate).year === ethDate.year) {
                if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') permissionDatesInYear.add(format(recDate, 'yyyy-MM-dd'));
            }
        });
        const allowedPermissionDates = new Set(Array.from(permissionDatesInYear).sort().slice(0, 15));

        let totalHoursAbsent = 0; let otPayTotal = 0; let otHoursTotal = 0;
        const interval = { start: startDate, end: endOfDay(addDays(startDate, daysInMonthCount - 1)) };
        const recordsInPeriod = employeeAttendance.filter(r => isWithinInterval(r.date, interval));
        const recordedDates = new Set(recordsInPeriod.map(r => format(r.date, 'yyyy-MM-dd')));

        recordsInPeriod.forEach(r => {
            const dStr = format(r.date, 'yyyy-MM-dd');
            const isSat = getDay(r.date) === 6; const isSun = getDay(r.date) === 0;

            if (isSun) {
                const isWorking = r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent';
                if (isWorking) {
                    const amt = 8 * hourlyRateCalc * sundayOTRate;
                    otPayTotal += amt;
                    otHoursTotal += 8;
                    overtimeDetails.push({ label: `Sunday (${format(r.date, 'MMM d')})`, hours: 8, amount: amt });
                }
            } else {
                let mAbs = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dStr));
                let pAbs = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dStr));
                if (mAbs) totalHoursAbsent += 4.5;
                if (pAbs && !isSat) totalHoursAbsent += 3.5;
                
                // Bonus for Saturday Afternoon
                if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) {
                    const amt = 3.5 * hourlyRateCalc * normalOTRate;
                    otPayTotal += amt;
                    otHoursTotal += 3.5;
                    overtimeDetails.push({ label: `Sat Afternoon (${format(r.date, 'MMM d')})`, hours: 3.5, amount: amt });
                }
            }
            if (r.overtimeHours) {
                const amt = r.overtimeHours * hourlyRateCalc * normalOTRate;
                otPayTotal += amt;
                otHoursTotal += r.overtimeHours;
                overtimeDetails.push({ label: `OT Log (${format(r.date, 'MMM d')})`, hours: r.overtimeHours, amount: amt });
            }
        });

        const today = new Date();
        const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));
        eachDayOfInterval(interval).forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (day >= employeeStartDate && getDay(day) !== 0 && day <= today && !recordedDates.has(dayStr)) {
                totalHoursAbsent += (getDay(day) === 6) ? 4.5 : 8;
            }
        });

      const absenceDeduction = totalHoursAbsent * hourlyRateCalc;
      const lateDeduction = recordsInPeriod.reduce((acc, r) => acc + calculateMinutesLate(r), 0) * minuteRate;
      return { 
        totalAmount: baseSalary - (absenceDeduction + lateDeduction) + otPayTotal, 
        baseSalary, 
        lateDeduction, 
        absenceDeduction, 
        hoursAbsent: totalHoursAbsent, 
        minutesLate: recordsInPeriod.reduce((acc, r) => acc + calculateMinutesLate(r), 0), 
        periodLabel: selectedPeriodLabel, 
        overtimePay: otPayTotal, 
        overtimeHours: otHoursTotal, 
        hourlyRate: hourlyRateCalc,
        overtimeDetails
      };
    } else {
      const hourly = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
      const weekStart = startOfWeek(new Date(selectedPeriod), { weekStartsOn: 0 });
      const interval = { start: startOfDay(weekStart), end: endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 })) };
      const records = employeeAttendance.filter(r => isWithinInterval(r.date, interval));
      
      let baseHours = 0;
      let totalOTPay = 0;
      let totalOTHours = 0;

      records.forEach(r => {
          const isSun = getDay(r.date) === 0;
          if (isSun) {
              const working = r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent';
              if (working) {
                  const amt = 8 * (hourly || 0) * sundayOTRate;
                  totalOTPay += amt;
                  totalOTHours += 8;
                  overtimeDetails.push({ label: `Sunday (${format(r.date, 'MMM d')})`, hours: 8, amount: amt });
              }
          } else {
              baseHours += calculateHoursWorked(r);
          }
          
          if (r.overtimeHours) {
              const amt = r.overtimeHours * (hourly || 0) * normalOTRate;
              totalOTPay += amt;
              totalOTHours += r.overtimeHours;
              overtimeDetails.push({ label: `OT Log (${format(r.date, 'MMM d')})`, hours: r.overtimeHours, amount: amt });
          }
      });

      return { 
        hours: baseHours, 
        overtimePay: totalOTPay, 
        totalAmount: (baseHours * (hourly || 0)) + totalOTPay, 
        periodLabel: selectedPeriodLabel, 
        overtimeHours: totalOTHours, 
        hourlyRate: hourly,
        overtimeDetails
      };
    }
  }, [employee, employeeAttendance, periodOptions, selectedPeriod, settings, allAttendance]);

  const handleViewSummary = () => {
    if (!employee || !payrollData) return;
    let msg = `💰 *Payroll Summary* for *${employee.name}*\n📅 Period: ${payrollData.periodLabel}\n\n`;
    if (employee.paymentMethod === 'Monthly') {
      msg += `Base Salary: ETB ${(payrollData.baseSalary || 0).toFixed(2)}\n`;
      if ((payrollData.lateDeduction || 0) > 0) msg += `Late Deduction (${payrollData.minutesLate} mins): - ETB ${(payrollData.lateDeduction || 0).toFixed(2)}\n`;
      if ((payrollData.absenceDeduction || 0) > 0) msg += `Absence Deduction (${payrollData.hoursAbsent?.toFixed(1)} hrs): - ETB ${(payrollData.absenceDeduction || 0).toFixed(2)}\n`;
      if ((payrollData.overtimePay || 0) > 0) {
        msg += `Overtime Pay (${payrollData.overtimeHours?.toFixed(1)} hrs): + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
        payrollData.overtimeDetails?.forEach((d: any) => {
            msg += `  - ${d.label}: + ETB ${d.amount.toFixed(2)}\n`;
        });
      }
      msg += `--------------------\n*Net Salary: ETB ${(payrollData.totalAmount || 0).toFixed(2)}*`;
    } else {
      msg += `Base Pay (${payrollData.hours?.toFixed(1)} hrs): ETB ${( (payrollData.hours || 0) * (payrollData.hourlyRate || 0)).toFixed(2)}\n`;
      if ((payrollData.overtimePay || 0) > 0) {
        msg += `Overtime Pay (${payrollData.overtimeHours?.toFixed(1)} hrs): + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
        payrollData.overtimeDetails?.forEach((d: any) => {
            msg += `  - ${d.label}: + ETB ${d.amount.toFixed(2)}\n`;
        });
      }
      msg += `--------------------\n*Total Payout: ETB ${(payrollData.totalAmount || 0).toFixed(2)}*`;
    }
    setSummaryText(msg); setIsSummaryDialogOpen(true);
  };

  useEffect(() => { if (periodOptions.length > 0 && !selectedPeriod) setSelectedPeriod(periodOptions[0].value); }, [periodOptions, selectedPeriod]);

  if (employeeLoading || attendanceLoading || isUserLoading) return <div className="h-screen w-full flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
  if (!employee) return <div>Employee not found</div>;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12">
       <EmployeeForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} employee={employee} />
       
       <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payroll Summary</DialogTitle><DialogDescription>For {employee.name} covering {payrollData.periodLabel}</DialogDescription></DialogHeader>
          <Textarea readOnly value={summaryText} rows={12} className="text-sm font-mono" />
          <DialogFooter className="gap-2">
             <Button variant="outline" onClick={async () => { setIsSending(true); const r = await sendAdminPayrollSummary(summaryText); setIsSending(false); if(r.success) toast({ title: "Sent!" }); }} disabled={isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Send to Admin
              </Button>
             <Button variant="secondary" onClick={() => { copy(summaryText); toast({ title: "Copied!" }); }}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
            <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Card */}
      <Card className="shadow-lg border-none overflow-hidden rounded-3xl">
        <CardContent className="p-8">
            <div className="flex justify-between items-start mb-10">
                <div className="flex items-center gap-6">
                    <Avatar className="w-20 h-20 text-2xl border-4 border-primary/5 bg-primary/5 shadow-inner">
                        <AvatarFallback className="bg-transparent text-primary font-black text-3xl">{getInitials(employee.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-3xl font-black text-[#1e293b] tracking-tight mb-1">{employee.name}</h1>
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none font-black text-[10px] uppercase tracking-widest px-3 h-6 rounded-full">
                            {employee.status || "Active"}
                        </Badge>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted" onClick={() => setIsFormOpen(true)}><Edit className="h-4 w-4 text-muted-foreground" /></Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This will remove {employee.name} permanently.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><Button variant="destructive" onClick={() => { if(!firestore) return; deleteDoc(doc(firestore, "employees", employeeId as string)).then(() => router.push("/employees")); }}>Delete</Button></AlertDialogFooter></AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <div className="space-y-6">
                <div className="flex items-center justify-between group">
                    <span className="text-[13px] font-bold text-[#64748b]">Start Date</span>
                    <div className="flex items-center gap-3 text-right">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-black text-[#1e293b]">{employee.attendanceStartDate ? format(new Date(employee.attendanceStartDate), "MMM d, yyyy") : "—"}</span>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">{employee.attendanceStartDate ? ethiopianDateFormatter(new Date(employee.attendanceStartDate), { day: 'numeric', month: 'long', year: 'numeric' }) : "—"}</span>
                        </div>
                        <CalendarDays className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#64748b]">Phone Number</span>
                    <div className="flex items-center gap-3">
                        <a href={`tel:${employee.phone}`} className="text-sm font-black text-[#1e293b] hover:text-primary transition-colors">{employee.phone}</a>
                        <Phone className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#64748b]">Account Number</span>
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-[#1e293b] font-mono">{employee.accountNumber}</span>
                        <button onClick={() => { copy(employee.accountNumber); toast({ title: "Copied!" }); }} className="text-muted-foreground/40 hover:text-primary"><CopyIcon className="h-4 w-4" /></button>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#64748b]">Payment Method</span>
                    <Badge variant="secondary" className="bg-[#f1f5f9] text-[#1e293b] font-black text-[10px] h-6 px-3">{employee.paymentMethod}</Badge>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#64748b]">{employee.paymentMethod === 'Monthly' ? 'Monthly Rate' : 'Daily Rate'}</span>
                    <span className="text-sm font-black text-[#1e293b]">ETB {employee.paymentMethod === 'Monthly' ? employee.monthlyRate : employee.dailyRate}</span>
                </div>

                <div className="pt-6 border-t border-dashed">
                    <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-[#64748b]">Period Hourly Rate</span>
                        <span className="text-sm font-black text-primary">ETB {payrollData.hourlyRate?.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </CardContent>
      </Card>

      {/* Select Period Card */}
      <Card className="shadow-lg border-none rounded-3xl">
        <CardContent className="p-8">
            <h2 className="text-2xl font-black text-[#1e293b] tracking-tight font-headline mb-6">Select Period</h2>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="h-14 rounded-2xl bg-[#f8faff] border-none font-bold text-[#1e293b] px-6">
                    <SelectValue placeholder="Select a period" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                    {periodOptions.map(option => (
                        <SelectItem key={option.value} value={option.value} className="font-bold py-3">{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </CardContent>
      </Card>

      {/* Payroll Summary Card */}
      <Card className="shadow-lg border-none rounded-3xl relative overflow-hidden">
        <CardContent className="p-8">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-2xl font-black text-[#1e293b] tracking-tight font-headline">Payroll Summary</h2>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{payrollData.periodLabel}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-muted/30" onClick={handleViewSummary}><CopyIcon className="h-4 w-4 text-muted-foreground" /></Button>
            </div>

            <div className="space-y-6">
                <div className="space-y-1">
                    <p className="text-[13px] font-bold text-[#64748b]">Base Salary</p>
                    <p className="text-3xl font-black text-[#1e293b]">ETB {((payrollData.baseSalary || 0) || ( (payrollData.hours || 0) * (payrollData.hourlyRate || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>

                <div className="space-y-1">
                    <p className="text-[13px] font-bold text-[#64748b]">Late Deduction ({payrollData.minutesLate} mins)</p>
                    <p className="text-xl font-black text-amber-500">- ETB {payrollData.lateDeduction?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>

                <div className="space-y-1">
                    <p className="text-[13px] font-bold text-[#64748b]">Absence Deduction ({payrollData.hoursAbsent?.toFixed(1)} hrs)</p>
                    <p className="text-xl font-black text-red-500">- ETB {payrollData.absenceDeduction?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>

                {payrollData.overtimePay > 0 && (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <p className="text-[13px] font-bold text-[#64748b]">Total Overtime Pay ({payrollData.overtimeHours?.toFixed(1)} hrs)</p>
                            <p className="text-xl font-black text-blue-500">+ ETB {payrollData.overtimePay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-[#f8faff] rounded-2xl p-4 space-y-2.5 border border-blue-100/50 shadow-inner">
                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Overtime Breakdown</p>
                            {payrollData.overtimeDetails?.map((detail: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="text-[#64748b] font-medium">{detail.label}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-muted-foreground/60">{detail.hours.toFixed(1)}h</span>
                                        <span className="font-black text-blue-600">ETB {detail.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="pt-6 border-t-4 border-[#f8faff]">
                    <p className="text-[13px] font-black text-primary uppercase tracking-widest mb-1">Net Salary</p>
                    <p className="text-4xl font-black text-primary tracking-tighter">ETB {payrollData.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
            </div>
        </CardContent>
      </Card>

      {/* Attendance History Card */}
      <Card className="shadow-lg border-none rounded-3xl overflow-hidden">
        <CardHeader className="bg-[#f8faff] border-b border-blue-50 py-8">
            <div className="text-center">
                <h2 className="text-2xl font-black text-[#1e293b] tracking-tight font-headline">Attendance History</h2>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{payrollData.periodLabel}</p>
            </div>
        </CardHeader>
        <CardContent className="p-0">
            <Table>
                <TableHeader className="bg-[#f8faff]/50">
                    <TableRow>
                        <TableHead className="text-[10px] font-black uppercase text-[#94a3b8] tracking-[0.2em] pl-8 py-5">Date</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-[#94a3b8] tracking-[0.2em] py-5">Morning</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-[#94a3b8] tracking-[0.2em] py-5 pr-8">Afternoon</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                {displayedHistory.length > 0 ? (
                    displayedHistory.map((record) => (
                    <TableRow key={record.id} className={cn("hover:bg-muted/5 transition-colors border-blue-50", record.isVirtual && "opacity-80")}>
                        <TableCell className="pl-8 py-5">
                            <div className="flex flex-col">
                                <span className="font-black text-sm text-[#1e293b]">{format(getDateFromRecord(record.date), 'EEE, MMM d')}</span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{ethiopianDateFormatter(getDateFromRecord(record.date), { day: 'numeric', month: 'short' })}</span>
                            </div>
                        </TableCell>
                        <TableCell className="py-5">
                            <div className="flex items-center gap-2">
                                <Badge 
                                    variant="outline" 
                                    className={cn(
                                        "px-2.5 h-6 text-[10px] font-black border-none rounded-md", 
                                        record.morningStatus === 'Present' ? "bg-[#dcfce7] text-[#166534]" : 
                                        record.morningStatus === 'Late' ? "bg-[#fef3c7] text-[#92400e]" : 
                                        record.morningStatus === 'Absent' ? "bg-[#fee2e2] text-[#991b1b]" : "bg-muted text-muted-foreground/60"
                                    )}
                                >
                                    {record.morningStatus}
                                </Badge>
                            </div>
                        </TableCell>
                        <TableCell className="py-5 pr-8">
                            <div className="flex items-center gap-2">
                                <Badge 
                                    variant="outline" 
                                    className={cn(
                                        "px-2.5 h-6 text-[10px] font-black border-none rounded-md", 
                                        record.afternoonStatus === 'Present' ? "bg-[#dcfce7] text-[#166534]" : 
                                        record.afternoonStatus === 'Late' ? "bg-[#fef3c7] text-[#92400e]" : 
                                        record.afternoonStatus === 'Absent' ? "bg-[#fee2e2] text-[#991b1b]" : "bg-muted text-muted-foreground/60"
                                    )}
                                >
                                    {record.afternoonStatus}
                                </Badge>
                                {record.overtimeHours > 0 && <span className="text-[9px] text-primary font-black bg-primary/10 px-2 py-0.5 rounded-full">+{record.overtimeHours}h OT</span>}
                            </div>
                        </TableCell>
                    </TableRow>
                    ))
                ) : (<TableRow><TableCell colSpan={3} className="text-center h-40 font-black text-muted-foreground/40 text-xs uppercase tracking-widest">No records available</TableCell></TableRow>)}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
