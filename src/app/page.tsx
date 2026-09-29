
"use client";

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { Users, UserCheck, Wallet, CalendarDays, Clock, TrendingUp, TrendingDown, HandCoins, Calendar as CalendarIcon, Wallet2, BarChart3, Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import type { Employee, AttendanceRecord, PayrollSettings } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, startOfDay, endOfDay, isSameDay, subDays, startOfMonth } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser, useDoc } from "@/firebase";
import { collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import Link from 'next/link';
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { sendAdminPayrollSummary } from "@/app/payroll/actions";

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
                <Link href={`/employees/${employeeId}`} className="group inline-flex items-center gap-1">
                    <h3 className="font-semibold text-[#1e293b] text-base group-hover:text-primary transition-colors underline decoration-transparent group-hover:decoration-primary/30 underline-offset-4">{name}</h3>
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
                <span className={cn("font-semibold text-primary", isToday ? "text-lg" : "text-xl")}>
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
  const { toast } = useToast();
  
  const employeesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: allEmployees, loading: employeesLoading } = useCollection<Employee>(employeesRef);
  
  const activeEmployees = useMemo(() => allEmployees?.filter(e => e.status !== 'Inactive') || [], [allEmployees]);

  const [lazyAttendance, setLazyAttendance] = useState<AttendanceRecord[]>([]);
  const [unifiedAttendance, setUnifiedAttendance] = useState<AttendanceRecord[]>([]);
  const [currentMonthAttendance, setCurrentMonthAttendance] = useState<AttendanceRecord[]>([]);
  
  const [lazyLoading, setLazyLoading] = useState(false);
  const [unifiedLoading, setUnifiedLoading] = useState(false);
  const [realTimeLoading, setRealTimeLoading] = useState(true);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [activeTab, setActiveTab] = useState("today");

  const [selectedDay, setSelectedDay] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd"));
  const [selectedMonthStart, setSelectedMonthStart] = useState<string>(format(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1), "yyyy-MM-dd"));
  const [selectedUnifiedMonth, setSelectedUnifiedMonth] = useState<string>(format(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1), "yyyy-MM-dd"));
  
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    const fetchCurrentMonthData = async () => {
        if (!firestore || !user || !allEmployees || allEmployees.length === 0) return;
        setRealTimeLoading(true);
        try {
            const nowLocal = new Date();
            const start = startOfDay(subDays(toGregorian(toEthiopian(nowLocal).year, toEthiopian(nowLocal).month, 1), 7));
            const end = endOfDay(nowLocal);
            
            const records: AttendanceRecord[] = [];
            const fetchPromises = allEmployees.map(async (emp) => {
                const q = query(
                    collection(firestore, 'employees', emp.id, 'attendance'), 
                    where('date', '>=', start.toISOString()), 
                    where('date', '<=', end.toISOString())
                );
                const snap = await getDocs(q);
                snap.forEach(d => records.push({ ...d.data(), employeeId: emp.id, id: d.id } as AttendanceRecord));
            });
            await Promise.all(fetchPromises);
            setCurrentMonthAttendance(records);
        } catch (e) {} finally { setRealTimeLoading(false); }
    };
    fetchCurrentMonthData();
  }, [allEmployees, firestore, user]);

  useEffect(() => {
    const fetchLazyData = async () => {
        if (!firestore || !user || activeTab === 'today' || !allEmployees) return;
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
            const targetEmployees = allEmployees.filter(e => 
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
    if (allEmployees && allEmployees.length > 0 && activeTab !== 'today') fetchLazyData();
  }, [activeTab, selectedWeekStart, selectedMonthStart, allEmployees, firestore, user]);

  useEffect(() => {
    const fetchUnifiedData = async () => {
        if (!firestore || !user || !selectedUnifiedMonth || !allEmployees) return;
        setUnifiedLoading(true);
        try {
            const start = startOfDay(new Date(selectedUnifiedMonth));
            const eth = toEthiopian(start);
            const end = endOfDay(addDays(start, getEthiopianMonthDays(eth.year, eth.month) - 1));
            const records: AttendanceRecord[] = [];
            const fetchPromises = allEmployees.map(async (emp) => {
                const q = query(collection(firestore, 'employees', emp.id, 'attendance'), where('date', '>=', start.toISOString()), where('date', '<=', end.toISOString()));
                const snap = await getDocs(q);
                snap.forEach(d => {
                  records.push({ ...d.data(), employeeId: emp.id, id: d.id } as AttendanceRecord);
                });
            });
            await Promise.all(fetchPromises);
            setUnifiedAttendance(records);
        } catch (e) {} finally { setUnifiedLoading(false); }
    };
    if (allEmployees && allEmployees.length > 0) fetchUnifiedData();
  }, [selectedUnifiedMonth, allEmployees, firestore, user]);

  const liveTotals = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0 || realTimeLoading) return { today: 0, week: 0, month: 0, onSite: 0 };
    
    const nowLocal = new Date();
    const todayStr = format(nowLocal, "yyyy-MM-dd");
    const weekStart = startOfDay(startOfWeek(nowLocal, { weekStartsOn: 0 }));
    const monthStart = startOfDay(toGregorian(toEthiopian(nowLocal).year, toEthiopian(nowLocal).month, 1));
    const ethNow = toEthiopian(nowLocal);
    const units = getMonthlyWorkingUnits(monthStart, getEthiopianMonthDays(ethNow.year, ethNow.month));

    let todayCost = 0;
    let weekCost = 0;
    let monthCost = 0;
    let onSite = 0;

    allEmployees.forEach(emp => {
        const empRecords = currentMonthAttendance.filter(r => r.employeeId === emp.id);
        const todayRec = empRecords.find(r => r.id === todayStr);
        if (todayRec && (todayRec.morningStatus !== 'Absent' || todayRec.afternoonStatus !== 'Absent')) onSite++;

        const empStartDate = startOfDay(new Date(emp.attendanceStartDate || 0));
        const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;

        const calcRecCost = (r: AttendanceRecord, date: Date) => {
            const isSun = getDay(date) === 0;
            const isSat = getDay(date) === 6;
            const isInactiveDay = empInactiveDate && date >= empInactiveDate;
            const isBeforeStart = date < empStartDate;

            if (isInactiveDay || isBeforeStart) return 0;

            let cost = 0;
            if (emp.paymentMethod === 'Weekly') {
                const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                cost = (calculateHoursWorked(r) * (hourly || 0)) + ((r.overtimeHours || 0) * (hourly || 0) * normalOTRate);
                if (isSun && r.morningStatus !== 'Absent') cost += 8 * (hourly || 0) * (sundayOTRate - 1);
            } else {
                const hourly = (emp.monthlyRate || 0) / units / 8;
                const daily = (emp.monthlyRate || 0) / units;
                let deduction = 0;
                if (r.morningStatus === 'Absent') deduction += 4.5 * hourly;
                if (r.afternoonStatus === 'Absent' && !isSat) deduction += 3.5 * hourly;
                deduction += calculateMinutesLate(r) * (hourly / 60);

                let ot = (r.overtimeHours || 0) * hourly * normalOTRate;
                if (isSun && (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')) ot += 8 * hourly * sundayOTRate;
                else if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) ot += 3.5 * hourly * normalOTRate;

                cost = daily - deduction + ot;
            }
            return cost;
        };

        empRecords.forEach(r => {
            const d = parse(r.id!, "yyyy-MM-dd", new Date());
            const cost = calcRecCost(r, d);
            if (isSameDay(d, nowLocal)) todayCost += cost;
            if (d >= weekStart) weekCost += cost;
            monthCost += cost;
        });

        const recordedDaysSet = new Set(empRecords.map(r => r.id));
        eachDayOfInterval({ start: monthStart, end: nowLocal }).forEach(day => {
            const ds = format(day, "yyyy-MM-dd");
            const isInactive = empInactiveDate && day >= empInactiveDate;
            const isBeforeStart = day < empStartDate;

            if (!recordedDaysSet.has(ds)) {
                if (isInactive || isBeforeStart) return;

                if (getDay(day) === 0) {
                     if (emp.paymentMethod === 'Weekly') weekCost += (emp.dailyRate || 0);
                }
            }
        });
    });

    return { today: todayCost, week: weekCost, month: monthCost, onSite };
  }, [allEmployees, currentMonthAttendance, realTimeLoading, normalOTRate, sundayOTRate]);

  const weeklyChartData = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0 || realTimeLoading) return [];
    
    const nowLocal = new Date();
    const chartData = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = subDays(nowLocal, i);
        const dayStr = format(date, "yyyy-MM-dd");
        const ethDay = ethiopianDateFormatter(date, { weekday: 'short' }).toUpperCase();
        
        let dailyTotal = 0;
        const monthStart = startOfMonth(date);
        const units = getMonthlyWorkingUnits(monthStart, 30);

        allEmployees.forEach(emp => {
            const rec = currentMonthAttendance.find(r => r.employeeId === emp.id && r.id === dayStr);
            const empStartDate = startOfDay(new Date(emp.attendanceStartDate || 0));
            const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;

            const isSun = getDay(date) === 0;
            const isSat = getDay(date) === 6;
            const isInactiveDay = empInactiveDate && date >= empInactiveDate;
            const isBeforeStart = date < empStartDate;

            if (isInactiveDay || isBeforeStart) return;

            if (rec) {
                if (emp.paymentMethod === 'Weekly') {
                    const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                    dailyTotal += (calculateHoursWorked(rec) * (hourly || 0)) + ((rec.overtimeHours || 0) * (hourly || 0) * normalOTRate);
                    if (isSun && rec.morningStatus !== 'Absent') dailyTotal += 8 * (hourly || 0) * (sundayOTRate - 1);
                } else {
                    const hourly = (emp.monthlyRate || 0) / units / 8;
                    const daily = (emp.monthlyRate || 0) / units;
                    let deduction = 0;
                    if (rec.morningStatus === 'Absent') deduction += 4.5 * hourly;
                    if (rec.afternoonStatus === 'Absent' && !isSat) deduction += 3.5 * hourly;
                    deduction += calculateMinutesLate(rec) * (hourly / 60);
                    let ot = (rec.overtimeHours || 0) * hourly * normalOTRate;
                    if (isSun && (rec.morningStatus !== 'Absent' || rec.afternoonStatus !== 'Absent')) ot += 8 * hourly * sundayOTRate;
                    else if (isSat && (rec.afternoonStatus === 'Present' || rec.afternoonStatus === 'Late')) ot += 3.5 * hourly * normalOTRate;
                    dailyTotal += daily - deduction + ot;
                }
            } else if (isSun && emp.paymentMethod === 'Weekly') {
                dailyTotal += (emp.dailyRate || 0);
            }
        });
        
        chartData.push({ name: ethDay, total: dailyTotal });
    }
    return chartData;
  }, [allEmployees, currentMonthAttendance, realTimeLoading, normalOTRate, sundayOTRate]);

  const todayTrendPercent = useMemo(() => {
    if (weeklyChartData.length < 2 || realTimeLoading) return 0;
    const today = weeklyChartData[6].total;
    const pastDays = weeklyChartData.slice(0, 6);
    const average = pastDays.reduce((acc, curr) => acc + curr.total, 0) / 6;
    if (average === 0) return today > 0 ? 100 : 0;
    return ((today - average) / average) * 100;
  }, [weeklyChartData, realTimeLoading]);

  const dailyEarnings = useMemo(() => {
    if (!activeEmployees || !selectedDay) return [];
    return activeEmployees.map(emp => {
        const record = todayRecords?.find(r => r.employeeId === emp.id);
        const recordDayDate = new Date(selectedDay);
        const isSunday = getDay(recordDayDate) === 0;
        const isSaturday = getDay(recordDayDate) === 6;
        const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;
        const isInactive = empInactiveDate && recordDayDate >= empInactiveDate;

        let amount = 0;
        let lateMins = record ? calculateMinutesLate(record) : 0;
        let absentHours = 0;
        let otHours = record?.overtimeHours || 0;
        let otAmount = 0;

        if (isInactive) {
            return { 
                employeeId: emp.id, name: emp.name, morning: "—", afternoon: "—",
                status: "Inactive", amount: 0, overtimeHours: 0, overtimeAmount: 0, lateMins: 0, absentHours: 0, paymentMethod: emp.paymentMethod
            };
        }

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
        const recordedDaysSet = new Set(records.map(r => r.id));
        const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;

        records.forEach(r => {
            const rDate = parse(r.id!, "yyyy-MM-dd", new Date());
            const isInactive = empInactiveDate && rDate >= empInactiveDate;
            if (isInactive) return;

            if (r.morningStatus === 'Absent') absentHours += 4.5;
            if (r.afternoonStatus === 'Absent') absentHours += 3.5;
        });

        interval.forEach(day => { 
            const isInactive = empInactiveDate && day >= empInactiveDate;
            if (getDay(day) !== 0 && !recordedDaysSet.has(format(day, 'yyyy-MM-dd')) && !isInactive) absentHours += 8; 
        });

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
        const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;
        const employeeStartDate = startOfDay(new Date(emp.attendanceStartDate || 0));

        const ethYearForPeriod = eth.year;
        const permissionDatesInYear = new Set<string>();
        lazyAttendance.filter(r => r.employeeId === emp.id).forEach(rec => {
            if (rec.id && parse(rec.id, "yyyy-MM-dd", new Date()).getFullYear() === ethYearForPeriod) {
                if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') permissionDatesInYear.add(rec.id);
            }
        });
        const allowedPermissionDates = new Set(Array.from(permissionDatesInYear).sort().slice(0, 15));

        let lateMins = 0, otHours = 0, otAmount = 0, absentHours = 0, totalDeduction = 0;
        const recordedDaysSet = new Set(records.map(r => r.id));
        const today = new Date();

        records.forEach(r => {
            if (!r.id) return;
            const d = parse(r.id, "yyyy-MM-dd", new Date());
            const isInactive = empInactiveDate && d >= empInactiveDate;
            const isSun = getDay(d) === 0, isSat = getDay(d) === 6;

            if (isInactive) {
                if (!isSun) {
                    const abs = isSat ? 4.5 : 8;
                    absentHours += abs; totalDeduction += abs * hourly;
                }
                return;
            }

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
            const isInactive = empInactiveDate && day >= empInactiveDate;
            const isBeforeStart = day < employeeStartDate;

            if (!recordedDaysSet.has(dayStr) && getDay(day) !== 0) {
                if (day <= today || isInactive || isBeforeStart) {
                    const abs = getDay(day) === 6 ? 4.5 : 8;
                    absentHours += abs; totalDeduction += abs * hourly;
                }
            }
        });

        const netSalary = (emp.monthlyRate || 0) - totalDeduction - (lateMins * minuteRate) + otAmount;
        grandTotal += netSalary;
        return { emp, lateMins, total: netSalary, absentHours, overtimeHours: otHours, overtimeAmount: otAmount };
    });
    return { data, grandTotal };
  }, [activeEmployees, lazyAttendance, selectedMonthStart, normalOTRate, sundayOTRate]);

  const handleMarkPaid = async (type: 'Weekly' | 'Monthly', data: any[], periodLabel: string, periodValue: string) => {
    if (!firestore || !user || data.length === 0) return;
    setIsMarkingPaid(true);

    const batch = writeBatch(firestore);
    const recordedAt = new Date().toISOString();
    let telegramSummary = `✅ *PAYROLL MARKED AS PAID*\n`;
    telegramSummary += `📊 Type: ${type}\n`;
    telegramSummary += `📅 Period: ${periodLabel}\n`;
    telegramSummary += `--------------------\n\n`;

    let totalAmount = 0;

    data.forEach(item => {
      const employeeId = item.emp?.id || item.employeeId;
      const employeeName = item.emp?.name || item.name;
      const amount = item.total || item.amount || 0;
      totalAmount += amount;

      // Deterministic ID to prevent duplicates for the same period
      const payoutId = `payout_${type.toUpperCase()}_${employeeId}_${periodValue}`;
      const recordRef = doc(firestore, 'employeeExpenses', payoutId);

      batch.set(recordRef, {
        id: payoutId,
        employeeId,
        employeeName,
        amount,
        type,
        period: periodValue,
        periodLabel,
        recordedAt,
        paymentStatus: 'Paid',
        category: 'Payroll',
        details: {
           lateMins: item.lateMins || 0,
           absentHours: item.absentHours || 0,
           overtimeHours: item.overtimeHours || 0,
           overtimeAmount: item.overtimeAmount || 0,
        }
      }, { merge: true });

      telegramSummary += `• *${employeeName}*: ETB ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    });

    telegramSummary += `\n--------------------\n`;
    telegramSummary += `*TOTAL PAID: ETB ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}*`;

    try {
      await batch.commit();
      await sendAdminPayrollSummary(telegramSummary);
      toast({ title: "Payroll Recorded", description: `Saved ${data.length} payouts to database and notified admin.` });
    } catch (e) {
      toast({ variant: 'destructive', title: "Error", description: "Failed to process payment records." });
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const unifiedMonthTotal = useMemo(() => {
    if (!selectedUnifiedMonth || !allEmployees || allEmployees.length === 0) return 0;
    const start = startOfDay(new Date(selectedUnifiedMonth));
    const eth = toEthiopian(start);
    const daysInMonth = getEthiopianMonthDays(eth.year, eth.month);
    const units = getMonthlyWorkingUnits(start, daysInMonth);
    const today = new Date();
    let totalExpenditure = 0;

    allEmployees.forEach(emp => {
        const records = unifiedAttendance.filter(r => r.employeeId === emp.id);
        const empRecordedDaysSet = new Set(records.map(r => r.id));
        const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;
        const empStartDate = startOfDay(new Date(emp.attendanceStartDate || 0));

        if (emp.paymentMethod === 'Monthly') {
            const baseSalary = emp.monthlyRate || 0;
            const hourly = baseSalary / units / 8;
            const minuteRate = hourly / 60;
            let otAmount = 0, totalDeduction = 0, lateMins = 0;

            const permissionDatesInYear = new Set<string>();
            records.forEach(rec => {
                if (rec.id && parse(rec.id, "yyyy-MM-dd", new Date()).getFullYear() === eth.year) {
                    if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') permissionDatesInYear.add(rec.id);
                }
            });
            const allowedPermissionDates = new Set(Array.from(permissionDatesInYear).sort().slice(0, 15));

            records.forEach(r => {
                if (!r.id) return;
                const d = parse(r.id, "yyyy-MM-dd", new Date());
                const isInactiveDay = empInactiveDate && d >= empInactiveDate;
                const isSun = getDay(d) === 0, isSat = getDay(d) === 6;

                if (isInactiveDay) {
                    if (!isSun) totalDeduction += (isSat ? 4.5 : 8) * hourly;
                    return;
                }

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
                const isInactive = empInactiveDate && day >= empInactiveDate;
                const isBeforeStart = day < empStartDate;

                if (getDay(day) !== 0 && !empRecordedDaysSet.has(dayStr)) {
                    if (day <= today || isInactive || isBeforeStart) {
                        totalDeduction += (getDay(day) === 6 ? 4.5 : 8) * hourly;
                    }
                }
            });
            totalExpenditure += baseSalary - totalDeduction - (lateMins * minuteRate) + otAmount;
        } else {
            const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            let empTotal = 0;
            records.forEach(r => { 
                const d = parse(r.id!, "yyyy-MM-dd", new Date());
                const isInactiveDay = empInactiveDate && d >= empInactiveDate;
                const isBeforeStart = d < empStartDate;
                if (!isInactiveDay && !isBeforeStart) {
                    empTotal += (calculateHoursWorked(r) * (hourly || 0)) + ((r.overtimeHours || 0) * (hourly || 0) * normalOTRate); 
                }
            });
            totalExpenditure += empTotal;
        }
    });
    return totalExpenditure;
  }, [allEmployees, unifiedAttendance, selectedUnifiedMonth, normalOTRate, sundayOTRate]);

  const periodOptions = useMemo(() => {
    const nowLocal = new Date();
    const w = []; let ws = startOfWeek(nowLocal, { weekStartsOn: 0 });
    for(let i=0; i<12; i++){
        const we = endOfWeek(ws, { weekStartsOn: 0 });
        w.push({ value: format(ws, "yyyy-MM-dd"), label: `Week: ${ethiopianDateFormatter(ws, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(we, { day: 'numeric', month: 'short', year: 'numeric' })}` });
        ws = addDays(ws, -7);
    }
    const m = []; let ms = toGregorian(toEthiopian(nowLocal).year, toEthiopian(nowLocal).month, 1);
    for(let i=0; i<12; i++){
        const eth = toEthiopian(ms);
        m.push({ value: format(ms, "yyyy-MM-dd"), label: `${ethiopianDateFormatter(ms, { month: 'long' })} ${eth.year}` });
        ms = toGregorian(eth.month === 1 ? eth.year - 1 : eth.year, eth.month === 1 ? 12 : eth.month - 1, 1);
    }
    return { weeks: w, months: m };
  }, []);

  const isWeeklyPayWindow = useMemo(() => {
    try {
        const weekStart = startOfDay(new Date(selectedWeekStart));
        const weekEnd = startOfDay(endOfWeek(weekStart, { weekStartsOn: 0 })); // Saturday
        const windowStart = weekEnd;
        const windowEnd = endOfDay(addDays(weekEnd, 3)); // End of Tuesday
        return now >= windowStart && now <= windowEnd;
    } catch (e) { return false; }
  }, [selectedWeekStart, now]);

  const isMonthlyPayWindow = useMemo(() => {
    try {
        const monthStart = startOfDay(new Date(selectedMonthStart));
        const eth = toEthiopian(monthStart);
        const daysInMonth = getEthiopianMonthDays(eth.year, eth.month);
        const monthEnd = startOfDay(addDays(monthStart, daysInMonth - 1)); // Last day of month
        const windowStart = monthEnd;
        const windowEnd = endOfDay(addDays(monthEnd, 3)); // 3 days into next month
        return now >= windowStart && now <= windowEnd;
    } catch (e) { return false; }
  }, [selectedMonthStart, now]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <Card className="shadow-lg border-none bg-[#E8ECF6] rounded-[2.5rem] overflow-hidden mb-2 relative">
          <div className="absolute inset-0 opacity-[0.035] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#10192E 1px, transparent 1px), linear-gradient(90deg, #10192E 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          
          <CardContent className="p-8 sm:p-10 flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
              <div className="flex items-center gap-6 w-full md:w-auto shrink-0">
                  <div className="bg-white p-5 rounded-[1.5rem] text-[#3478F6] shadow-md border border-[#E7EBF3]">
                      <CalendarDays className="h-9 w-9" />
                  </div>
                  <div>
                      <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.14em] mb-2">Current Ethiopian Date</p>
                      <h2 className="text-[#10192E] tracking-tight leading-tight flex items-baseline gap-2">
                          <span className="text-xs sm:text-sm font-bold uppercase text-[#3478F6]">
                            {ethiopianDateFormatter(now, { weekday: 'short' }).toUpperCase()}
                          </span>
                          <span className="text-xl sm:text-3xl font-bold font-headline">
                            {ethiopianDateFormatter(now, { month: 'long', day: 'numeric' })}
                          </span>
                      </h2>
                  </div>
              </div>

              <div className="hidden md:block h-32 w-px bg-gradient-to-b from-[#EDF1F8] to-transparent mx-4" />

              <div className="flex-1 w-full flex flex-col gap-4">
                  <div className="flex justify-between items-end">
                      <div>
                          <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#3478F6] animate-pulse" />
                              <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.14em]">Today's Total Cost</p>
                          </div>
                          <div className="flex items-baseline gap-1">
                              <span className="text-[16px] font-semibold text-[#9AA3B8]">ETB</span>
                              <h2 className="text-[32px] font-bold text-[#10192E] tracking-tight font-headline">
                                {liveTotals.today.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </h2>
                          </div>
                      </div>
                      
                      <div className={cn(
                          "px-3 py-1.5 rounded-xl text-[12px] font-bold flex items-center gap-1.5 mb-1 shadow-sm",
                          todayTrendPercent >= 0 ? "bg-[rgba(52,194,100,0.13)] text-[#34C264]" : "bg-[rgba(255,59,48,0.1)] text-[#FF3B30]"
                      )}>
                          {todayTrendPercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {Math.abs(todayTrendPercent).toFixed(1)}%
                      </div>
                  </div>

                  <div className="w-full h-[64px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={weeklyChartData}>
                          <defs>
                            <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3478F6" stopOpacity={0.3}/>
                              <stop offset="100%" stopColor="#3478F6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <RechartsTooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white/90 backdrop-blur-md px-3 py-2 border border-[#E7EBF3] rounded-xl shadow-lg text-[10px]">
                                    <p className="font-bold text-[#3478F6] font-code">ETB {payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="total" 
                            stroke="#3478F6" 
                            strokeWidth={2.5}
                            fillOpacity={1} 
                            fill="url(#colorTrend)" 
                            animationDuration={1500}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                  </div>

                  <div className="flex justify-between text-[9.5px] font-medium text-[#9AA3B8] font-code uppercase tracking-widest px-1">
                      <span>{weeklyChartData[0]?.name}</span>
                      <span>{weeklyChartData[3]?.name}</span>
                      <span className="text-[#3478F6] font-bold">NOW</span>
                  </div>
              </div>
          </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-2">
        <Card className="col-span-2 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <CardContent className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="bg-[rgba(242,169,59,0.14)] p-4 rounded-2xl text-[#F2A93B] shadow-sm">
                        <Wallet2 className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">Today's Total</p>
                        <p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">
                            ETB {liveTotals.today.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
                <div className={cn(
                    "flex items-center gap-1 text-[11px] font-bold",
                    todayTrendPercent >= 0 ? "text-[#34C264]" : "text-[#FF3B30]"
                )}>
                    {todayTrendPercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {Math.abs(todayTrendPercent).toFixed(1)}%
                </div>
            </CardContent>
        </Card>

        <Card className="col-span-2 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-[rgba(52,194,100,0.13)] p-4 rounded-2xl text-[#34C264] shadow-sm">
                <UserCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">On-site Staff</p>
                <p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">{liveTotals.onSite} <span className="text-[#9AA3B8] font-medium">/ {activeEmployees.length}</span></p>
              </div>
            </div>
            {liveTotals.onSite === activeEmployees.length && activeEmployees.length > 0 && (
                <Badge className="bg-[rgba(52,194,100,0.13)] text-[#34C264] border-none shadow-none font-bold text-[10px] uppercase tracking-[0.06em] px-2 py-1 h-auto rounded-lg">
                    FULL
                </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 aspect-square">
            <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full gap-3">
                <div className="bg-[rgba(52,120,246,0.11)] p-3 sm:p-4 rounded-2xl text-[#3478F6] shadow-sm">
                    <HandCoins className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                    <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">Weekly Est.</p>
                    <p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">
                        {liveTotals.week.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[11px] text-[#6B7690] font-medium mt-1">ETB projected</p>
                </div>
            </CardContent>
        </Card>

        <Card className="col-span-1 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 aspect-square">
            <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full gap-3">
                <div className="bg-[rgba(139,92,246,0.12)] p-3 sm:p-4 rounded-2xl text-[#8B5CF6] shadow-sm">
                    <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                    <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">Monthly Est.</p>
                    <p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">
                        {liveTotals.month.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[11px] text-[#6B7690] font-medium mt-1">ETB projected</p>
                </div>
            </CardContent>
        </Card>
      </div>

       <Card className="shadow-lg border-none rounded-3xl overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b bg-[#EFF3FA]/50 py-6 px-8">
                <div>
                    <CardTitle className="text-2xl font-bold text-[#10192E] tracking-tight font-headline">Detailed Overview</CardTitle>
                    <CardDescription className="text-xs font-semibold text-[#9AA3B8] uppercase tracking-widest mt-1">Track payments and performance across periods</CardDescription>
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="h-12 px-6 rounded-2xl border-[#E7EBF3] flex items-center gap-3 bg-white hover:bg-[#F4F6FB] font-bold text-[#10192E] shadow-sm">
                          <CalendarIcon className="h-4 w-4 text-[#3478F6]" /> 
                          {ethiopianDateFormatter(new Date(selectedDay), { month: 'long', day: 'numeric', year: 'numeric' })}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl" align="end">
                      <Calendar mode="single" selected={new Date(selectedDay)} onSelect={(d) => d && setSelectedDay(format(d, "yyyy-MM-dd"))} initialFocus />
                    </PopoverContent>
                </Popover>
            </CardHeader>
            <CardContent className="p-8">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-3 mb-10 h-14 p-1.5 bg-[#EFF3FA] rounded-2xl">
                        <TabsTrigger value="today" className="rounded-xl font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#3478F6]">Today</TabsTrigger>
                        <TabsTrigger value="week" className="rounded-xl font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#3478F6]">This Week</TabsTrigger>
                        <TabsTrigger value="month" className="rounded-xl font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#3478F6]">This Month</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="today" className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                        <div className="flex justify-center mb-8">
                            <Select value={selectedWeekStart} onValueChange={setSelectedWeekStart}>
                                <SelectTrigger className="w-full max-w-sm h-12 rounded-2xl bg-[#F4F6FB] border-none font-bold px-6 shadow-inner"><SelectValue placeholder="Select week" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">{periodOptions.weeks.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-medium py-3">{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {lazyLoading ? <div className="h-40 flex flex-col items-center justify-center gap-3"><Clock className="animate-spin h-8 w-8 text-[#3478F6]" /><p className="text-[10px] font-bold uppercase text-[#9AA3B8] tracking-widest">Compiling Week...</p></div> : (
                            <div className="flex flex-col gap-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                                <div className="mt-4 bg-[#F4F6FB] border border-[#E7EBF3] rounded-3xl p-10 text-center shadow-sm space-y-6">
                                    <div>
                                        <p className="text-[11px] font-bold text-[#3478F6] uppercase tracking-[0.2em] mb-2">TOTAL WEEKLY PAYROLL</p>
                                        <p className="text-5xl font-bold text-[#10192E] tracking-tighter font-headline">ETB {weeklySummary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    {isWeeklyPayWindow && (
                                        <Button 
                                            onClick={() => handleMarkPaid('Weekly', weeklySummary.data, periodOptions.weeks.find(w => w.value === selectedWeekStart)?.label || selectedWeekStart, selectedWeekStart)}
                                            disabled={isMarkingPaid || weeklySummary.data.length === 0}
                                            className="h-14 px-10 rounded-2xl bg-[#3478F6] hover:bg-[#2860CC] text-white font-bold text-lg shadow-xl shadow-[#3478F6]/20 transition-all active:scale-95"
                                        >
                                            {isMarkingPaid ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                                            Mark as Paid & Notify Admin
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="month" className="space-y-6">
                        <div className="flex justify-center mb-8">
                            <Select value={selectedMonthStart} onValueChange={setSelectedMonthStart}>
                                <SelectTrigger className="w-full max-w-sm h-12 rounded-2xl bg-[#F4F6FB] border-none font-bold px-6 shadow-inner"><SelectValue placeholder="Select month" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">{periodOptions.months.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-medium py-3">{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         {lazyLoading ? <div className="h-40 flex flex-col items-center justify-center gap-3"><Clock className="animate-spin h-8 w-8 text-[#3478F6]" /><p className="text-[10px] font-bold uppercase text-[#9AA3B8] tracking-widest">Compiling Month...</p></div> : (
                            <div className="flex flex-col gap-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                                <div className="mt-4 bg-[#F4F6FB] border border-[#E7EBF3] rounded-3xl p-10 text-center shadow-sm space-y-6">
                                    <div>
                                        <p className="text-[11px] font-bold text-[#3478F6] uppercase tracking-[0.2em] mb-2">TOTAL MONTHLY PAYROLL</p>
                                        <p className="text-5xl font-bold text-[#10192E] tracking-tighter font-headline">ETB {monthlySummary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    {isMonthlyPayWindow && (
                                        <Button 
                                            onClick={() => handleMarkPaid('Monthly', monthlySummary.data, periodOptions.months.find(m => m.value === selectedMonthStart)?.label || selectedMonthStart, selectedMonthStart)}
                                            disabled={isMarkingPaid || monthlySummary.data.length === 0}
                                            className="h-14 px-10 rounded-2xl bg-[#3478F6] hover:bg-[#2860CC] text-white font-bold text-lg shadow-xl shadow-[#3478F6]/20 transition-all active:scale-95"
                                        >
                                            {isMarkingPaid ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                                            Mark as Paid & Notify Admin
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>

        <Card className="shadow-lg border-none rounded-3xl overflow-hidden ring-1 ring-[#10192E]/5">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-8 border-b border-[#E7EBF3]">
                <div className="flex items-center gap-4">
                  <div className="bg-[#3478F6] p-3.5 rounded-2xl text-white shadow-md"><Wallet className="h-7 w-7" /></div>
                  <div>
                      <CardTitle className="text-2xl font-bold text-[#10192E] tracking-tight font-headline">Historical Workshop Audit</CardTitle>
                      <CardDescription className="text-xs font-semibold text-[#9AA3B8] uppercase tracking-widest mt-1">Consolidated monthly expense summary</CardDescription>
                  </div>
                </div>
                <div className="w-full sm:w-[280px]">
                    <Select value={selectedUnifiedMonth} onValueChange={setSelectedUnifiedMonth}>
                        <SelectTrigger className="h-12 bg-white rounded-2xl border-[#E7EBF3] font-bold px-6 shadow-sm"><SelectValue placeholder="Select month" /></SelectTrigger>
                        <SelectContent className="rounded-2xl">{periodOptions.months.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-medium py-3">{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-16">
                {unifiedLoading ? (
                    <div className="flex flex-col items-center gap-4">
                        <Clock className="animate-spin h-10 w-10 text-[#3478F6] opacity-40" />
                        <p className="text-[10px] font-bold text-[#9AA3B8] uppercase tracking-[0.3em]">Calculating Audit...</p>
                    </div>
                ) : (
                    <>
                        <div className="text-center group">
                            <p className="text-[11px] font-bold text-[#9AA3B8] uppercase tracking-[0.4em] mb-4">Expenditure Total</p>
                            <p className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[#10192E] tracking-tighter font-headline">
                                ETB {unifiedMonthTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="flex items-center justify-center gap-6 mt-12 opacity-30">
                            <div className="h-[1px] w-20 bg-gradient-to-r from-transparent to-[#3478F6] rounded-full" />
                            <Sparkles className="h-6 w-6 text-[#3478F6] animate-pulse" />
                            <div className="h-[1px] w-20 bg-gradient-to-l from-transparent to-[#3478F6] rounded-full" />
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
