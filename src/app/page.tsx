
"use client";

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { Users, UserCheck, Wallet, CalendarDays, Clock, TrendingUp, TrendingDown, HandCoins, Calendar as CalendarIcon, Wallet2, BarChart3, Sparkles, CheckCircle2, Loader2, History } from "lucide-react";
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
  
  const [selectedUnifiedMonth, setSelectedUnifiedMonth] = useState<string>(format(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1), "yyyy-MM-dd"));
  
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [now, setNow] = useState(new Date());

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

  useEffect(() => {
    const fetchCurrentMonthData = async () => {
        if (!firestore || !user || !allEmployees || allEmployees.length === 0) return;
        setRealTimeLoading(true);
        try {
            const nowLocal = new Date();
            const ethNow = toEthiopian(nowLocal);
            const start = startOfDay(toGregorian(ethNow.year, ethNow.month, 1));
            const end = endOfDay(nowLocal);
            
            const fetchPromises = allEmployees.map(emp => 
                getDocs(query(collection(firestore, 'employees', emp.id, 'attendance'), where('date', '>=', start.toISOString()), where('date', '<=', end.toISOString())))
            );
            const snaps = await Promise.all(fetchPromises);
            const records: AttendanceRecord[] = [];
            snaps.forEach((snap, idx) => {
                snap.forEach(d => records.push({ ...d.data(), employeeId: allEmployees[idx].id, id: d.id } as AttendanceRecord));
            });
            setAllAttendance(records);
        } catch (e) {} finally { setRealTimeLoading(false); }
    };
    fetchCurrentMonthData();
  }, [allEmployees, firestore, user]);

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
    if (!allEmployees || allEmployees.length === 0 || realTimeLoading) return { today: 0, week: 0, month: 0, onSite: 0 };
    const nowLocal = new Date();
    const todayStr = format(nowLocal, "yyyy-MM-dd");
    const weekStart = startOfDay(startOfWeek(nowLocal, { weekStartsOn: 0 }));
    const monthStart = startOfDay(toGregorian(toEthiopian(nowLocal).year, toEthiopian(nowLocal).month, 1));
    const ethNow = toEthiopian(nowLocal);
    const units = getMonthlyWorkingUnits(monthStart, getEthiopianMonthDays(ethNow.year, ethNow.month));

    let todayCost = 0, weekCost = 0, monthCost = 0, onSite = 0;

    allEmployees.forEach(emp => {
        const empRecords = allAttendance.filter(r => r.employeeId === emp.id);
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

            if (emp.paymentMethod === 'Weekly') {
                const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                let cost = (calculateHoursWorked(r) * (hourly || 0)) + ((r.overtimeHours || 0) * (hourly || 0) * normalOTRate);
                if (isSun && r.morningStatus !== 'Absent') cost += 8 * (hourly || 0) * (sundayOTRate - 1);
                return cost;
            } else {
                const hourly = (emp.monthlyRate || 0) / units / 8;
                const daily = (emp.monthlyRate || 0) / units;
                let ded = 0;
                if (r.morningStatus === 'Absent') ded += 4.5 * hourly;
                if (r.afternoonStatus === 'Absent' && !isSat) ded += 3.5 * hourly;
                ded += calculateMinutesLate(r) * (hourly / 60);
                let ot = (r.overtimeHours || 0) * hourly * normalOTRate;
                if (isSun && (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')) ot += 8 * hourly * sundayOTRate;
                else if (isSat && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) ot += 3.5 * hourly * normalOTRate;
                return daily - ded + ot;
            }
        };

        empRecords.forEach(r => {
            const d = parse(r.id!, "yyyy-MM-dd", new Date());
            const cost = calcRecCost(r, d);
            if (isSameDay(d, nowLocal)) todayCost += cost;
            if (d >= weekStart) weekCost += cost;
            if (d >= monthStart) monthCost += cost;
        });
    });

    return { today: todayCost, week: weekCost, month: monthCost, onSite };
  }, [allEmployees, allAttendance, realTimeLoading, normalOTRate, sundayOTRate]);

  // Pay Window Logic
  const ethToday = toEthiopian(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
  const dayOfWeek = getDay(now); // 0=Sun, 6=Sat
  const isWeeklyPayWindow = dayOfWeek === 6 || dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2;

  const daysInEthMonth = getEthiopianMonthDays(ethToday.year, ethToday.month);
  const isMonthlyPayWindow = ethToday.day === daysInEthMonth || ethToday.day <= 3;

  const handleMarkAsPaid = async (type: 'Weekly' | 'Monthly') => {
      if (!firestore || !user || !allEmployees || isProcessingPay) return;
      setIsProcessingPay(true);
      
      const batch = writeBatch(firestore);
      const recordedAt = new Date().toISOString();
      const nowLocal = new Date();
      
      let periodLabel = "";
      let periodValue = "";
      let totalAmount = 0;

      if (type === 'Weekly') {
          const wStart = startOfDay(startOfWeek(nowLocal, { weekStartsOn: 0 }));
          const wEnd = endOfWeek(wStart, { weekStartsOn: 0 });
          periodLabel = `Week: ${ethiopianDateFormatter(wStart, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(wEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;
          periodValue = format(wStart, "yyyy-MM-dd");
      } else {
          const mStart = toGregorian(ethToday.year, ethToday.month, 1);
          periodLabel = `${ethiopianDateFormatter(mStart, { month: 'long' })} ${ethToday.year}`;
          periodValue = format(mStart, "yyyy-MM-dd");
      }

      let reportMsg = `💰 *PAYROLL FINALIZED: ${type.toUpperCase()}*\n📅 Period: ${periodLabel}\n\n`;

      allEmployees.forEach(emp => {
          if (type === 'Weekly' && emp.paymentMethod !== 'Weekly') return;
          if (type === 'Monthly' && emp.paymentMethod !== 'Monthly') return;

          const empRecords = allAttendance.filter(r => r.employeeId === emp.id);
          const monthStart = startOfDay(toGregorian(ethToday.year, ethToday.month, 1));
          const units = getMonthlyWorkingUnits(monthStart, getEthiopianMonthDays(ethToday.year, ethToday.month));
          
          let empAmount = 0;
          if (emp.paymentMethod === 'Weekly') {
              const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
              const weekRecs = empRecords.filter(r => parse(r.id!, "yyyy-MM-dd", new Date()) >= startOfDay(startOfWeek(nowLocal, { weekStartsOn: 0 })));
              let bH = weekRecs.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
              let otH = weekRecs.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
              empAmount = (bH * (hourly || 0)) + (otH * (hourly || 0) * normalOTRate);
          } else {
              const hourly = (emp.monthlyRate || 0) / units / 8;
              const monthRecs = empRecords.filter(r => parse(r.id!, "yyyy-MM-dd", new Date()) >= monthStart);
              let ded = 0;
              monthRecs.forEach(r => {
                  const d = parse(r.id!, "yyyy-MM-dd", new Date());
                  if (getDay(d) !== 0) {
                    if (r.morningStatus === 'Absent') ded += 4.5 * hourly;
                    if (r.afternoonStatus === 'Absent' && getDay(d) !== 6) ded += 3.5 * hourly;
                    ded += calculateMinutesLate(r) * (hourly / 60);
                  }
              });
              let otA = monthRecs.reduce((acc, r) => {
                  const d = parse(r.id!, "yyyy-MM-dd", new Date());
                  let amt = (r.overtimeHours || 0) * hourly * normalOTRate;
                  if (getDay(d) === 0 && (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')) amt += 8 * hourly * sundayOTRate;
                  else if (getDay(d) === 6 && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) amt += 3.5 * hourly * normalOTRate;
                  return acc + amt;
              }, 0);
              empAmount = (emp.monthlyRate || 0) - ded + otA;
          }

          const payoutId = `payout_${type.toUpperCase()}_${emp.id}_${periodLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
          batch.set(doc(firestore, 'employeeExpenses', payoutId), {
              id: payoutId, employeeId: emp.id, employeeName: emp.name, amount: empAmount, type,
              period: periodLabel, periodValue, periodLabel, recordedAt, paymentStatus: 'Paid', category: 'Payroll'
          });
          totalAmount += empAmount;
          reportMsg += `• *${emp.name}*: ETB ${empAmount.toLocaleString()}\n`;
      });

      reportMsg += `\n--------------------\n*TOTAL: ETB ${totalAmount.toLocaleString()}*`;

      try {
          await batch.commit();
          await sendAdminPayrollSummary(reportMsg);
          toast({ title: "Payroll Settled", description: "Ledger updated and Admin notified." });
      } catch (e) {
          toast({ variant: 'destructive', title: "Finalization Failed" });
      } finally { setIsProcessingPay(false); }
  };

  const handleManualHistorySync = async () => {
    if (!firestore || !user || !allEmployees || allEmployees.length === 0 || isSyncingHistory) return;
    setIsSyncingHistory(true);
    toast({ title: "Synchronizing Workshop Ledger", description: "Processing historical payout records..." });

    try {
        const startOfHistory = toGregorian(2017, 1, 1);
        const today = new Date();
        const thisMonthStart = startOfDay(toGregorian(toEthiopian(today).year, toEthiopian(today).month, 1));
        const thisWeekStart = startOfDay(startOfWeek(today, { weekStartsOn: 0 }));
        const batch = writeBatch(firestore);

        const fetchPromises = allEmployees.map(emp => 
            getDocs(query(collection(firestore, 'employees', emp.id, 'attendance'), where('date', '>=', startOfHistory.toISOString())))
        );
        const snaps = await Promise.all(fetchPromises);
        const historyRecords: AttendanceRecord[] = [];
        snaps.forEach((snap, idx) => {
            snap.forEach(d => historyRecords.push({ ...d.data(), employeeId: allEmployees[idx].id, id: d.id } as AttendanceRecord));
        });

        const unpaidQuery = query(collection(firestore, 'employeeExpenses'), where('paymentStatus', '==', 'Unpaid'));
        const unpaidSnap = await getDocs(unpaidQuery);
        unpaidSnap.forEach(d => batch.delete(d.ref));

        let mStep = startOfHistory;
        while (mStep < thisMonthStart) {
            const eth = toEthiopian(mStep);
            const label = `${ethiopianDateFormatter(mStep, { month: 'long' })} ${eth.year}`;
            const val = format(mStep, "yyyy-MM-dd");
            const days = getEthiopianMonthDays(eth.year, eth.month);
            const units = getMonthlyWorkingUnits(mStep, days);
            const end = endOfDay(addDays(mStep, days - 1));

            allEmployees.filter(e => e.paymentMethod === 'Monthly').forEach(emp => {
                const recs = historyRecords.filter(r => r.employeeId === emp.id && isWithinInterval(parse(r.id!, "yyyy-MM-dd", new Date()), { start: mStep, end }));
                const hourly = (emp.monthlyRate || 0) / units / 8;
                const minuteRate = hourly / 60;
                let ded = 0, otA = 0;
                recs.forEach(r => {
                    const d = parse(r.id!, "yyyy-MM-dd", new Date());
                    if (getDay(d) === 0) {
                        if (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent') otA += 8 * hourly * sundayOTRate;
                    } else {
                        if (r.morningStatus === 'Absent') ded += 4.5 * hourly;
                        if (r.afternoonStatus === 'Absent' && getDay(d) !== 6) ded += 3.5 * hourly;
                        ded += calculateMinutesLate(r) * minuteRate;
                        if (getDay(d) === 6 && (r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late')) otA += 3.5 * hourly * normalOTRate;
                    }
                    if (r.overtimeHours) otA += r.overtimeHours * hourly * normalOTRate;
                });
                const net = (emp.monthlyRate || 0) - ded + otA;
                const pId = `payout_MONTHLY_${emp.id}_${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
                batch.set(doc(firestore, 'employeeExpenses', pId), { id: pId, employeeId: emp.id, employeeName: emp.name, amount: net, type: 'Monthly', period: label, periodValue: val, recordedAt: new Date().toISOString(), paymentStatus: 'Paid', category: 'Payroll' }, { merge: true });
            });
            mStep = toGregorian(eth.month === 12 ? eth.year + 1 : eth.year, eth.month === 12 ? 1 : eth.month + 1, 1);
        }

        let wStep = startOfWeek(startOfHistory, { weekStartsOn: 0 });
        while (wStep < thisWeekStart) {
            const wEnd = endOfWeek(wStep, { weekStartsOn: 0 });
            const label = `Week: ${ethiopianDateFormatter(wStep, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(wEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;
            const val = format(wStep, "yyyy-MM-dd");
            allEmployees.filter(e => e.paymentMethod === 'Weekly').forEach(emp => {
                const recs = historyRecords.filter(r => r.employeeId === emp.id && isWithinInterval(parse(r.id!, "yyyy-MM-dd", new Date()), { start: startOfDay(wStep), end: endOfDay(wEnd) }));
                const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                let bH = recs.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
                let otH = recs.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
                const total = (bH * (hourly || 0)) + (otH * (hourly || 0) * normalOTRate);
                const pId = `payout_WEEKLY_${emp.id}_${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
                batch.set(doc(firestore, 'employeeExpenses', pId), { id: pId, employeeId: emp.id, employeeName: emp.name, amount: total, type: 'Weekly', period: label, periodValue: val, recordedAt: new Date().toISOString(), paymentStatus: 'Paid', category: 'Payroll' }, { merge: true });
            });
            wStep = addDays(wStep, 7);
        }
        await batch.commit();
        toast({ title: "Ledger Complete", description: "Successfully archived finalized payroll records." });
    } catch (e) {
        toast({ variant: 'destructive', title: "Sync Failed" });
    } finally { setIsSyncingHistory(false); }
  };

  const weeklyChartData = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0 || realTimeLoading) return [];
    const nowLocal = new Date();
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const date = subDays(nowLocal, i);
        const dayStr = format(date, "yyyy-MM-dd");
        const ethDay = ethiopianDateFormatter(date, { weekday: 'short' }).toUpperCase();
        const units = getMonthlyWorkingUnits(startOfMonth(date), 30);
        let dailyTotal = 0;
        allEmployees.forEach(emp => {
            const rec = allAttendance.find(r => r.employeeId === emp.id && r.id === dayStr);
            const empStartDate = startOfDay(new Date(emp.attendanceStartDate || 0));
            const empInactiveDate = (emp.status === 'Inactive' && emp.inactiveDate) ? startOfDay(new Date(emp.inactiveDate)) : null;
            if ((empInactiveDate && date >= empInactiveDate) || date < empStartDate) return;
            if (rec) {
                if (emp.paymentMethod === 'Weekly') {
                    const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                    dailyTotal += (calculateHoursWorked(rec) * (hourly || 0)) + ((rec.overtimeHours || 0) * (hourly || 0) * normalOTRate);
                    if (getDay(date) === 0 && rec.morningStatus !== 'Absent') dailyTotal += 8 * (hourly || 0) * (sundayOTRate - 1);
                } else {
                    const hourly = (emp.monthlyRate || 0) / units / 8;
                    const daily = (emp.monthlyRate || 0) / units;
                    let ded = 0;
                    if (rec.morningStatus === 'Absent') ded += 4.5 * hourly;
                    if (rec.afternoonStatus === 'Absent' && getDay(date) !== 6) ded += 3.5 * hourly;
                    ded += calculateMinutesLate(rec) * (hourly / 60);
                    let ot = (rec.overtimeHours || 0) * hourly * normalOTRate;
                    if (getDay(date) === 0 && (rec.morningStatus !== 'Absent' || rec.afternoonStatus !== 'Absent')) ot += 8 * hourly * sundayOTRate;
                    else if (getDay(date) === 6 && (rec.afternoonStatus === 'Present' || rec.afternoonStatus === 'Late')) ot += 3.5 * hourly * normalOTRate;
                    dailyTotal += daily - ded + ot;
                }
            } else if (getDay(date) === 0 && emp.paymentMethod === 'Weekly') dailyTotal += (emp.dailyRate || 0);
        });
        data.push({ name: ethDay, total: dailyTotal });
    }
    return data;
  }, [allEmployees, allAttendance, realTimeLoading, normalOTRate, sundayOTRate]);

  const todayTrendPercent = useMemo(() => {
    if (weeklyChartData.length < 2 || realTimeLoading) return 0;
    const todayVal = weeklyChartData[6].total;
    const avg = weeklyChartData.slice(0, 6).reduce((a, c) => a + c.total, 0) / 6;
    if (avg === 0) return todayVal > 0 ? 100 : 0;
    return ((todayVal - avg) / avg) * 100;
  }, [weeklyChartData, realTimeLoading]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Top Hero Card */}
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
                          <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#3478F6] animate-pulse" />
                              <p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.14em]">Today's Total Cost</p>
                          </div>
                          <div className="flex items-baseline gap-1">
                              <span className="text-[16px] font-semibold text-[#9AA3B8]">ETB</span>
                              <h2 className="text-[32px] font-bold text-[#10192E] tracking-tight font-headline">{liveTotals.today.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                          </div>
                      </div>
                      <div className={cn("px-3 py-1.5 rounded-xl text-[12px] font-bold flex items-center gap-1.5 mb-1 shadow-sm", todayTrendPercent >= 0 ? "bg-[rgba(52,194,100,0.13)] text-[#34C264]" : "bg-[rgba(255,59,48,0.1)] text-[#FF3B30]")}>
                          {todayTrendPercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} {Math.abs(todayTrendPercent).toFixed(1)}%
                      </div>
                  </div>
                  <div className="w-full h-[64px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={weeklyChartData}>
                          <defs><linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3478F6" stopOpacity={0.3}/><stop offset="100%" stopColor="#3478F6" stopOpacity={0}/></linearGradient></defs>
                          <RechartsTooltip content={({ active, payload }) => (active && payload?.length ? <div className="bg-white/90 backdrop-blur-md px-3 py-2 border border-[#E7EBF3] rounded-xl shadow-lg text-[10px] font-bold text-[#3478F6] font-code">ETB {payload[0].value.toLocaleString()}</div> : null)} />
                          <Area type="monotone" dataKey="total" stroke="#3478F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTrend)" />
                        </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </CardContent>
      </Card>

      {/* Grid Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-2">
        <Card className="col-span-2 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-[rgba(52,194,100,0.13)] p-4 rounded-2xl text-[#34C264] shadow-sm"><UserCheck className="h-6 w-6" /></div>
              <div><p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">On-site Staff</p><p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">{liveTotals.onSite} <span className="text-[#9AA3B8] font-medium">/ {activeEmployees.length}</span></p></div>
            </div>
            {liveTotals.onSite === activeEmployees.length && activeEmployees.length > 0 && <Badge className="bg-[rgba(52,194,100,0.13)] text-[#34C264] border-none shadow-none font-bold text-[10px] uppercase tracking-[0.06em] px-2 py-1 h-auto rounded-lg">FULL</Badge>}
          </CardContent>
        </Card>
        <Card className="col-span-1 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 aspect-square">
            <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full gap-3">
                <div className="bg-[rgba(52,120,246,0.11)] p-3 sm:p-4 rounded-2xl text-[#3478F6] shadow-sm"><HandCoins className="h-5 w-5 sm:h-6 sm:w-6" /></div>
                <div><p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">Weekly Est.</p><p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">{liveTotals.week.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
            </CardContent>
        </Card>
        <Card className="col-span-1 rounded-[2rem] border-none shadow-md bg-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 aspect-square">
            <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full gap-3">
                <div className="bg-[rgba(139,92,246,0.12)] p-3 sm:p-4 rounded-2xl text-[#8B5CF6] shadow-sm"><BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" /></div>
                <div><p className="text-[10px] font-semibold text-[#9AA3B8] uppercase tracking-[0.12em] mb-1">Monthly Est.</p><p className="text-[19px] font-bold text-[#10192E] tracking-tight leading-none font-headline">{liveTotals.month.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
            </CardContent>
        </Card>
      </div>

      {/* Detailed Overview Section */}
      <Tabs defaultValue="week" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-14 bg-muted/30 p-1 rounded-2xl mb-8">
            <TabsTrigger value="week" className="rounded-xl font-bold text-base data-[state=active]:bg-white data-[state=active]:shadow-md">Weekly Detailed Overview</TabsTrigger>
            <TabsTrigger value="month" className="rounded-xl font-bold text-base data-[state=active]:bg-white data-[state=active]:shadow-md">Monthly Detailed Overview</TabsTrigger>
        </TabsList>
        
        <TabsContent value="week" className="space-y-6">
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[2.5rem] border border-dashed border-muted shadow-sm gap-6">
                <div className="text-center space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Current Weekly Payout</p>
                    <p className="text-5xl font-black text-[#10192E] tracking-tighter">ETB {liveTotals.week.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                
                {isWeeklyPayWindow && (
                    <Button 
                        disabled={isProcessingPay}
                        onClick={() => handleMarkAsPaid('Weekly')}
                        className="h-14 px-10 rounded-2xl bg-[#3478F6] hover:bg-[#2860CC] text-white font-bold text-lg shadow-xl shadow-[#3478F6]/20 transition-all active:scale-95"
                    >
                        {isProcessingPay ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                        Mark as Paid & Notify Admin
                    </Button>
                )}
                {!isWeeklyPayWindow && (
                     <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/40 px-4 py-2 rounded-full border">Pay Window opens on Saturday</p>
                )}
            </div>
        </TabsContent>

        <TabsContent value="month" className="space-y-6">
             <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[2.5rem] border border-dashed border-muted shadow-sm gap-6">
                <div className="text-center space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Current Monthly Payout</p>
                    <p className="text-5xl font-black text-[#10192E] tracking-tighter">ETB {liveTotals.month.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                
                {isMonthlyPayWindow && (
                    <Button 
                        disabled={isProcessingPay}
                        onClick={() => handleMarkAsPaid('Monthly')}
                        className="h-14 px-10 rounded-2xl bg-[#3478F6] hover:bg-[#2860CC] text-white font-bold text-lg shadow-xl shadow-[#3478F6]/20 transition-all active:scale-95"
                    >
                         {isProcessingPay ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                        Mark as Paid & Notify Admin
                    </Button>
                )}
                {!isMonthlyPayWindow && (
                     <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/40 px-4 py-2 rounded-full border">Pay Window opens at month end</p>
                )}
            </div>
        </TabsContent>
      </Tabs>

      {/* Historical Audit Card */}
      <Card className="shadow-lg border-none rounded-3xl overflow-hidden ring-1 ring-[#10192E]/5">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-8 border-b border-[#E7EBF3]">
              <div className="flex items-center gap-4"><div className="bg-[#3478F6] p-3.5 rounded-2xl text-white shadow-md"><Wallet className="h-7 w-7" /></div><div><CardTitle className="text-2xl font-bold text-[#10192E] tracking-tight font-headline">Historical Workshop Audit</CardTitle><CardDescription className="text-xs font-semibold text-[#9AA3B8] uppercase tracking-widest mt-1">Consolidated monthly expense summary</CardDescription></div></div>
              <div className="w-full sm:w-[280px]">
                  <Select value={selectedUnifiedMonth} onValueChange={setSelectedUnifiedMonth}>
                      <SelectTrigger className="h-12 bg-white rounded-2xl border-[#E7EBF3] font-bold px-6 shadow-sm"><SelectValue placeholder="Select month" /></SelectTrigger>
                      <SelectContent className="rounded-2xl">
                          {Array.from({ length: 12 }).map((_, i) => {
                              const d = subMonths(new Date(), i);
                              const eth = toEthiopian(d);
                              const start = toGregorian(eth.year, eth.month, 1);
                              return (
                                  <SelectItem key={i} value={format(start, "yyyy-MM-dd")} className="font-medium py-3">
                                      {ethiopianDateFormatter(start, { month: 'long' })} {eth.year}
                                  </SelectItem>
                              )
                          })}
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

      {/* Manual Sync Trigger */}
      <div className="flex justify-center pt-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleManualHistorySync}
            disabled={isSyncingHistory || employeesLoading}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9AA3B8] hover:text-[#3478F6] transition-colors gap-2"
          >
            {isSyncingHistory ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />}
            {isSyncingHistory ? "Synchronizing Records..." : "Re-sync Historical Ledger"}
          </Button>
      </div>
    </div>
  );
}
