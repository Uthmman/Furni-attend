
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, isWithinInterval, parse, isValid, addDays, startOfWeek, endOfWeek, getDay, eachDayOfInterval, startOfDay, endOfDay } from "date-fns";
import { Timestamp } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Employee, PayrollSettings, AttendanceRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Copy, Phone, Trash2, Edit, Calendar, UserMinus, Send, Loader2, XCircle } from "lucide-react";
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
    const startDate = startOfDay(new Date(selectedPeriod)); let interval;
    if (employee.paymentMethod === 'Weekly') {
      const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
      interval = { start: startOfDay(weekStart), end: endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 })) };
    } else {
      const ethDate = toEthiopian(startDate);
      const daysInMonthCount = getEthiopianMonthDays(ethDate.year, ethDate.month);
      interval = { start: startOfDay(startDate), end: endOfDay(addDays(startDate, daysInMonthCount - 1)) };
    }
    const days = eachDayOfInterval(interval); const today = new Date();
    const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));
    return days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existingRecord = employeeAttendance.find(r => format(r.date, 'yyyy-MM-dd') === dateStr);
        if (existingRecord) return existingRecord;
        return { id: dateStr, employeeId: employee.id, date: day.toISOString(), morningStatus: (day <= today && day >= employeeStartDate && getDay(day) !== 0) ? 'Absent' : 'Present', afternoonStatus: (day <= today && day >= employeeStartDate && getDay(day) !== 0) ? 'Absent' : 'Present', isVirtual: true } as any;
    }).reverse();
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
                    let sH = (r.morningStatus !== 'Absent' ? 4.5 : 0) + (r.afternoonStatus !== 'Absent' ? 3.5 : 0);
                    otPayTotal += sH * hourlyRateCalc * sundayOTRate;
                    otHoursTotal += sH;
                }
            } else {
                let mAbs = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dStr));
                let pAbs = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dStr));
                if (mAbs) totalHoursAbsent += 4.5;
                if (pAbs && !isSat) totalHoursAbsent += 3.5;
                if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) {
                    otPayTotal += 3.5 * hourlyRateCalc * normalOTRate;
                    otHoursTotal += 3.5;
                }
            }
            if (r.overtimeHours) { otPayTotal += r.overtimeHours * hourlyRateCalc * normalOTRate; otHoursTotal += r.overtimeHours; }
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
      return { totalAmount: baseSalary - (absenceDeduction + lateDeduction) + otPayTotal, baseSalary, lateDeduction, absenceDeduction, hoursAbsent: totalHoursAbsent, minutesLate: recordsInPeriod.reduce((acc, r) => acc + calculateMinutesLate(r), 0), periodLabel: selectedPeriodLabel, overtimePay: otPayTotal, overtimeHours: otHoursTotal, hourlyRate: hourlyRateCalc };
    } else {
      const hourly = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
      const weekStart = startOfWeek(new Date(selectedPeriod), { weekStartsOn: 0 });
      const interval = { start: startOfDay(weekStart), end: endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 })) };
      const records = employeeAttendance.filter(r => isWithinInterval(r.date, interval));
      const totalHours = records.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
      const otHours = records.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
      const otPay = otHours * (hourly || 0) * normalOTRate;
      return { hours: totalHours, overtimePay: otPay, totalAmount: (totalHours * (hourly || 0)) + otPay, periodLabel: selectedPeriodLabel, overtimeHours: otHours, hourlyRate: hourly };
    }
  }, [employee, employeeAttendance, periodOptions, selectedPeriod, settings, allAttendance]);

  const handleViewSummary = () => {
    if (!employee || !payrollData) return;
    let msg = `💰 *Payroll Summary* for *${employee.name}*\n📅 Period: ${payrollData.periodLabel}\n\n`;
    if (employee.paymentMethod === 'Monthly') {
      msg += `Base Salary: ETB ${(payrollData.baseSalary || 0).toFixed(2)}\n`;
      if ((payrollData.lateDeduction || 0) > 0) msg += `Late Deduction: - ETB ${(payrollData.lateDeduction || 0).toFixed(2)}\n`;
      if ((payrollData.absenceDeduction || 0) > 0) msg += `Absence Deduction: - ETB ${(payrollData.absenceDeduction || 0).toFixed(2)}\n`;
      if ((payrollData.overtimePay || 0) > 0) msg += `Overtime Pay (${payrollData.overtimeHours?.toFixed(1)} hrs): + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
      msg += `--------------------\n*Net Salary: ETB ${(payrollData.totalAmount || 0).toFixed(2)}*`;
    } else {
      msg += `Base Pay: ETB ${( (payrollData.hours || 0) * (payrollData.hourlyRate || 0)).toFixed(2)}\n`;
      if ((payrollData.overtimePay || 0) > 0) msg += `Overtime Pay (${payrollData.overtimeHours} hrs): + ETB ${(payrollData.overtimePay || 0).toFixed(2)}\n`;
      msg += `--------------------\n*Total Payout: ETB ${(payrollData.totalAmount || 0).toFixed(2)}*`;
    }
    setSummaryText(msg); setIsSummaryDialogOpen(true);
  };

  useEffect(() => { if (periodOptions.length > 0 && !selectedPeriod) setSelectedPeriod(periodOptions[0].value); }, [periodOptions, selectedPeriod]);

  if (employeeLoading || attendanceLoading || isUserLoading) return <div>Loading...</div>
  if (!employee) return <div>Employee not found</div>;

  return (
    <div className="flex flex-col gap-6">
       <EmployeeForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} employee={employee} />
       <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payroll Summary</DialogTitle><DialogDescription>For {employee.name} covering {payrollData.periodLabel}</DialogDescription></DialogHeader>
          <Textarea readOnly value={summaryText} rows={10} className="text-sm font-mono" />
          <DialogFooter className="gap-2">
             <Button variant="outline" onClick={async () => { setIsSending(true); const r = await sendAdminPayrollSummary(summaryText); setIsSending(false); if(r.success) toast({ title: "Sent!" }); }} disabled={isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Send to Admin
              </Button>
             <Button variant="secondary" onClick={() => { copy(summaryText); toast({ title: "Copied!" }); }}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
            <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setIsFormOpen(true)}><Edit className="mr-2 h-4 w-4" /> Edit</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Final Confirmation</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. All data will be lost.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><Button variant="destructive" onClick={() => { if(!firestore) return; deleteDoc(doc(firestore, "employees", employeeId as string)).then(() => router.push("/employees")); }}>Confirm Delete</Button></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-6">
           <Card>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="flex items-center gap-4 text-left w-full">
                      <Avatar className="w-20 h-20 text-3xl"><AvatarFallback>{getInitials(employee.name)}</AvatarFallback></Avatar>
                      <div><CardTitle>{employee.name}</CardTitle><Badge variant="secondary" className="mt-1">{employee.position}</Badge></div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="text-sm pt-0">
                    <div className="grid gap-4">
                        <div className="flex items-center justify-between"><p className="font-semibold">Phone</p><a href={`tel:${employee.phone}`} className="flex items-center text-primary"><Phone className="mr-2 h-3 w-3" />{employee.phone}</a></div>
                        <div className="flex items-center justify-between"><p className="font-semibold">Account</p><p className="text-muted-foreground">{employee.accountNumber}</p></div>
                        <div className="flex items-center justify-between"><p className="font-semibold">Method</p><Badge variant="outline">{employee.paymentMethod}</Badge></div>
                        <div className="flex items-center justify-between border-t pt-2 mt-2"><p className="font-semibold">Hourly Rate</p><p className="text-primary font-bold">ETB {payrollData.hourlyRate?.toFixed(2) || "N/A"}</p></div>
                    </div>
                  </CardContent>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
          
           <Card>
              <CardHeader><CardTitle>Select Period</CardTitle></CardHeader>
              <CardContent>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger><SelectValue placeholder="Select a period" /></SelectTrigger>
                    <SelectContent>{periodOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </CardContent>
            </Card>
          
           <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div><CardTitle>Summary</CardTitle><CardDescription>{payrollData.periodLabel}</CardDescription></div>
                    <Button variant="outline" size="icon" onClick={handleViewSummary}><Copy className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="grid gap-4 pt-4">
                    <div className="flex justify-between"><span>Base Amount:</span><span className="font-bold">ETB {((payrollData.baseSalary || 0) || ( (payrollData.hours || 0) * (payrollData.hourlyRate || 0))).toFixed(2)}</span></div>
                    {payrollData.overtimePay > 0 && <div className="flex justify-between text-primary"><span>Overtime:</span><span>+ ETB {payrollData.overtimePay.toFixed(2)}</span></div>}
                    {payrollData.absenceDeduction > 0 && <div className="flex justify-between text-destructive"><span>Absence:</span><span>- ETB {payrollData.absenceDeduction.toFixed(2)}</span></div>}
                    <div className="border-t pt-2 flex justify-between text-xl font-black text-primary"><span>Total:</span><span>ETB {payrollData.totalAmount?.toFixed(2)}</span></div>
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Attendance History</CardTitle><CardDescription>{payrollData.periodLabel}</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Morning</TableHead><TableHead>Afternoon</TableHead></TableRow></TableHeader>
                    <TableBody>
                    {displayedHistory.length > 0 ? (
                        displayedHistory.map((record) => (
                        <TableRow key={record.id} className={cn(record.isVirtual && "bg-muted/10")}>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="font-medium">{format(getDateFromRecord(record.date), 'EEE, MMM d')}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase">{ethiopianDateFormatter(getDateFromRecord(record.date), { day: 'numeric', month: 'short' })}</span>
                                </div>
                            </TableCell>
                            <TableCell><div className="flex flex-col"><Badge variant="outline" className={cn("px-1.5 h-5 text-[10px]", record.morningStatus === 'Present' && "bg-secondary")}>{record.morningStatus}</Badge></div></TableCell>
                            <TableCell><div className="flex flex-col"><Badge variant="outline" className={cn("px-1.5 h-5 text-[10px]", record.afternoonStatus === 'Present' && "bg-secondary")}>{record.afternoonStatus}</Badge>{record.overtimeHours > 0 && <span className="text-[9px] text-primary font-bold">+{record.overtimeHours}h OT</span>}</div></TableCell>
                        </TableRow>
                        ))
                    ) : (<TableRow><TableCell colSpan={3} className="text-center h-24">No records.</TableCell></TableRow>)}
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

