
"use client";

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { Users, UserCheck, Wallet, CalendarDays, Clock, TrendingUp, TrendingDown, HandCoins, Calendar as CalendarIcon, Wallet2, BarChart3, Sparkles, CheckCircle2, Loader2, History, Timer, UserX, ChevronLeft, ChevronRight, Settings2, Database } from "lucide-react";
import type { Employee, AttendanceRecord, PayrollSettings, EmployeeExpense } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, startOfDay, endOfDay, isSameDay, subDays, startOfMonth, subMonths } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser, useDoc } from "@/firebase";
import { collection, query, where, getDocs, doc, writeBatch, getDoc, setDoc, deleteDoc } from "firebase/firestore";
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
    for (let i = 0; i < 300; i++) {
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

export default function DashboardPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [realTimeLoading, setRealTimeLoading] = useState(true);
  
  const [selectedDashboardWeek, setSelectedDashboardWeek] = useState<string>(format(endOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd"));
  const [selectedDashboardMonth, setSelectedDashboardMonth] = useState<string>(() => {
    const eth = toEthiopian(new Date());
    const start = toGregorian(eth.year, eth.month, 1);
    return format(addDays(start, getEthiopianMonthDays(eth.year, eth.month) - 1), "yyyy-MM-dd");
  });
  
  const [selectedUnifiedMonth, setSelectedUnifiedMonth] = useState<string>(() => {
    const eth = toEthiopian(new Date());
    const start = toGregorian(eth.year, eth.month, 1);
    return format(addDays(start, getEthiopianMonthDays(eth.year, eth.month) - 1), "yyyy-MM-dd");
  });
  
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  const [alreadyPaidWeek, setAlreadyPaidWeek] = useState(false);
  const [alreadyPaidMonth, setAlreadyPaidMonth] = useState(false);

  // Maintenance Sync State
  const [syncType, setSyncType] = useState<'Weekly' | 'Monthly'>('Weekly');
  const [selectedSyncPeriod, setSelectedSyncPeriod] = useState<string>("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const employeesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: allEmployees, loading: employeesLoading } = useCollection<Employee>(employeesRef);
  
  const activeEmployees = useMemo(() => allEmployees?.filter(e => e.status !== 'Inactive') || [], [allEmployees]);

  const settingsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "metadata", "payroll_settings");
  }, [firestore, user]);
  const { data: settings } = useDoc<PayrollSettings>(settingsRef);

  const normalOTRate = settings?.normalOvertimeRate || 1.5;
  const sundayOTRate = settings?.sundayOvertimeRate || 2.0;

  useEffect(() => { setTitle("Dashboard"); }, [setTitle]);

  const monthOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
        const d = subMonths(today, i);
        const eth = toEthiopian(d);
        const start = toGregorian(eth.year, eth.month, 1);
        const end = addDays(start, getEthiopianMonthDays(eth.year, eth.month) - 1);
        options.push({
            value: format(end, "yyyy-MM-dd"),
            label: `${ethiopianDateFormatter(start, { month: 'long' })} ${eth.year}`
        });
    }
    return options;
  }, []);

  const weekOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    let current = startOfWeek(today, { weekStartsOn: 0 });
    for (let i = 0; i < 12; i++) {
        const end = endOfWeek(current, { weekStartsOn: 0 });
        options.push({
            value: format(end, "yyyy-MM-dd"),
            label: `Week: ${ethiopianDateFormatter(current, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(end, { day: 'numeric', month: 'short', year: 'numeric' })} AM`
        });
        current = subDays(current, 7);
    }
    return options;
  }, []);

  useEffect(() => {
    if (syncType === 'Weekly' && weekOptions.length > 0) setSelectedSyncPeriod(weekOptions[0].value);
    if (syncType === 'Monthly' && monthOptions.length > 0) setSelectedSyncPeriod(monthOptions[0].value);
  }, [syncType, weekOptions, monthOptions]);

  useEffect(() => {
    const checkPaidStatus = async () => {
        if (!firestore || !user) return;
        const weekQuery = query(collection(firestore, 'employeeExpenses'), where('periodValue', '==', selectedDashboardWeek), where('paymentStatus', '==', 'Paid'));
        const weekSnap = await getDocs(weekQuery);
        setAlreadyPaidWeek(!weekSnap.empty);
        const monthQuery = query(collection(firestore, 'employeeExpenses'), where('periodValue', '==', selectedDashboardMonth), where('paymentStatus', '==', 'Paid'));
        const monthSnap = await getDocs(monthQuery);
        setAlreadyPaidMonth(!monthSnap.empty);
    };
    checkPaidStatus();
  }, [firestore, user, selectedDashboardWeek, selectedDashboardMonth]);

  useEffect(() => {
    const fetchRelevantAttendance = async () => {
        if (!firestore || !user || !allEmployees || allEmployees.length === 0) {
            setRealTimeLoading(false);
            return;
        }
        setRealTimeLoading(true);
        try {
            const weekEnd = startOfDay(new Date(selectedDashboardWeek));
            const weekStart = subDays(weekEnd, 6);
            const monthEnd = startOfDay(new Date(selectedDashboardMonth));
            const ethM = toEthiopian(monthEnd);
            const monthStart = toGregorian(ethM.year, ethM.month, 1);
            const rangeStart = weekStart < monthStart ? weekStart : monthStart;
            const end = endOfDay(new Date());
            const fetchPromises = allEmployees.map(emp => 
                getDocs(query(collection(firestore, 'employees', emp.id, 'attendance'), where('date', '>=', rangeStart.toISOString()), where('date', '<=', end.toISOString())))
            );
            const snaps = await Promise.all(fetchPromises);
            const records: AttendanceRecord[] = [];
            snaps.forEach((snap, idx) => {
                snap.forEach(d => records.push({ ...d.data(), employeeId: allEmployees[idx].id, id: d.id } as AttendanceRecord));
            });
            setAllAttendance(records);
        } catch (e) { console.error("Fetch error:", e); } finally { setRealTimeLoading(false); }
    };
    fetchRelevantAttendance();
  }, [allEmployees, firestore, user, selectedDashboardWeek, selectedDashboardMonth]);

  useEffect(() => {
    const fetchAuditData = async () => {
        if (!firestore || !user || !selectedUnifiedMonth) return;
        setAuditLoading(true);
        try {
            const expensesRef = collection(firestore, 'employeeExpenses');
            const q = query(expensesRef, where('periodValue', '==', selectedUnifiedMonth), where('paymentStatus', '==', 'Paid'));
            const snap = await getDocs(q);
            let total = 0;
            snap.forEach(d => { total += d.data().amount || 0; });
            setAuditTotal(total);
        } catch (e) {} finally { setAuditLoading(false); }
    };
    fetchAuditData();
  }, [selectedUnifiedMonth, firestore, user]);

  const liveTotals = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0 || realTimeLoading) return { today: 0, week: 0, month: 0, onSite: 0, staffData: [] };
    const nowLocal = new Date();
    const todayStr = format(nowLocal, "yyyy-MM-dd");
    const dashboardWeekEnd = startOfDay(new Date(selectedDashboardWeek));
    const dashboardWeekStart = subDays(dashboardWeekEnd, 6);
    const dashboardMonthEnd = startOfDay(new Date(selectedDashboardMonth));
    const ethDashMonth = toEthiopian(dashboardMonthEnd);
    const dashboardMonthStart = toGregorian(ethDashMonth.year, ethDashMonth.month, 1);
    const dashMonthUnits = getMonthlyWorkingUnits(dashboardMonthStart, getEthiopianMonthDays(ethDashMonth.year, ethDashMonth.month));

    let todayCostGlobal = 0, onSiteCount = 0;
    const staffData: any[] = [];

    allEmployees.forEach(emp => {
        const empRecords = allAttendance.filter(r => r.employeeId === emp.id);
        const todayRec = empRecords.find(r => r.id === todayStr);
        const isPresentToday = !!(todayRec && (todayRec.morningStatus !== 'Absent' || todayRec.afternoonStatus !== 'Absent'));
        if (isPresentToday) onSiteCount++;

        const empStartDate = startOfDay(new Date(emp.attendanceStartDate || 0));
        const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;

        const calcDetailedCost = (r: AttendanceRecord, date: Date, unitsForPeriod: number) => {
            const isSun = getDay(date) === 0;
            const isSat = getDay(date) === 6;
            const isInactiveDay = empInactiveDate && date >= empInactiveDate;
            const isBeforeStart = date < empStartDate;
            if (isInactiveDay || isBeforeStart) return { cost: 0, late: 0, absent: (isSun ? 0 : (isSat ? 4.5 : 8)), otHours: 0, otPay: 0, baseHours: 0 };

            if (emp.paymentMethod === 'Weekly') {
                const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                const hrs = calculateHoursWorked(r);
                const otH = r.overtimeHours || 0;
                let cost = (hrs * (hourly || 0)) + (otH * (hourly || 0) * normalOTRate);
                if (isSun && r.morningStatus !== 'Absent') cost += 8 * (hourly || 0) * (sundayOTRate - 1);
                const expected = isSun ? 0 : (isSat ? 4.5 : 8);
                const absent = Math.max(0, expected - hrs);
                return { cost, late: calculateMinutesLate(r), absent, otHours: otH, otPay: otH * (hourly || 0) * normalOTRate, baseHours: hrs };
            } else {
                const hourly = (emp.monthlyRate || 0) / unitsForPeriod / 8;
                const daily = (emp.monthlyRate || 0) / unitsForPeriod;
                let dedHours = 0;
                if (r.morningStatus === 'Absent') dedHours += 4.5;
                if (r.afternoonStatus === 'Absent' && !isSat) dedHours += 3.5;
                const lateMins = calculateMinutesLate(r);
                let otH = r.overtimeHours || 0;
                let otP = otH * hourly * normalOTRate;
                if (isSun && (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')) otP += 8 * hourly * sundayOTRate;
                else if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) otP += 3.5 * hourly * normalOTRate;
                return { cost: daily - (dedHours * hourly) - (lateMins * (hourly / 60)) + otP, late: lateMins, absent: dedHours, otHours: otH, otPay: otP, baseHours: isSun ? 0 : (isSat ? 4.5 : 8) - dedHours };
            }
        };

        const empStats = { 
            id: emp.id, name: emp.name, paymentMethod: emp.paymentMethod, 
            today: { cost: 0, isPresent: isPresentToday, morningStatus: todayRec?.morningStatus || "Absent", afternoonStatus: todayRec?.afternoonStatus || "Absent", otHours: todayRec?.overtimeHours || 0, otPay: 0 }, 
            week: { cost: 0, late: 0, absent: 0, otHours: 0, otPay: 0, totalHours: 0 }, 
            month: { cost: 0, late: 0, absent: 0, otHours: 0, otPay: 0, totalHours: 0 } 
        };

        empRecords.forEach(r => {
            const d = parse(r.id!, "yyyy-MM-dd", new Date());
            if (isSameDay(d, nowLocal)) {
                const ethNow = toEthiopian(nowLocal);
                const currentMonthUnits = getMonthlyWorkingUnits(startOfMonth(nowLocal), getEthiopianMonthDays(ethNow.year, ethNow.month));
                const todayDetails = calcDetailedCost(r, d, currentMonthUnits);
                empStats.today.cost = todayDetails.cost;
                empStats.today.otPay = todayDetails.otPay;
                todayCostGlobal += todayDetails.cost;
            }
            if (isWithinInterval(d, { start: dashboardWeekStart, end: endOfDay(dashboardWeekEnd) })) {
                const ethRecMonth = toEthiopian(d);
                const recMonthUnits = getMonthlyWorkingUnits(toGregorian(ethRecMonth.year, ethRecMonth.month, 1), getEthiopianMonthDays(ethRecMonth.year, ethRecMonth.month));
                const weekDetails = calcDetailedCost(r, d, recMonthUnits);
                empStats.week.cost += weekDetails.cost;
                empStats.week.late += weekDetails.late;
                empStats.week.absent += weekDetails.absent;
                empStats.week.otHours += weekDetails.otHours;
                empStats.week.otPay += weekDetails.otPay;
                empStats.week.totalHours += weekDetails.baseHours;
            }
            if (isWithinInterval(d, { start: dashboardMonthStart, end: endOfDay(dashboardMonthEnd) })) {
                const monthDetails = calcDetailedCost(r, d, dashMonthUnits);
                empStats.month.cost += monthDetails.cost;
                empStats.month.late += monthDetails.late;
                empStats.month.absent += monthDetails.absent;
                empStats.month.otHours += monthDetails.otHours;
                empStats.month.otPay += monthDetails.otPay;
                empStats.month.totalHours += monthDetails.baseHours;
            }
        });
        staffData.push(empStats);
    });

    return { 
        today: todayCostGlobal, 
        week: staffData.filter(s => s.paymentMethod === 'Weekly').reduce((acc, s) => acc + s.week.cost, 0), 
        month: staffData.filter(s => s.paymentMethod === 'Monthly').reduce((acc, s) => acc + s.month.cost, 0), 
        onSite: onSiteCount, 
        staffData 
    };
  }, [allEmployees, allAttendance, realTimeLoading, normalOTRate, sundayOTRate, selectedDashboardWeek, selectedDashboardMonth]);

  const isWeeklyPayWindow = useMemo(() => {
    const weekEnd = new Date(selectedDashboardWeek);
    const payEnd = addDays(weekEnd, 3);
    return isWithinInterval(now, { start: startOfDay(weekEnd), end: endOfDay(payEnd) });
  }, [now, selectedDashboardWeek]);

  const isMonthlyPayWindow = useMemo(() => {
    const monthEnd = new Date(selectedDashboardMonth);
    const payEnd = addDays(monthEnd, 3);
    return isWithinInterval(now, { start: startOfDay(monthEnd), end: endOfDay(payEnd) });
  }, [now, selectedDashboardMonth]);

  const handleMarkAsPaid = async (type: 'Weekly' | 'Monthly', targetPeriodValue?: string) => {
      if (!firestore || !user || !allEmployees || isProcessingPay) return;
      setIsProcessingPay(true);
      const batch = writeBatch(firestore);
      const recordedAt = new Date().toISOString();
      let periodLabel = "", periodValue = targetPeriodValue || (type === 'Weekly' ? selectedDashboardWeek : selectedDashboardMonth);

      if (type === 'Weekly') {
          periodLabel = weekOptions.find(o => o.value === periodValue)?.label || periodValue;
      } else {
          periodLabel = monthOptions.find(o => o.value === periodValue)?.label || periodValue;
      }

      let reportMsg = `💰 *PAYROLL FINALIZED: ${type.toUpperCase()}*\n📅 Period: ${periodLabel}\n\n`;
      let totalAmount = 0;

      // Calculation logic for the targeted period
      const endG = startOfDay(new Date(periodValue));
      const startG = type === 'Weekly' ? subDays(endG, 6) : toGregorian(toEthiopian(endG).year, toEthiopian(endG).month, 1);
      const interval = { start: startOfDay(startG), end: endOfDay(endG) };
      const periodMonthEth = toEthiopian(endG);
      const periodMonthUnits = getMonthlyWorkingUnits(toGregorian(periodMonthEth.year, periodMonthEth.month, 1), getEthiopianMonthDays(periodMonthEth.year, periodMonthEth.month));

      for (const emp of allEmployees) {
          if (type === 'Weekly' && emp.paymentMethod !== 'Weekly') continue;
          if (type === 'Monthly' && emp.paymentMethod !== 'Monthly') continue;
          
          const empRecsSnap = await getDocs(query(collection(firestore, 'employees', emp.id, 'attendance'), where('date', '>=', interval.start.toISOString()), where('date', '<=', interval.end.toISOString())));
          const recs: AttendanceRecord[] = [];
          empRecsSnap.forEach(d => recs.push(d.data() as AttendanceRecord));

          let empCost = 0, empOTPay = 0, empOTHours = 0, empBaseHours = 0;
          const empStartDate = startOfDay(new Date(emp.attendanceStartDate || 0));
          const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;

          eachDayOfInterval(interval).forEach(day => {
              const r = recs.find(record => isSameDay(getDateFromRecord(record.date), day));
              const isSun = getDay(day) === 0, isSat = getDay(day) === 6;
              const isInactive = empInactiveDate && day >= empInactiveDate;
              const isBefore = day < empStartDate;

              if (isInactive || isBefore) return;

              if (emp.paymentMethod === 'Weekly') {
                  const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                  const hrs = r ? calculateHoursWorked(r) : (isSun ? 0 : 0);
                  const otH = r?.overtimeHours || 0;
                  empBaseHours += hrs; empOTHours += otH;
                  let daily = (hrs * (hourly || 0)) + (otH * (hourly || 0) * normalOTRate);
                  if (isSun && r && r.morningStatus !== 'Absent') daily += 8 * (hourly || 0) * (sundayOTRate - 1);
                  empCost += daily; empOTPay += (otH * (hourly || 0) * normalOTRate);
              } else {
                  const daily = (emp.monthlyRate || 0) / periodMonthUnits;
                  const hourly = daily / 8;
                  let dedH = 0;
                  if (r) {
                      if (r.morningStatus === 'Absent') dedH += 4.5;
                      if (r.afternoonStatus === 'Absent' && !isSat) dedH += 3.5;
                      const lateM = calculateMinutesLate(r);
                      const otH = r.overtimeHours || 0;
                      let otP = otH * hourly * normalOTRate;
                      if (isSun && (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')) otP += 8 * hourly * sundayOTRate;
                      else if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) otP += 3.5 * hourly * normalOTRate;
                      empCost += (daily - (dedH * hourly) - (lateM * (hourly / 60)) + otP);
                      empOTHours += otH; empOTPay += otP;
                  } else if (!isSun) {
                      empCost += 0; // Missing log counts as absence in monthly
                  }
              }
          });

          const periodSlug = periodLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const payoutId = `payout_${type.toUpperCase()}_${emp.id}_${periodSlug}`;
          batch.set(doc(firestore, 'employeeExpenses', payoutId), {
              id: payoutId, employeeId: emp.id, employeeName: emp.name, amount: empCost, type,
              period: periodLabel, periodLabel: periodLabel, periodValue, recordedAt,
              paymentStatus: 'Paid', category: 'Payroll',
              details: { baseAmount: empCost - empOTPay, overtimeAmount: empOTPay, overtimeHours: empOTHours, totalHours: empBaseHours }
          }, { merge: true });
          totalAmount += empCost;
          reportMsg += `• *${emp.name}*: ETB ${empCost.toLocaleString()}\n`;
      }

      reportMsg += `\n--------------------\n*TOTAL: ETB ${totalAmount.toLocaleString()}*`;
      try {
          await batch.commit();
          await sendAdminPayrollSummary(reportMsg);
          if (!targetPeriodValue) {
             if (type === 'Weekly') setAlreadyPaidWeek(true); else setAlreadyPaidMonth(true);
          }
          toast({ title: "Ledger Updated", description: `Period finalized and archived.` });
      } catch (e) { toast({ variant: 'destructive', title: "Sync Failed" }); } finally { setIsProcessingPay(false); }
  };

  const handleMaintenanceSync = async () => {
      if (!selectedSyncPeriod) return;
      handleMarkAsPaid(syncType, selectedSyncPeriod);
  };

  const weeklyChartData = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0 || realTimeLoading) return [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const date = subDays(now, i);
        const dayStr = format(date, "yyyy-MM-dd");
        const ethDay = ethiopianDateFormatter(date, { weekday: 'short' }).toUpperCase();
        let dailyTotal = 0;
        allEmployees.forEach(emp => {
            const rec = allAttendance.find(r => r.employeeId === emp.id && r.id === dayStr);
            if (rec) {
                if (emp.paymentMethod === 'Weekly') dailyTotal += (calculateHoursWorked(rec) * (emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0))) + ((rec.overtimeHours || 0) * (emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0)) * normalOTRate);
                else dailyTotal += (emp.monthlyRate || 0) / 23.625;
            }
        });
        data.push({ name: ethDay, total: dailyTotal });
    }
    return data;
  }, [allEmployees, allAttendance, realTimeLoading, normalOTRate, now]);

  const todayTrendPercent = useMemo(() => {
    if (weeklyChartData.length < 2) return 0;
    const todayVal = weeklyChartData[6].total;
    const avg = weeklyChartData.slice(0, 6).reduce((a, c) => a + c.total, 0) / 6;
    return avg === 0 ? (todayVal > 0 ? 100 : 0) : ((todayVal - avg) / avg) * 100;
  }, [weeklyChartData]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <Card className="shadow-lg border-none bg-[#E8ECF6] rounded-[2.5rem] overflow-hidden mb-2 relative">
          <div className="absolute inset-0 opacity-[0.035] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#10192E 1px, transparent 1px), linear-gradient(90deg, #10192E 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          <CardContent className="p-8 sm:p-10 flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
              <div className="flex items-center gap-6 w-full md:w-auto shrink-0">
                  <div className="bg-white p-5 rounded-[1.5rem] text-[#3478F6] shadow-md border border-[#E7EBF3]"><CalendarDays className="h-9 w-9" /></div>
                  <div>
                      <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.14em] mb-2">Current Ethiopian Date</p>
                      <h2 className="text-[#10192E] tracking-tight leading-tight flex items-baseline gap-2">
                          <span className="text-xs sm:text-sm font-bold uppercase text-[#3478F6]">{ethiopianDateFormatter(now, { weekday: 'short' }).toUpperCase()}</span>
                          <span className="text-xl sm:text-3xl font-bold font-headline">{ethiopianDateFormatter(now, { month: 'long', day: 'numeric' })}</span>
                      </h2>
                  </div>
              </div>
              <div className="hidden md:block h-32 w-px bg-gradient-to-b from-[#EDF1F8] to-transparent mx-4" />
              <div className="flex-1 w-full flex flex-col gap-4">
                  <div className="flex justify-between items-end">
                      <div>
                          <div className="flex items-center gap-2 mb-2"><div className="w-1.5 h-1.5 rounded-full bg-[#3478F6] animate-pulse" /><p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.14em]">Today's Total Cost</p></div>
                          <div className="flex items-baseline gap-1"><span className="text-[16px] font-semibold text-[#9AA3B8]">ETB</span><h2 className="text-[32px] font-bold text-[#10192E] tracking-tight font-headline">{liveTotals.today.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2></div>
                      </div>
                      <div className={cn("px-3 py-1.5 rounded-xl text-[12px] font-bold flex items-center gap-1.5 mb-1 shadow-sm", todayTrendPercent >= 0 ? "bg-[rgba(52,194,100,0.13)] text-[#34C264]" : "bg-[rgba(255,59,48,0.1)] text-[#FF3B30]")}>{todayTrendPercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} {Math.abs(todayTrendPercent).toFixed(1)}%</div>
                  </div>
                  <div className="w-full h-[64px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={weeklyChartData}>
                          <defs><linearGradient id="colorTrend" x1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3478F6" stopOpacity={0.3}/><stop offset="100%" stopColor="#3478F6" stopOpacity={0}/></linearGradient></defs>
                          <RechartsTooltip content={({ active, payload }) => (active && payload?.length ? <div className="bg-white/90 backdrop-blur-md px-3 py-2 border border-[#E7EBF3] rounded-xl shadow-lg text-[10px] font-bold text-[#3478F6] font-code">ETB {payload[0].value.toLocaleString()}</div> : null)} />
                          <Area type="monotone" dataKey="total" stroke="#3478F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTrend)" />
                        </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-2">
        <Card className="col-span-2 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300"><CardContent className="p-6 flex items-center justify-between"><div className="flex items-center gap-4"><div className="bg-[rgba(52,194,100,0.13)] p-4 rounded-2xl text-[#34C264] shadow-sm"><UserCheck className="h-6 w-6" /></div><div><p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">On-site Staff</p><p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">{liveTotals.onSite} <span className="text-[#9AA3B8] font-medium">/ {activeEmployees.length}</span></p></div></div>{liveTotals.onSite === activeEmployees.length && activeEmployees.length > 0 && <Badge className="bg-[rgba(52,194,100,0.13)] text-[#34C264] border-none shadow-none font-bold text-[10px] uppercase tracking-[0.06em] px-2 py-1 h-auto rounded-lg">FULL</Badge>}</CardContent></Card>
        <Card className="col-span-1 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 aspect-square"><CardContent className="p-4 flex flex-col items-center text-center justify-center h-full gap-3"><div className="bg-[rgba(52,120,246,0.11)] p-3 sm:p-4 rounded-2xl text-[#3478F6] shadow-sm"><HandCoins className="h-5 w-5 sm:h-6 sm:w-6" /></div><div><p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">Today's Est.</p><p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">{liveTotals.today.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div></CardContent></Card>
        <Card className="col-span-1 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 aspect-square"><CardContent className="p-4 flex flex-col items-center text-center justify-center h-full gap-3"><div className="bg-[rgba(139,92,246,0.12)] p-3 sm:p-4 rounded-2xl text-[#8B5CF6] shadow-sm"><BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" /></div><div><p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">Monthly Total</p><p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">{liveTotals.month.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-14 bg-muted/30 p-1 rounded-2xl mb-8">
            <TabsTrigger value="today" className="rounded-xl font-bold text-base data-[state=active]:bg-white data-[state=active]:shadow-md">Today</TabsTrigger>
            <TabsTrigger value="week" className="rounded-xl font-bold text-base data-[state=active]:bg-white data-[state=active]:shadow-md">Weekly</TabsTrigger>
            <TabsTrigger value="month" className="rounded-xl font-bold text-base data-[state=active]:bg-white data-[state=active]:shadow-md">Monthly</TabsTrigger>
        </TabsList>
        
        <TabsContent value="today" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveTotals.staffData.map((staff: any) => (
                    <StaffDetailedCard key={staff.id} staff={staff} view="today" />
                ))}
            </div>
        </TabsContent>

        <TabsContent value="week" className="space-y-8">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-6 rounded-[2rem] shadow-sm border border-[#3478F6]/5 gap-6">
                    <div className="flex items-center gap-4">
                         <div className="h-10 w-10 rounded-full bg-[#3478F6]/10 flex items-center justify-center text-[#3478F6]">
                            <CalendarIcon className="h-5 w-5" />
                         </div>
                         <Select value={selectedDashboardWeek} onValueChange={setSelectedDashboardWeek}>
                            <SelectTrigger className="w-[280px] h-12 bg-[#F8FAFF] border-none font-bold rounded-xl text-sm">
                                <SelectValue placeholder="Select week" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                {weekOptions.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-medium">{opt.label}</SelectItem>)}
                            </SelectContent>
                         </Select>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-[#9AA3B8] uppercase tracking-[0.2em] mb-1">Total Weekly Cost</p>
                        <p className="text-2xl font-black text-[#10192E] tabular-nums font-headline">ETB {liveTotals.week.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveTotals.staffData.filter(s => s.paymentMethod === 'Weekly').map((staff: any) => (
                        <StaffDetailedCard key={staff.id} staff={staff} view="week" />
                    ))}
                </div>
                
                {isWeeklyPayWindow && !alreadyPaidWeek && (
                    <div className="flex justify-center pt-8">
                        <Button disabled={isProcessingPay} onClick={() => handleMarkAsPaid('Weekly')} className="h-14 px-10 rounded-2xl bg-[#3478F6] hover:bg-[#2860CC] text-white font-bold text-lg shadow-xl shadow-[#3478F6]/20 transition-all active:scale-95">
                            {isProcessingPay ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />} Mark as Paid & Notify Admin
                        </Button>
                    </div>
                )}
                {alreadyPaidWeek && (
                    <div className="flex justify-center pt-8">
                        <Badge className="bg-green-100 text-green-700 h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[11px] border-green-200">
                             Finalized & Settled in Ledger
                        </Badge>
                    </div>
                )}
            </div>
        </TabsContent>

        <TabsContent value="month" className="space-y-8">
             <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-6 rounded-[2rem] shadow-sm border border-[#8B5CF6]/5 gap-6">
                    <div className="flex items-center gap-4">
                         <div className="h-10 w-10 rounded-full bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6]">
                            <Wallet2 className="h-5 w-5" />
                         </div>
                         <Select value={selectedDashboardMonth} onValueChange={setSelectedDashboardMonth}>
                            <SelectTrigger className="w-[280px] h-12 bg-[#F8FAFF] border-none font-bold rounded-xl text-sm">
                                <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-medium">{opt.label}</SelectItem>)}
                            </SelectContent>
                         </Select>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-[#9AA3B8] uppercase tracking-[0.2em] mb-1">Total Monthly Cost</p>
                        <p className="text-2xl font-black text-[#10192E] tabular-nums font-headline">ETB {liveTotals.month.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveTotals.staffData.filter(s => s.paymentMethod === 'Monthly').map((staff: any) => (
                        <StaffDetailedCard key={staff.id} staff={staff} view="month" />
                    ))}
                </div>

                {isMonthlyPayWindow && !alreadyPaidMonth && (
                    <div className="flex justify-center pt-8">
                        <Button disabled={isProcessingPay} onClick={() => handleMarkAsPaid('Monthly')} className="h-14 px-10 rounded-2xl bg-[#3478F6] hover:bg-[#2860CC] text-white font-bold text-lg shadow-xl shadow-[#3478F6]/20 transition-all active:scale-95">
                            {isProcessingPay ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />} Mark as Paid & Notify Admin
                        </Button>
                    </div>
                )}
                {alreadyPaidMonth && (
                    <div className="flex justify-center pt-8">
                        <Badge className="bg-green-100 text-green-700 h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[11px] border-green-200">
                             Finalized & Settled in Ledger
                        </Badge>
                    </div>
                )}
             </div>
        </TabsContent>
      </Tabs>

      <Card className="shadow-lg border-none rounded-3xl overflow-hidden ring-1 ring-[#10192E]/5 mt-10">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-8 border-b border-[#E7EBF3]">
              <div className="flex items-center gap-4"><div className="bg-[#3478F6] p-3.5 rounded-2xl text-white shadow-md"><Wallet className="h-7 w-7" /></div><div><CardTitle className="text-2xl font-bold text-[#10192E] tracking-tight font-headline">Historical Workshop Audit</CardTitle><CardDescription className="text-xs font-semibold text-[#9AA3B8] uppercase tracking-widest mt-1">Consolidated monthly expense summary</CardDescription></div></div>
              <div className="w-full sm:w-[280px]">
                  <Select value={selectedUnifiedMonth} onValueChange={setSelectedUnifiedMonth}>
                      <SelectTrigger className="h-12 bg-white rounded-2xl border-[#E7EBF3] font-bold px-6 shadow-sm"><SelectValue placeholder="Select month" /></SelectTrigger>
                      <SelectContent className="rounded-2xl">
                          {monthOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="font-medium py-3">{opt.label}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
              </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-16">
              {auditLoading ? <div className="flex flex-col items-center gap-4"><Clock className="animate-spin h-10 w-10 text-[#3478F6] opacity-40" /><p className="text-[10px] font-bold text-[#9AA3B8] uppercase tracking-[0.3em]">Calculating Audit...</p></div> : <>
                  <div className="text-center group"><p className="text-[11px] font-bold text-[#9AA3B8] uppercase tracking-[0.4em] mb-4">Expenditure Total</p><p className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[#10192E] tracking-tighter font-headline">ETB {auditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div>
                  <div className="flex items-center justify-center gap-6 mt-12 opacity-30"><div className="h-[1px] w-20 bg-gradient-to-r from-transparent to-[#3478F6] rounded-full" /><Sparkles className="h-6 w-6 text-[#3478F6] animate-pulse" /><div className="h-[1px] w-20 bg-gradient-to-l from-transparent to-[#3478F6] rounded-full" /></div>
              </>}
          </CardContent>
      </Card>

      {/* Targeted Period Sync Utility */}
      <Card className="shadow-lg border-none rounded-3xl overflow-hidden bg-muted/20 border border-dashed border-primary/20">
          <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-4 text-[#9AA3B8]">
                  <Database className="h-5 w-5" />
                  <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-[#10192E]">Ledger Maintenance</h3>
                      <p className="text-[10px] font-bold">Synchronize a specific period to the workshop history.</p>
                  </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                    <Select value={syncType} onValueChange={(v) => setSyncType(v as any)}>
                        <SelectTrigger className="h-11 bg-white rounded-xl font-bold border-none shadow-sm">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="Weekly" className="font-bold">Weekly</SelectItem>
                            <SelectItem value="Monthly" className="font-bold">Monthly</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={selectedSyncPeriod} onValueChange={setSelectedSyncPeriod}>
                        <SelectTrigger className="h-11 bg-white rounded-xl font-bold border-none shadow-sm min-w-[180px]">
                            <SelectValue placeholder="Select Period" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            {(syncType === 'Weekly' ? weekOptions : monthOptions).map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className="font-medium">{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleMaintenanceSync} 
                    disabled={isProcessingPay || employeesLoading} 
                    className="w-full sm:w-auto h-11 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-[#3478F6] hover:bg-[#3478F6]/10 border border-[#3478F6]/20 transition-colors gap-2 rounded-xl"
                  >
                    {isProcessingPay ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />} 
                    Force Sync {syncType} Period
                  </Button>
              </div>
          </CardContent>
      </Card>
    </div>
  );
}

function StaffDetailedCard({ staff, view }: { staff: any, view: 'today' | 'week' | 'month' }) {
    const data = staff[view];
    const label = view === 'today' ? "Today's Cost" : (view === 'week' ? "Week To-Date" : "Month To-Date");
    const showAbsent = !(staff.paymentMethod === 'Weekly' && (view === 'week' || view === 'month'));

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Present': return 'bg-green-50 text-green-700 border-green-200';
            case 'Late': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'Absent': return 'bg-red-50 text-red-700 border-red-200';
            case 'Permission': return 'bg-blue-50 text-blue-700 border-blue-200';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    return (
        <Card className="rounded-[1.5rem] border-none shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden bg-white ring-1 ring-black/[0.03]">
            <CardContent className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-[#10192E] text-base truncate pr-2">{staff.name}</h3>
                    <Badge variant="secondary" className="bg-[#F8FAFF] text-[#3478F6] text-[8px] font-black uppercase tracking-tighter h-5 px-1.5">{staff.paymentMethod}</Badge>
                </div>
                <div className="space-y-2.5">
                    {view === 'today' ? (
                        <div className="bg-[#F8FAFF] rounded-xl p-3 flex justify-around items-center text-[10px] font-bold">
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[7px] text-muted-foreground uppercase tracking-widest opacity-60">Morning</span>
                                <Badge variant="outline" className={cn("px-2 py-0 h-5 text-[9px] font-black border-none", getStatusColor(data.morningStatus))}>
                                    {data.morningStatus}
                                </Badge>
                            </div>
                            <div className="h-6 w-px bg-muted/50" />
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[7px] text-muted-foreground uppercase tracking-widest opacity-60">Afternoon</span>
                                <Badge variant="outline" className={cn("px-2 py-0 h-5 text-[9px] font-black border-none", getStatusColor(data.afternoonStatus))}>
                                    {data.afternoonStatus}
                                </Badge>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[#F8FAFF] rounded-xl p-3 flex justify-between items-center text-[10px] font-bold">
                            <div className="flex items-center gap-1.5 text-amber-600"><Timer className="h-3 w-3" /><span>{data.late > 0 ? `Late: ${data.late}m` : "No late mins"}</span></div>
                            {showAbsent && (
                                <div className="flex items-center gap-1.5 text-red-500"><UserX className="h-3 w-3" /><span>{data.absent > 0 ? `Absent: ${data.absent.toFixed(1)}h` : "Perfect Log"}</span></div>
                            )}
                        </div>
                    )}
                    
                    {data.otHours > 0 && (
                        <div className="bg-[#3478F6]/5 rounded-xl p-3 flex justify-between items-center text-[10px] font-bold">
                             <div className="flex items-center gap-1.5 text-[#3478F6]"><TrendingUp className="h-3 w-3" /><span>Overtime:</span></div>
                            <span className="text-[#3478F6]">+{data.otHours || 0} hrs (ETB {data.otPay?.toFixed(2) || "0.00"})</span>
                        </div>
                    )}
                </div>
                <div className="pt-2 flex justify-between items-end border-t border-dashed border-muted">
                    <p className="text-[9px] font-black text-[#9AA3B8] uppercase tracking-widest">{label}</p>
                    <p className="text-lg font-black text-[#10192E] tracking-tight">ETB {data.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
            </CardContent>
        </Card>
    );
}
