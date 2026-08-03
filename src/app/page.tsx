
'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, CalendarDays, Clock, TrendingUp, HandCoins, Calendar as CalendarIcon, Wallet2 } from "lucide-react";
import type { Employee, AttendanceRecord, PayrollSettings } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, startOfDay, endOfDay } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser, useDoc } from "@/firebase";
import { collection, query, where, getDocs, doc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from "@/components/ui/progress";
import Link from 'next/link';
import { cn } from "@/lib/utils";

const getDateFromRecord = (date: string | any): Date => {
  if (date?.toDate) return date.toDate();
  if (!date) return new Date();
  return new Date(date);
}

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  if (!isValid(date)) return "Invalid Date";
  try {
      return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
  } catch (e) {
      return "Invalid Date";
  }
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
    for (let i = 0; i < 200; i++) {
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
    let weekdays = 0;
    let saturdays = 0;
    days.forEach(day => {
        const d = getDay(day);
        if (d >= 1 && d <= 5) weekdays++;
        else if (d === 6) saturdays++;
    });
    return weekdays + (saturdays * 0.5625);
};

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
                totalHours += (morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime())) / 3600000;
        } catch(e){}
    }
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        try {
            const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
            if(isValid(afternoonEntryTime) && afternoonEntryTime < afternoonEndTime)
                totalHours += (afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime())) / 3600000;
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

const getOverallStatus = (morning: string, afternoon: string): string => {
    if (morning === 'Permission' || afternoon === 'Permission') return 'Permission';
    if (morning === 'Absent' && (afternoon === 'Absent' || !afternoon)) return 'Absent';
    if (morning === 'Late' || afternoon === 'Late') return 'Late';
    if (morning === 'Present' || afternoon === 'Present') return 'Present';
    return 'Absent';
};

const EmployeeCard = ({ 
    employeeId,
    name, 
    paymentMethod, 
    lateMins, 
    absentHours, 
    overtimeHours, 
    overtimeAmount, 
    total, 
    amountLabel, 
    morning, 
    afternoon, 
    status,
    isToday 
  }: any) => (
    <Card className="shadow-sm border-primary/5 hover:border-primary/20 transition-colors">
        <CardContent className="p-4 space-y-4">
            <div className="flex justify-between items-start">
                <Link href={`/employees/${employeeId}`} className="hover:underline decoration-primary/40 underline-offset-4">
                    <h3 className="font-bold text-[#1e293b] text-base">{name}</h3>
                </Link>
                {isToday ? (
                  <Badge 
                    className={cn(
                        "text-[10px] font-bold h-6 px-3 rounded-full border-none shadow-none",
                        status === 'Present' && "bg-secondary text-secondary-foreground",
                        status === 'Late' && "bg-amber-100 text-amber-700",
                        status === 'Absent' && "bg-destructive/10 text-destructive",
                        status === 'Permission' && "bg-blue-100 text-blue-700"
                    )}
                  >
                    {status}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] h-4 py-0 px-1.5 font-bold uppercase tracking-tight opacity-60">
                      {paymentMethod}
                  </Badge>
                )}
            </div>
            
            {isToday ? (
                <div className="bg-muted/20 rounded-full py-2 px-4 flex justify-between items-center text-[10px] sm:text-[11px]">
                    <div className="flex gap-1.5 items-center">
                        <span className="text-muted-foreground font-black uppercase tracking-tighter opacity-60">Morning:</span>
                        <span className="font-bold text-foreground/80">{morning || "—"}</span>
                    </div>
                    <div className="flex gap-1.5 items-center">
                        <span className="text-muted-foreground font-black uppercase tracking-tighter opacity-60">Afternoon:</span>
                        <span className="font-bold text-foreground/80">{afternoon || "—"}</span>
                    </div>
                </div>
            ) : (
                <div className="flex gap-2">
                    <div className="flex-1 bg-muted/20 rounded-full h-8 flex items-center px-4 justify-between">
                        <span className={cn("text-[11px] font-medium", lateMins > 0 ? "text-amber-600" : "text-muted-foreground/60")}>
                            {lateMins > 0 ? `Late: ${lateMins}m` : "No late mins"}
                        </span>
                        <span className={cn("text-[11px] font-bold", absentHours > 0 ? "text-destructive" : "text-muted-foreground/60")}>
                            {absentHours > 0 ? `Absent: ${absentHours.toFixed(1)}h` : "Full attendance"}
                        </span>
                    </div>
                </div>
            )}

            {overtimeHours > 0 && (
                <div className="bg-primary/5 rounded-full h-8 flex items-center px-4 justify-between">
                    <span className="text-[11px] font-medium text-primary/80">Overtime:</span>
                    <span className="text-[11px] font-bold text-primary">
                        +{overtimeHours.toFixed(1)} hrs (ETB {overtimeAmount.toFixed(2)})
                    </span>
                </div>
            )}

            <div className={cn("flex items-center", isToday ? "justify-end pt-1" : "pt-2 justify-between border-t border-dashed")}>
                {!isToday && <span className="text-[11px] font-bold text-[#1e293b]">{amountLabel}:</span>}
                <span className={cn("font-black text-primary", isToday ? "text-lg" : "text-xl")}>
                    ETB {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
        </CardContent>
    </Card>
  );

export default function DashboardPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const employeesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: allEmployees, loading: employeesLoading } = useCollection<Employee>(employeesRef);
  
  const activeEmployees = useMemo(() => allEmployees?.filter(e => e.status !== 'Inactive') || [], [allEmployees]);

  const [lazyAttendance, setLazyAttendance] = useState<AttendanceRecord[]>([]);
  const [unifiedAttendance, setUnifiedAttendance] = useState<AttendanceRecord[]>([]);
  const [lazyLoading, setLazyLoading] = useState(false);
  const [unifiedLoading, setUnifiedLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("today");

  const [selectedDay, setSelectedDay] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd"));
  const [selectedMonthStart, setSelectedMonthStart] = useState<string>(format(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1), "yyyy-MM-dd"));
  const [selectedUnifiedMonth, setSelectedUnifiedMonth] = useState<string>(format(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1), "yyyy-MM-dd"));

  const settingsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "metadata", "payroll_settings");
  }, [firestore, user]);
  const { data: settings } = useDoc<PayrollSettings>(settingsRef);

  const normalOTRate = settings?.normalOvertimeRate || 1.5;
  const sundayOTRate = settings?.sundayOvertimeRate || 2.0;

  useEffect(() => { setTitle("Dashboard"); }, [setTitle]);

  const todayAttendanceRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance', selectedDay, 'records');
  }, [firestore, user, selectedDay]);
  const { data: todayRecords } = useCollection<AttendanceRecord>(todayAttendanceRef);

  useEffect(() => {
    const fetchLazyData = async () => {
        if (!firestore || !user || activeTab === 'today') return;
        setLazyLoading(true);
        try {
            let start, end;
            if (activeTab === 'week') {
                start = startOfDay(new Date(selectedWeekStart));
                end = endOfDay(endOfWeek(start, { weekStartsOn: 0 }));
            } else {
                start = startOfDay(new Date(selectedMonthStart));
                const eth = toEthiopian(start);
                end = endOfDay(addDays(start, getEthiopianMonthDays(eth.year, eth.month) - 1));
            }
            
            const records: AttendanceRecord[] = [];
            const targetEmployees = activeEmployees.filter(e => 
                activeTab === 'week' ? e.paymentMethod === 'Weekly' : e.paymentMethod === 'Monthly'
            );

            const fetchPromises = targetEmployees.map(async (emp) => {
                const q = query(
                    collection(firestore, 'employees', emp.id, 'attendance'), 
                    where('date', '>=', start.toISOString()), 
                    where('date', '<=', end.toISOString())
                );
                const snap = await getDocs(q);
                snap.forEach(d => records.push({ ...d.data(), employeeId: emp.id, id: d.id } as AttendanceRecord));
            });
            await Promise.all(fetchPromises);
            setLazyAttendance(records);
        } catch (e) {} finally { setLazyLoading(false); }
    };
    if (activeEmployees.length > 0 && activeTab !== 'today') fetchLazyData();
  }, [activeTab, selectedWeekStart, selectedMonthStart, activeEmployees, firestore, user]);

  useEffect(() => {
    const fetchUnifiedData = async () => {
        if (!firestore || !user || !selectedUnifiedMonth) return;
        setUnifiedLoading(true);
        try {
            const start = startOfDay(new Date(selectedUnifiedMonth));
            const eth = toEthiopian(start);
            const end = endOfDay(addDays(start, getEthiopianMonthDays(eth.year, eth.month) - 1));
            const records: AttendanceRecord[] = [];
            const fetchPromises = activeEmployees.map(async (emp) => {
                const q = query(collection(firestore, 'employees', emp.id, 'attendance'), where('date', '>=', start.toISOString()), where('date', '<=', end.toISOString()));
                const snap = await getDocs(q);
                snap.forEach(d => records.push({ ...d.data(), employeeId: emp.id, id: d.id } as AttendanceRecord));
            });
            await Promise.all(fetchPromises);
            setUnifiedAttendance(records);
        } catch (e) {} finally { setUnifiedLoading(false); }
    };
    if (activeEmployees.length > 0) fetchUnifiedData();
  }, [selectedUnifiedMonth, activeEmployees, firestore, user]);

  const dailyEarnings = useMemo(() => {
    if (!activeEmployees || !selectedDay) return [];
    return activeEmployees.map(emp => {
        const record = todayRecords?.find(r => r.employeeId === emp.id);
        const recordDayDate = new Date(selectedDay);
        const isSunday = getDay(recordDayDate) === 0;
        const isSaturday = getDay(recordDayDate) === 6;

        let amount = 0;
        let lateMins = record ? calculateMinutesLate(record) : 0;
        let absentHours = 0;
        let otHours = record?.overtimeHours || 0;
        let otAmount = 0;

        if (emp.paymentMethod === 'Weekly') {
            const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            if (record) {
                amount = (calculateHoursWorked(record) * (hourly || 0)) + (otHours * (hourly || 0) * normalOTRate);
                otAmount = otHours * (hourly || 0) * normalOTRate;
                if (record.morningStatus === 'Absent') absentHours += 4.5;
                if (record.afternoonStatus === 'Absent') absentHours += 3.5;
            } else if (isSunday) {
                amount = (hourly || 0) * 8;
            } else {
                absentHours = 8;
            }
        } else {
            const units = getMonthlyWorkingUnits(recordDayDate, 30);
            const hourly = (emp.monthlyRate || 0) / units / 8;
            const daily = (emp.monthlyRate || 0) / units;
            const minuteRate = hourly / 60;

            if (record) {
                let absenceDeduction = 0;
                if (record.morningStatus === 'Absent') { absenceDeduction += 4.5 * hourly; absentHours += 4.5; }
                if (record.afternoonStatus === 'Absent' && !isSaturday) { absenceDeduction += 3.5 * hourly; absentHours += 3.5; }
                
                let lateDeduction = lateMins * minuteRate;
                otAmount = otHours * hourly * normalOTRate;

                if (isSunday) {
                    const isWorking = record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent';
                    if (isWorking) {
                        let sundHours = 0;
                        if (record.morningStatus !== 'Absent') sundHours += 4.5;
                        if (record.afternoonStatus !== 'Absent') sundHours += 3.5;
                        otAmount += sundHours * hourly * sundayOTRate;
                        otHours += sundHours;
                    }
                } else if (isSaturday) {
                    const workingPM = record.afternoonStatus === 'Present' || record.afternoonStatus === 'Late';
                    if (workingPM) {
                        otAmount += 3.5 * hourly * normalOTRate;
                        otHours += 3.5;
                    }
                }

                amount = daily - absenceDeduction - lateDeduction + otAmount;
            } else if (!isSunday) absentHours = isSaturday ? 4.5 : 8;
        }

        const visualStatus = record ? getOverallStatus(record.morningStatus, record.afternoonStatus) : "Absent";
        return { 
            employeeId: emp.id, name: emp.name, morning: record?.morningEntry || "—", afternoon: record?.afternoonEntry || "—",
            status: visualStatus, amount, overtimeHours: otHours, overtimeAmount: otAmount, lateMins, absentHours, paymentMethod: emp.paymentMethod
        };
    });
  }, [activeEmployees, todayRecords, selectedDay, normalOTRate, sundayOTRate]);

  const weeklySummary = useMemo(() => {
    const weeklyEmps = activeEmployees.filter(e => e.paymentMethod === 'Weekly');
    let grandTotal = 0;
    const data = weeklyEmps.map(emp => {
        const records = lazyAttendance.filter(r => r.employeeId === emp.id);
        const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
        let totalOTHours = records.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        let baseHours = records.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
        let lateMins = records.reduce((acc, r) => acc + calculateMinutesLate(r), 0);
        let absentHours = 0;
        const start = startOfDay(new Date(selectedWeekStart));
        const end = endOfDay(endOfWeek(start, { weekStartsOn: 0 }));
        const interval = eachDayOfInterval({ start, end });
        const recordedDays = new Set(records.map(r => r.id));

        records.forEach(r => {
            if (r.morningStatus === 'Absent') absentHours += 4.5;
            if (r.afternoonStatus === 'Absent') absentHours += 3.5;
        });
        interval.forEach(day => { if (getDay(day) !== 0 && !recordedDays.has(format(day, 'yyyy-MM-dd'))) absentHours += 8; });

        const total = (baseHours * (hourly || 0)) + (totalOTHours * (hourly || 0) * normalOTRate);
        const otAmount = totalOTHours * (hourly || 0) * normalOTRate;
        grandTotal += total;
        return { emp, total, lateMins, absentHours, overtimeHours: totalOTHours, overtimeAmount: otAmount };
    });
    return { data, grandTotal };
  }, [activeEmployees, lazyAttendance, selectedWeekStart, normalOTRate]);

  const monthlySummary = useMemo(() => {
    const monthlyEmps = activeEmployees.filter(e => e.paymentMethod === 'Monthly');
    let grandTotal = 0;
    const data = monthlyEmps.map(emp => {
        const records = lazyAttendance.filter(r => r.employeeId === emp.id);
        const start = startOfDay(new Date(selectedMonthStart));
        const eth = toEthiopian(start);
        const daysInMonth = getEthiopianMonthDays(eth.year, eth.month);
        const units = getMonthlyWorkingUnits(start, daysInMonth);
        const hourly = (emp.monthlyRate || 0) / units / 8;
        const minuteRate = hourly / 60;

        const ethYearForPeriod = eth.year;
        const permissionDatesInYear = new Set<string>();
        lazyAttendance.filter(r => r.employeeId === emp.id).forEach(rec => {
            if (rec.id && parse(rec.id, "yyyy-MM-dd", new Date()).getFullYear() === ethYearForPeriod) {
                if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') permissionDatesInYear.add(rec.id);
            }
        });
        const allowedPermissionDates = new Set(Array.from(permissionDatesInYear).sort().slice(0, 15));

        let lateMins = 0, otHours = 0, otAmount = 0, absentHours = 0, totalDeduction = 0;
        const recordedDates = new Set(records.map(r => r.id));
        const today = new Date();

        records.forEach(r => {
            if (!r.id) return;
            const d = parse(r.id, "yyyy-MM-dd", new Date());
            const isSun = getDay(d) === 0, isSat = getDay(d) === 6;

            if (isSun) {
                const working = r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent';
                if (working) {
                    let sH = (r.morningStatus !== 'Absent' ? 4.5 : 0) + (r.afternoonStatus !== 'Absent' ? 3.5 : 0);
                    otAmount += sH * hourly * sundayOTRate;
                    otHours += sH;
                }
            } else {
                let mAbs = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(r.id));
                let pAbs = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(r.id));
                if (mAbs) { totalDeduction += 4.5 * hourly; absentHours += 4.5; }
                if (pAbs && !isSat) { totalDeduction += 3.5 * hourly; absentHours += 3.5; }
                if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) {
                    otAmount += 3.5 * hourly * normalOTRate;
                    otHours += 3.5;
                }
                lateMins += calculateMinutesLate(r);
            }
            if (r.overtimeHours) { otHours += r.overtimeHours; otAmount += r.overtimeHours * hourly * normalOTRate; }
        });

        eachDayOfInterval({ start, end: addDays(start, daysInMonth - 1) }).forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (day <= today && getDay(day) !== 0 && !recordedDates.has(dayStr)) {
                const abs = getDay(day) === 6 ? 4.5 : 8;
                absentHours += abs; totalDeduction += abs * hourly;
            }
        });

        const netSalary = (emp.monthlyRate || 0) - totalDeduction - (lateMins * minuteRate) + otAmount;
        grandTotal += netSalary;
        return { emp, lateMins, total: netSalary, absentHours, overtimeHours: otHours, overtimeAmount: otAmount };
    });
    return { data, grandTotal };
  }, [activeEmployees, lazyAttendance, selectedMonthStart, normalOTRate, sundayOTRate]);

  const unifiedMonthTotal = useMemo(() => {
    if (!selectedUnifiedMonth || activeEmployees.length === 0) return 0;
    const start = startOfDay(new Date(selectedUnifiedMonth));
    const eth = toEthiopian(start);
    const daysInMonth = getEthiopianMonthDays(eth.year, eth.month);
    const units = getMonthlyWorkingUnits(start, daysInMonth);
    const today = new Date();
    let totalExpenditure = 0;

    activeEmployees.forEach(emp => {
        const records = unifiedAttendance.filter(r => r.employeeId === emp.id);
        const recordedDates = new Set(records.map(r => r.id));
        if (emp.paymentMethod === 'Monthly') {
            const baseSalary = emp.monthlyRate || 0;
            const hourly = baseSalary / units / 8;
            const minuteRate = hourly / 60;
            let otAmount = 0, totalDeduction = 0, lateMins = 0;

            const permissionDatesInYear = new Set<string>();
            unifiedAttendance.filter(r => r.employeeId === emp.id).forEach(rec => {
                if (rec.id && parse(rec.id, "yyyy-MM-dd", new Date()).getFullYear() === eth.year) {
                    if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') permissionDatesInYear.add(rec.id);
                }
            });
            const allowedPermissionDates = new Set(Array.from(permissionDatesInYear).sort().slice(0, 15));

            records.forEach(r => {
                if (!r.id) return;
                const d = parse(r.id, "yyyy-MM-dd", new Date());
                const isSun = getDay(d) === 0, isSat = getDay(d) === 6;
                if (isSun) {
                    const working = r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent';
                    if (working) {
                        let sH = (r.morningStatus !== 'Absent' ? 4.5 : 0) + (r.afternoonStatus !== 'Absent' ? 3.5 : 0);
                        otAmount += sH * hourly * sundayOTRate;
                    }
                } else {
                    let mAbs = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(r.id));
                    let pAbs = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(r.id));
                    if (mAbs) totalDeduction += 4.5 * hourly;
                    if (pAbs && !isSat) totalDeduction += 3.5 * hourly;
                    if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) otAmount += 3.5 * hourly * normalOTRate;
                    lateMins += calculateMinutesLate(r);
                }
                if (r.overtimeHours) otAmount += r.overtimeHours * hourly * normalOTRate;
            });
            eachDayOfInterval({ start, end: addDays(start, daysInMonth - 1) }).forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                if (day <= today && getDay(day) !== 0 && !recordedDates.has(dayStr)) totalDeduction += (getDay(day) === 6 ? 4.5 : 8) * hourly;
            });
            totalExpenditure += baseSalary - totalDeduction - (lateMins * minuteRate) + otAmount;
        } else {
            const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            let empTotal = 0;
            records.forEach(r => { empTotal += (calculateHoursWorked(r) * (hourly || 0)) + ((r.overtimeHours || 0) * (hourly || 0) * normalOTRate); });
            totalExpenditure += empTotal;
        }
    });
    return totalExpenditure;
  }, [activeEmployees, unifiedAttendance, selectedUnifiedMonth, normalOTRate, sundayOTRate]);

  const periodOptions = useMemo(() => {
    const now = new Date();
    const w = []; let ws = startOfWeek(now, { weekStartsOn: 0 });
    for(let i=0; i<12; i++){
        const we = endOfWeek(ws, { weekStartsOn: 0 });
        w.push({ value: format(ws, "yyyy-MM-dd"), label: `Week: ${ethiopianDateFormatter(ws, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(we, { day: 'numeric', month: 'short', year: 'numeric' })}` });
        ws = addDays(ws, -7);
    }
    const m = []; let ms = toGregorian(toEthiopian(now).year, toEthiopian(now).month, 1);
    for(let i=0; i<12; i++){
        const eth = toEthiopian(ms);
        m.push({ value: format(ms, "yyyy-MM-dd"), label: `${ethiopianDateFormatter(ms, { month: 'long' })} ${eth.year}` });
        ms = toGregorian(eth.month === 1 ? eth.year - 1 : eth.year, eth.month === 1 ? 12 : eth.month - 1, 1);
    }
    return { weeks: w, months: m };
  }, []);

  const totalDailyEarnings = useMemo(() => dailyEarnings.reduce((acc, curr) => acc + curr.amount, 0), [dailyEarnings]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Team" value={activeEmployees.length} icon={<Users className="h-5 w-5 text-blue-600" />} />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-site Today</CardTitle>
            <UserCheck className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{dailyEarnings.filter(e => e.status !== 'Absent').length} / {activeEmployees.length}</div>
            <Progress value={activeEmployees.length > 0 ? (dailyEarnings.filter(e => e.status !== 'Absent').length / activeEmployees.length) * 100 : 0} className="h-2" />
          </CardContent>
        </Card>
        <StatCard title="Total Daily Cost" value={`ETB ${totalDailyEarnings.toLocaleString()}`} icon={<Wallet2 className="h-5 w-5 text-amber-600" />} />
        <StatCard title="Unified Expenditure" value={`ETB ${unifiedMonthTotal.toLocaleString()}`} icon={<Wallet className="h-5 w-5 text-purple-600" />} />
      </div>

       <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-6">
                <div>
                    <CardTitle className="text-xl">Detailed Overview</CardTitle>
                    <CardDescription>Track payments and performance across periods</CardDescription>
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 px-4 flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-primary" /> 
                          {ethiopianDateFormatter(new Date(selectedDay), { month: 'long', day: 'numeric', year: 'numeric' })}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" selected={new Date(selectedDay)} onSelect={(d) => d && setSelectedDay(format(d, "yyyy-MM-dd"))} initialFocus />
                    </PopoverContent>
                </Popover>
            </CardHeader>
            <CardContent className="pt-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-3 mb-8 h-12">
                        <TabsTrigger value="today">Today</TabsTrigger>
                        <TabsTrigger value="week">This Week</TabsTrigger>
                        <TabsTrigger value="month">This Month</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="today" className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {dailyEarnings.map(item => (
                                <EmployeeCard 
                                    key={item.employeeId}
                                    employeeId={item.employeeId}
                                    name={item.name}
                                    paymentMethod={item.paymentMethod}
                                    lateMins={item.lateMins}
                                    absentHours={item.absentHours}
                                    overtimeHours={item.overtimeHours}
                                    overtimeAmount={item.overtimeAmount}
                                    total={item.amount}
                                    amountLabel="Daily Earn"
                                    morning={item.morning}
                                    afternoon={item.afternoon}
                                    status={item.status}
                                    isToday={true}
                                />
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="week" className="space-y-6">
                        <div className="flex justify-center mb-6">
                            <Select value={selectedWeekStart} onValueChange={setSelectedWeekStart}>
                                <SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Select week" /></SelectTrigger>
                                <SelectContent>{periodOptions.weeks.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {lazyLoading ? <div className="h-40 flex items-center justify-center"><Clock className="animate-spin h-6 w-6 text-primary" /></div> : (
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {weeklySummary.data.map(({ emp, lateMins, total, absentHours, overtimeHours, overtimeAmount }) => (
                                        <EmployeeCard 
                                            key={emp.id}
                                            employeeId={emp.id}
                                            name={emp.name}
                                            paymentMethod="Weekly"
                                            lateMins={lateMins}
                                            absentHours={absentHours}
                                            overtimeHours={overtimeHours}
                                            overtimeAmount={overtimeAmount}
                                            total={total}
                                            amountLabel="Weekly Total"
                                            isToday={false}
                                        />
                                    ))}
                                </div>
                                <div className="mt-4 bg-[#fdf2f8] border border-[#fbcfe8] rounded-2xl p-8 text-center shadow-sm">
                                    <p className="text-[10px] font-black text-[#9d174d] uppercase tracking-widest mb-1">TOTAL WEEKLY PAYROLL</p>
                                    <p className="text-4xl font-black text-[#be185d]">ETB {weeklySummary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="month" className="space-y-6">
                        <div className="flex justify-center mb-6">
                            <Select value={selectedMonthStart} onValueChange={setSelectedMonthStart}>
                                <SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Select month" /></SelectTrigger>
                                <SelectContent>{periodOptions.months.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         {lazyLoading ? <div className="h-40 flex items-center justify-center"><Clock className="animate-spin h-6 w-6 text-primary" /></div> : (
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {monthlySummary.data.map(({ emp, lateMins, total, absentHours, overtimeHours, overtimeAmount }) => (
                                        <EmployeeCard 
                                            key={emp.id}
                                            employeeId={emp.id}
                                            name={emp.name}
                                            paymentMethod="Monthly"
                                            lateMins={lateMins}
                                            absentHours={absentHours}
                                            overtimeHours={overtimeHours}
                                            overtimeAmount={overtimeAmount}
                                            total={total}
                                            amountLabel="Month To-Date"
                                            isToday={false}
                                        />
                                    ))}
                                </div>
                                <div className="mt-4 bg-[#fdf2f8] border border-[#fbcfe8] rounded-2xl p-8 text-center shadow-sm">
                                    <p className="text-[10px] font-black text-[#9d174d] uppercase tracking-widest mb-1">TOTAL MONTHLY PAYROLL</p>
                                    <p className="text-4xl font-black text-[#be185d]">ETB {monthlySummary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>

        <Card className="shadow-lg border-primary/40 bg-primary/5">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary p-2.5 rounded-lg text-primary-foreground"><Wallet className="h-6 w-6" /></div>
                  <div>
                      <CardTitle className="text-xl">Historical Workshop Audit</CardTitle>
                      <CardDescription>Consolidated monthly expense summary</CardDescription>
                  </div>
                </div>
                <div className="w-full sm:w-[240px]">
                    <Select value={selectedUnifiedMonth} onValueChange={setSelectedUnifiedMonth}>
                        <SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Select month" /></SelectTrigger>
                        <SelectContent>{periodOptions.months.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="flex justify-center py-10">
                {unifiedLoading ? (
                    <div className="flex flex-col items-center gap-2">
                        <Clock className="animate-spin h-8 w-8 text-primary" />
                        <p className="text-xs font-bold text-muted-foreground uppercase">Calculating Audit...</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Expenditure Total</p>
                        <p className="text-5xl font-black text-primary tracking-tighter">
                            ETB {unifiedMonthTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}

