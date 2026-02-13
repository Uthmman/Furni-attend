

"use client";

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
  format,
  isValid,
  addDays,
  isWithinInterval,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  parse,
  getDay
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import type { Employee, AttendanceRecord, PayrollEntry } from "@/lib/types";
import { useFirestore, useUser, errorEmitter, useMemoFirebase } from '@/firebase';
import { collection, getDocs, FirestoreError } from 'firebase/firestore';
import { ExpenseChart } from './expense-chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollection } from '@/firebase';
import { PayrollList } from './payroll-list';
import { FirestorePermissionError } from '@/firebase/errors';

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (!date) return new Date();
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}

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

const getEthiopianMonthDays = (year: number, month: number): number => {
    if (month < 1 || month > 13) return 0;
    if (month <= 12) return 30;
    // Pagume (13th month)
    const isLeap = (year + 1) % 4 === 0;
    return isLeap ? 6 : 5;
};

const toGregorian = (ethYear: number, ethMonth: number, ethDay: number): Date => {
    const today = new Date();
    const ethToday = toEthiopian(today);
    // Rough approximation
    const dayDiff = ((ethYear - ethToday.year) * 365.25) + ((ethMonth - ethToday.month) * 30) + (ethDay - ethToday.day);
    return addDays(today, Math.round(dayDiff));
};

const calculateHoursWorked = (record: AttendanceRecord, isMonthlyEmployee: boolean = false): number => {
    if (!record) return 0;
    const recordDate = getDateFromRecord(record.date);

    if (getDay(recordDate) === 0) { // Is Sunday
        if (record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent') {
            return 8;
        }
        return 0;
    }
    
    if (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent') return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    let totalHours = 0;

    if (record.morningStatus !== 'Absent' && record.morningEntry) {
        const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
        if(isValid(morningEntryTime) && morningEntryTime < morningEndTime) {
            const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
            totalHours += morningWorkMs / (1000 * 60 * 60);
        }
    }
    
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
        if(isValid(afternoonEntryTime) && afternoonEntryTime < afternoonEndTime) {
            const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
            totalHours += afternoonWorkMs / (1000 * 60 * 60);
        }
    }

    return Math.max(0, totalHours);
};

const calculateExpectedHours = (record: AttendanceRecord, isMonthlyEmployee: boolean = false): number => {
    if (!record) return 0;
    const isSaturday = getDay(getDateFromRecord(record.date)) === 6;

    let expected = 0;
    if (record.morningStatus !== 'Absent') {
        expected += 4.5;
    }
    if (record.afternoonStatus !== 'Absent') {
        if(isSaturday && isMonthlyEmployee) expected += 3.5;
        else expected += 3.5;
    }

    return expected;
}

const calculateMinutesLate = (record: AttendanceRecord): number => {
    if (!record) return 0;
    let minutesLate = 0;
    if (record.morningStatus === 'Late' && record.morningEntry) {
        const morningStartTime = parse("08:00", "HH:mm", new Date());
        const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
        if (isValid(morningEntryTime) && morningEntryTime > morningStartTime) {
            minutesLate += (morningEntryTime.getTime() - morningStartTime.getTime()) / (1000 * 60);
        }
    }
    if (record.afternoonStatus === 'Late' && record.afternoonEntry) {
        const afternoonStartTime = parse("13:30", "HH:mm", new Date());
        const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
        if (isValid(afternoonEntryTime) && afternoonEntryTime > afternoonStartTime) {
            minutesLate += (afternoonEntryTime.getTime() - afternoonStartTime.getTime()) / (1000 * 60);
        }
    }
    return Math.round(minutesLate);
};


export default function PayrollPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState<Date>(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1));
  const [monthOptions, setMonthOptions] = useState<{label: string, value: string}[]>([]);
  
  const [selectedWeek, setSelectedWeek] = useState<Date | undefined>(undefined);
  const [weekOptions, setWeekOptions] = useState<{label: string, value: string}[]>([]);


  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef);
  
  useEffect(() => {
    const fetchAllAttendance = () => {
        if (!firestore || !employees || employees.length === 0) {
          setAttendanceLoading(false);
          return;
        }

        setAttendanceLoading(true);
        const allRecords: AttendanceRecord[] = [];

        const employeePromises = (employees || []).map(emp => {
            const attendanceColRef = collection(firestore, 'employees', emp.id, 'attendance');
            return getDocs(attendanceColRef).catch(error => {
                if (error instanceof FirestoreError) {
                    const permissionError = new FirestorePermissionError({
                        path: attendanceColRef.path,
                        operation: 'list'
                    });
                    errorEmitter.emit('permission-error', permissionError);
                }
                return { docs: [] as any[] }; // Return empty on error to not break Promise.all
            });
        });

        Promise.all(employeePromises)
            .then(snapshots => {
                snapshots.forEach(snapshot => {
                    snapshot.docs.forEach(doc => {
                        allRecords.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
                    });
                });
                setAllAttendance(allRecords);
            })
            .catch(error => {
                console.error("Error fetching all attendance records:", error);
                 const permissionError = new FirestorePermissionError({
                    path: 'employees/{employeeId}/attendance',
                    operation: 'list'
                });
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => {
                setAttendanceLoading(false);
            });
    };

    if (!employeesLoading && !isUserLoading && employees) {
      fetchAllAttendance();
    }
  }, [firestore, employees, employeesLoading, isUserLoading]);
  
  useEffect(() => {
    setTitle("Payroll Analytics");

    if (allAttendance.length > 0 && employees && employees.length > 0) {
        const today = new Date();
        
        const earliestAttendance = employees.reduce((min, e) => {
            if (!e.attendanceStartDate) return min;
            const d = new Date(e.attendanceStartDate);
            return d < min ? d : min;
        }, new Date());
        
        // Month Options
        const mOptions = [];
        let currentMonthStart = toGregorian(toEthiopian(today).year, toEthiopian(today).month, 1);
        for(let i=0; i < 12; i++){
            const ethDate = toEthiopian(currentMonthStart);
            const monthStart = toGregorian(ethDate.year, ethDate.month, 1);
            if (monthStart < addDays(earliestAttendance, -31)) break;
            const monthName = ethiopianDateFormatter(monthStart, { month: 'long' });
            mOptions.push({ value: monthStart.toISOString(), label: `${monthName} ${ethDate.year}` });
            const prevMonthDate = addDays(monthStart, -5);
            const prevEthDate = toEthiopian(prevMonthDate);
            currentMonthStart = toGregorian(prevEthDate.year, prevEthDate.month, 1);
        }
        setMonthOptions(mOptions);
        if (mOptions.length > 0) setSelectedMonth(new Date(mOptions[0]?.value || new Date()));

        // Week Options
        const wOptions = [];
        let currentWeekStart = startOfWeek(today, { weekStartsOn: 0 }); // Sunday
        for(let i=0; i < 12; i++){
            const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 }); // Saturday
            if (weekEnd < earliestAttendance) break;
            const startDayEth = ethiopianDateFormatter(currentWeekStart, { day: 'numeric', month: 'short' });
            const endDayEth = ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' });
            wOptions.push({ value: currentWeekStart.toISOString(), label: `${startDayEth} - ${endDayEth}` });
            currentWeekStart = addDays(currentWeekStart, -7);
        }
        setWeekOptions(wOptions);
        if(wOptions.length > 0) setSelectedWeek(new Date(wOptions[0].value));
    }
  }, [setTitle, allAttendance, employees]);


  const { weeklyPayroll, monthlyPayroll } = useMemo(() => {
    if (!employees || allAttendance.length === 0) return { weeklyPayroll: [], monthlyPayroll: [] };

    const weekly: PayrollEntry[] = [];
    const monthly: PayrollEntry[] = [];

    const today = new Date();
    const ethToday = toEthiopian(today);

    // Weekly calculation
    const weekStart = startOfWeek(today, { weekStartsOn: 0 }); // Sunday
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 }); // Saturday
    const weekPeriodLabel = `${ethiopianDateFormatter(weekStart, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short' })}`;

    // Monthly calculation
    const monthStart = toGregorian(ethToday.year, ethToday.month, 1);
    const monthPeriodLabel = `${ethiopianDateFormatter(monthStart, { month: 'long' })} ${ethToday.year}`;

    employees.forEach(employee => {
        let periodLabel: string;
        let targetList: PayrollEntry[];
        
        if (employee.paymentMethod === 'Weekly') {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
            if (!hourlyRate) return;

            const period = { start: weekStart, end: weekEnd };
            periodLabel = weekPeriodLabel;
            targetList = weekly;

             const relevantRecords = allAttendance.filter(r => 
                r.employeeId === employee.id &&
                isValid(getDateFromRecord(r.date)) &&
                isWithinInterval(getDateFromRecord(r.date), period)
            );

            let totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r, false), 0);
            const overtimeHours = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
            
            const periodDays = eachDayOfInterval(period);
            const recordedDates = new Set(relevantRecords.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
            const employeeStartDate = new Date(employee.attendanceStartDate || 0);

            periodDays.forEach(day => {
                if (day >= employeeStartDate && getDay(day) === 0) { // Is Sunday
                    const dayStr = format(day, 'yyyy-MM-dd');
                    if (!recordedDates.has(dayStr)) {
                        totalHours += 8;
                    }
                }
            });

            const expectedHours = relevantRecords.reduce((acc, r) => acc + calculateExpectedHours(r, false), 0);
            const finalAmount = (totalHours + overtimeHours) * hourlyRate;
            const overtimeAmount = overtimeHours * hourlyRate;
            const lateHours = Math.max(0, expectedHours - totalHours);
            const lateDeduction = lateHours * hourlyRate;
            const baseAmount = employee.dailyRate ? employee.dailyRate * 6 : (expectedHours - overtimeHours) * hourlyRate;
            const daysWorked = new Set(relevantRecords.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd'))).size;

            if (finalAmount > 0 || daysWorked > 0) {
                targetList.push({
                    employeeId: employee.id,
                    employeeName: employee.name,
                    paymentMethod: employee.paymentMethod,
                    period: periodLabel,
                    amount: finalAmount,
                    status: 'Unpaid',
                    workingDays: daysWorked,
                    totalHours: totalHours,
                    overtimeHours: overtimeHours,
                    baseAmount: baseAmount > 0 ? baseAmount : 0,
                    overtimeAmount: overtimeAmount,
                    lateDeduction: lateDeduction,
                });
            }

        } else { // Monthly
            const baseSalary = employee.monthlyRate || 0;
            if (baseSalary === 0) return;

            const period = { start: monthStart, end: today };
            periodLabel = monthPeriodLabel;
            targetList = monthly;
            
            const dailyRate = baseSalary / 23.625;
            const hourlyRate = dailyRate / 8;
            const minuteRate = hourlyRate / 60;

            const relevantRecords = allAttendance.filter(r => 
                r.employeeId === employee.id &&
                isValid(getDateFromRecord(r.date)) &&
                isWithinInterval(getDateFromRecord(r.date), period)
            );

            const absentDates: string[] = [];
            const lateDates: string[] = [];
            let totalHoursAbsent = 0;

            const minutesLate = relevantRecords.reduce((acc, r) => {
                const recordDate = getDateFromRecord(r.date);
                const formattedDate = format(recordDate, 'MMM d');
                let isAbsent = false;

                if (r.morningStatus === 'Absent') {
                    totalHoursAbsent += 4.5;
                    isAbsent = true;
                }
                
                if (getDay(recordDate) !== 6 && r.afternoonStatus === 'Absent') {
                    totalHoursAbsent += 3.5;
                    isAbsent = true;
                }

                if(isAbsent && !absentDates.includes(formattedDate)){
                    absentDates.push(formattedDate);
                }
                
                const currentMinutesLate = calculateMinutesLate(r);
                if (currentMinutesLate > 0 && !lateDates.includes(formattedDate)) {
                    lateDates.push(formattedDate);
                }

                return acc + currentMinutesLate;
            }, 0);

            const periodDays = eachDayOfInterval(period);
            const employeeStartDate = new Date(employee.attendanceStartDate || 0);
            const recordedDates = new Set(relevantRecords.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

            periodDays.forEach(day => {
                if (day >= employeeStartDate && getDay(day) !== 0) { // Mon-Sat
                    const dayStr = format(day, 'yyyy-MM-dd');
                    if (!recordedDates.has(dayStr)) {
                        const formattedDate = format(day, 'MMM d');
                        if (getDay(day) === 6) { 
                            totalHoursAbsent += 4.5;
                        } else {
                            totalHoursAbsent += 8;
                        }
                        if(!absentDates.includes(formattedDate)){
                           absentDates.push(formattedDate);
                        }
                    }
                }
            });

            const absenceDeduction = totalHoursAbsent * hourlyRate;
            const lateDeduction = minutesLate * minuteRate;
            
            const netSalary = baseSalary - (absenceDeduction + lateDeduction);

            if (netSalary > 0 || relevantRecords.length > 0) {
                targetList.push({
                    employeeId: employee.id,
                    employeeName: employee.name,
                    paymentMethod: employee.paymentMethod,
                    period: periodLabel,
                    amount: netSalary,
                    status: 'Unpaid',
                    baseSalary: baseSalary,
                    baseAmount: baseSalary,
                    hoursAbsent: totalHoursAbsent,
                    minutesLate: minutesLate,
                    absenceDeduction: absenceDeduction,
                    lateDeduction: lateDeduction,
                    absentDates: absentDates,
                    lateDates: lateDates,
                });
            }
        }
    });

    return { weeklyPayroll: weekly, monthlyPayroll: monthly };

  }, [employees, allAttendance]);

  const monthlyExpenseHistoryData = useMemo(() => {
    if (!employees || !allAttendance || !selectedMonth) return { monthly: [], totalMonthly: 0 };

    const ethSelected = toEthiopian(selectedMonth);
    const monthStart = selectedMonth;
    const daysInMonthCount = getEthiopianMonthDays(ethSelected.year, ethSelected.month);
    const monthEnd = addDays(monthStart, daysInMonthCount - 1);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let totalMonthlyExpense = 0;
    const monthlyData: {name: string, monthly: number}[] = [];

    daysInMonth.forEach(day => {
        let dailyMonthlyExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.filter(e => e.paymentMethod === 'Monthly').forEach(employee => {
            const baseSalary = employee.monthlyRate || 0;
            if (baseSalary === 0) return;

             const hourlyRate = employee.hourlyRate || (baseSalary / 23.625 / 8);
             if (!hourlyRate) return;

             const record = allAttendance.find(r => 
                r.employeeId === employee.id && 
                format(getDateFromRecord(r.date), 'yyyy-MM-dd') === dayStr
             );

             if (record) {
                const hoursWorked = calculateHoursWorked(record, true);
                const overtime = record.overtimeHours || 0;
                dailyMonthlyExpense += (hoursWorked + overtime) * hourlyRate;
             }
        });
        
        totalMonthlyExpense += dailyMonthlyExpense;
        const dayName = toEthiopian(day).day.toString();
        monthlyData.push({ name: dayName, monthly: dailyMonthlyExpense });
    });

    return {
        monthly: monthlyData,
        totalMonthly: totalMonthlyExpense,
    };
  }, [employees, allAttendance, selectedMonth]);

  const weeklyExpenseHistoryData = useMemo(() => {
    if (!employees || !allAttendance || !selectedWeek) return { weekly: [], totalWeekly: 0 };

    const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

    let totalWeeklyExpense = 0;
    const weeklyData: {name: string, weekly: number}[] = [];

    daysInWeek.forEach(day => {
        let dailyWeeklyExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.filter(e => e.paymentMethod === 'Weekly').forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
            if (!hourlyRate) return;

            const record = allAttendance.find(r => 
                r.employeeId === employee.id && 
                format(getDateFromRecord(r.date), 'yyyy-MM-dd') === dayStr
            );
            
            if (record) {
                const hoursWorked = calculateHoursWorked(record);
                const overtime = record.overtimeHours || 0;
                dailyWeeklyExpense += (hoursWorked + overtime) * hourlyRate;
            } else if (getDay(day) === 0) { // Unrecorded Sunday
                dailyWeeklyExpense += 8 * hourlyRate;
            }
        });
        
        totalWeeklyExpense += dailyWeeklyExpense;
        const dayName = ethiopianDateFormatter(day, { weekday: 'short' });
        weeklyData.push({ name: dayName, weekly: dailyWeeklyExpense });
    });

    return {
        weekly: weeklyData,
        totalWeekly: totalWeeklyExpense
    };
  }, [employees, allAttendance, selectedWeek]);
  
  const totalExpenseHistoryData = useMemo(() => {
    if (!selectedMonth || !employees || !allAttendance) return { total: [], overallTotal: 0 };

    const ethSelected = toEthiopian(selectedMonth);
    const monthStart = selectedMonth;
    const daysInMonthCount = getEthiopianMonthDays(ethSelected.year, ethSelected.month);
    const monthEnd = addDays(monthStart, daysInMonthCount - 1);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let overallTotal = 0;
    const totalData: {name: string, total: number}[] = [];

    daysInMonth.forEach(day => {
        let dailyTotalExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0) || (employee.monthlyRate ? employee.monthlyRate / 23.625 / 8 : 0);
            if (!hourlyRate) return;

            const record = allAttendance.find(r => 
                r.employeeId === employee.id && 
                format(getDateFromRecord(r.date), 'yyyy-MM-dd') === dayStr
            );
            
            if (record) {
                const hoursWorked = calculateHoursWorked(record, employee.paymentMethod === 'Monthly');
                const overtime = record.overtimeHours || 0;
                dailyTotalExpense += (hoursWorked + overtime) * hourlyRate;
            } else if (employee.paymentMethod === 'Weekly' && getDay(day) === 0) { // Unrecorded Sunday for weekly
                dailyTotalExpense += 8 * hourlyRate;
            }
        });
        
        overallTotal += dailyTotalExpense;
        const dayName = toEthiopian(day).day.toString();
        totalData.push({ name: dayName, total: dailyTotalExpense });
    });
    
    return {
        total: totalData,
        overallTotal: overallTotal
    };

  }, [selectedMonth, employees, allAttendance]);


  const handleMonthSelect = (value: string) => {
    if (!value) return;
    setSelectedMonth(new Date(value));
  }
  
  const handleWeekSelect = (value: string) => {
    if (!value) return;
    setSelectedWeek(new Date(value));
  }
  
  if (employeesLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>;
  }

  const monthLabel = selectedMonth ? ethiopianDateFormatter(selectedMonth, {month: 'long', year: 'numeric'}) : "";
  const weekLabel = selectedWeek ? weekOptions.find(o => o.value === selectedWeek.toISOString())?.label : "";

  return (
    <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PayrollList title="Upcoming Weekly Payout" payrollData={weeklyPayroll} />
            <PayrollList title="Upcoming Monthly Payout" payrollData={monthlyPayroll} />
        </div>

        <Card>
          <CardHeader>
              <CardTitle>Expense History</CardTitle>
              <CardDescription>Select a period to view the detailed expense breakdown.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-4">
                        <Select onValueChange={handleWeekSelect} value={selectedWeek?.toISOString()}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a week" />
                            </SelectTrigger>
                            <SelectContent>
                                {weekOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <ExpenseChart 
                            title="Weekly Expenses"
                            description={weekLabel}
                            chartData={weeklyExpenseHistoryData.weekly}
                            series={[{key: 'weekly', name: 'Weekly', color: 'hsl(var(--chart-1))'}]}
                            total={weeklyExpenseHistoryData.totalWeekly}
                        />
                    </div>
                    <div className="flex flex-col gap-4">
                        <Select onValueChange={handleMonthSelect} value={selectedMonth.toISOString()}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a month" />
                            </SelectTrigger>
                            <SelectContent>
                                {monthOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <ExpenseChart 
                            title="Monthly Expenses"
                            description={monthLabel}
                            chartData={monthlyExpenseHistoryData.monthly}
                            series={[{key: 'monthly', name: 'Monthly', color: 'hsl(var(--chart-2))'}]}
                            total={monthlyExpenseHistoryData.totalMonthly}
                        />
                    </div>
                     <div className="flex flex-col gap-4">
                        <div className="h-10"/>
                        <ExpenseChart 
                            title="Total Expenses"
                            description={monthLabel}
                            chartData={totalExpenseHistoryData.total}
                            series={[{key: 'total', name: 'Total', color: 'hsl(var(--chart-3))'}]}
                            total={totalExpenseHistoryData.overallTotal}
                        />
                     </div>
                </div>
          </CardContent>
        </Card>
    </div>
  );
}
