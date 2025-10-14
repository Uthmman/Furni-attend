

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
  getDay,
  eachDayOfInterval
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import type { Employee, AttendanceRecord, PayrollEntry } from "@/lib/types";
import { useFirestore, useUser, errorEmitter, useMemoFirebase } from '@/firebase';
import { collection, getDocs, FirestoreError } from 'firebase/firestore';
import { ExpenseChart } from './expense-chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollection } from '@/firebase/firestore/use-collection';
import { PayrollList } from './payroll-list';

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
        return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
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


export default function PayrollPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1));
  const [monthOptions, setMonthOptions] = useState<{label: string, value: string}[]>([]);


  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: employees, isLoading: employeesLoading } = useCollection(employeesCollectionRef);
  
  useEffect(() => {
    const fetchAllAttendance = async () => {
        if (!firestore || !employees || employees.length === 0) {
          setAttendanceLoading(false);
          return;
        }

        setAttendanceLoading(true);
        const allRecords: AttendanceRecord[] = [];
        const attendanceStartDate = employees.reduce((min, e) => {
          if (!e.attendanceStartDate) return min;
          const d = new Date(e.attendanceStartDate);
          return d < min ? d : min;
        }, new Date());
        
        let date = attendanceStartDate;
        const today = new Date();
        
        while(date <= today) {
            const dateStr = format(date, 'yyyy-MM-dd');
            const attColRef = collection(firestore, 'attendance', dateStr, 'records');
             try {
                const querySnapshot = await getDocs(attColRef);
                querySnapshot.forEach(doc => {
                    allRecords.push({ id: doc.id, ...doc.data(), employeeId: doc.data().employeeId } as AttendanceRecord);
                });
            } catch(e) {
                 const permissionError = new FirestoreError( 'permission-denied', `Missing or insufficient permissions to read collection at path: ${attColRef.path}`);
                 errorEmitter.emit('permission-error', permissionError as any);
            }
            date = addDays(date, 1);
        }

        setAllAttendance(allRecords);
        setAttendanceLoading(false);
    };

    if (!employeesLoading && !isUserLoading && employees) {
      fetchAllAttendance();
    }
  }, [firestore, employees, employeesLoading, isUserLoading]);
  
  useEffect(() => {
    setTitle("Payroll Analytics");

    if (allAttendance.length > 0 && employees && employees.length > 0) {
        const today = new Date();
        const options = [];
        let currentMonthStart = toGregorian(toEthiopian(today).year, toEthiopian(today).month, 1);
        
        const earliestAttendance = employees.reduce((min, e) => {
            if (!e.attendanceStartDate) return min;
            const d = new Date(e.attendanceStartDate);
            return d < min ? d : min;
        }, new Date());

        for(let i=0; i < 12; i++){
            const ethDate = toEthiopian(currentMonthStart);
            const monthStart = toGregorian(ethDate.year, ethDate.month, 1);

            if (monthStart < addDays(earliestAttendance, -31)) break;

            const monthName = ethiopianDateFormatter(monthStart, { month: 'long' });
            options.push({
                value: monthStart.toISOString(),
                label: `${monthName} ${ethDate.year}`
            });

            const prevMonthDate = addDays(monthStart, -5);
            const prevEthDate = toEthiopian(prevMonthDate);
            currentMonthStart = toGregorian(prevEthDate.year, prevEthDate.month, 1);
        }
        setMonthOptions(options);
        if (options.length > 0) {
           setSelectedMonth(new Date(options[0]?.value || new Date()));
        }
    }
  }, [setTitle, allAttendance, employees]);


  const { weeklyPayroll, monthlyPayroll } = useMemo(() => {
    if (!employees || allAttendance.length === 0) return { weeklyPayroll: [], monthlyPayroll: [] };

    const weekly: PayrollEntry[] = [];
    const monthly: PayrollEntry[] = [];

    const today = new Date();
    const ethToday = toEthiopian(today);

    // Weekly calculation
    const weekStart = addDays(today, -((getDay(today) + 6) % 7));
    const weekEnd = addDays(weekStart, 6);
    const weekPeriodLabel = `${ethiopianDateFormatter(weekStart, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;

    // Monthly calculation
    const monthStart = toGregorian(ethToday.year, ethToday.month, 1);
    const daysInMonth = getEthiopianMonthDays(ethToday.year, ethToday.month);
    const monthEnd = addDays(monthStart, daysInMonth - 1);
    const monthPeriodLabel = `${ethiopianDateFormatter(monthStart, { month: 'long' })} ${ethToday.year}`;

    employees.forEach(employee => {
        const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0) || (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
        if (!hourlyRate) return;

        let period: { start: Date, end: Date };
        let periodLabel: string;
        let targetList: PayrollEntry[];

        if (employee.paymentMethod === 'Weekly') {
            period = { start: weekStart, end: weekEnd };
            periodLabel = weekPeriodLabel;
            targetList = weekly;
        } else {
            period = { start: monthStart, end: monthEnd };
            periodLabel = monthPeriodLabel;
            targetList = monthly;
        }
        
        const relevantRecords = allAttendance.filter(r => 
            r.employeeId === employee.id &&
            isWithinInterval(getDateFromRecord(r.date), period) &&
            (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')
        );

        const totalHours = relevantRecords.reduce((acc, r) => {
            let hours = 0;
            if (r.morningStatus !== 'Absent') hours += 4.5;
            if (r.afternoonStatus !== 'Absent') hours += 3.5;
            return acc + hours;
        }, 0);

        const overtimeHours = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        const amount = (totalHours + overtimeHours) * hourlyRate;
        const daysWorked = new Set(relevantRecords.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd'))).size;

        if (amount > 0) {
            targetList.push({
                employeeId: employee.id,
                employeeName: employee.name,
                paymentMethod: employee.paymentMethod,
                period: periodLabel,
                amount: amount,
                status: 'Unpaid',
                workingDays: daysWorked,
            });
        }
    });

    return { weeklyPayroll: weekly, monthlyPayroll: monthly };

  }, [employees, allAttendance]);

  const expenseHistoryData = useMemo(() => {
    if (!employees || !allAttendance) return { weekly: [], monthly: [], total: [], totalWeekly: 0, totalMonthly: 0, overallTotal: 0 };

    const ethSelected = toEthiopian(selectedMonth);
    const monthStart = selectedMonth;
    const daysInMonthCount = getEthiopianMonthDays(ethSelected.year, ethSelected.month);
    const monthEnd = addDays(monthStart, daysInMonthCount - 1);

    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let totalMonthlyExpense = 0;
    let totalWeeklyExpense = 0;

    const weeklyData: {name: string, weekly: number}[] = [];
    const monthlyData: {name: string, monthly: number}[] = [];
    const totalData: {name: string, total: number}[] = [];


    daysInMonth.map(day => {
        let dailyWeeklyExpense = 0;
        let dailyMonthlyExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0) || (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
            if (!hourlyRate) return;

            const record = allAttendance.find(r => 
                r.employeeId === employee.id && 
                format(getDateFromRecord(r.date), 'yyyy-MM-dd') === dayStr &&
                (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')
            );
            
            if (record) {
                let hoursWorked = 0;
                if(record.morningStatus !== 'Absent') hoursWorked += 4.5;
                if(record.afternoonStatus !== 'Absent') hoursWorked += 3.5;
                
                const overtime = record.overtimeHours || 0;
                const dailyTotal = (hoursWorked + overtime) * hourlyRate;

                if (employee.paymentMethod === 'Weekly') {
                    dailyWeeklyExpense += dailyTotal;
                } else {
                    dailyMonthlyExpense += dailyTotal;
                }
            }
        });
        
        totalWeeklyExpense += dailyWeeklyExpense;
        totalMonthlyExpense += dailyMonthlyExpense;

        const dayName = toEthiopian(day).day.toString();
        weeklyData.push({ name: dayName, weekly: dailyWeeklyExpense });
        monthlyData.push({ name: dayName, monthly: dailyMonthlyExpense });
        totalData.push({ name: dayName, total: dailyWeeklyExpense + dailyMonthlyExpense });
    });

    return {
        weekly: weeklyData,
        monthly: monthlyData,
        total: totalData,
        totalWeekly: totalWeeklyExpense,
        totalMonthly: totalMonthlyExpense,
        overallTotal: totalWeeklyExpense + totalMonthlyExpense
    };
  }, [employees, allAttendance, selectedMonth]);


  const handleMonthSelect = (value: string) => {
    if (!value) return;
    setSelectedMonth(new Date(value));
  }
  
  if (employeesLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>;
  }

  const monthLabel = ethiopianDateFormatter(selectedMonth, {month: 'long', year: 'numeric'});

  return (
    <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PayrollList title="Upcoming Weekly Payout" payrollData={weeklyPayroll} />
            <PayrollList title="Upcoming Monthly Payout" payrollData={monthlyPayroll} />
        </div>

        <Card>
          <CardHeader>
              <CardTitle>Monthly Expense History</CardTitle>
              <CardDescription>Select an Ethiopian month to view the detailed expense breakdown.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
                 <Select onValueChange={handleMonthSelect} value={selectedMonth.toISOString()}>
                    <SelectTrigger className="w-full lg:w-1/3">
                        <SelectValue placeholder="Select a month" />
                    </SelectTrigger>
                    <SelectContent>
                        {monthOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <ExpenseChart 
                        title="Weekly Expenses"
                        description={monthLabel}
                        chartData={expenseHistoryData.weekly}
                        series={[{key: 'weekly', name: 'Weekly', color: 'hsl(var(--chart-1))'}]}
                        total={expenseHistoryData.totalWeekly}
                    />
                    <ExpenseChart 
                        title="Monthly Expenses"
                        description={monthLabel}
                        chartData={expenseHistoryData.monthly}
                        series={[{key: 'monthly', name: 'Monthly', color: 'hsl(var(--chart-2))'}]}
                        total={expenseHistoryData.totalMonthly}
                    />
                     <ExpenseChart 
                        title="Total Expenses"
                        description={monthLabel}
                        chartData={expenseHistoryData.total}
                        series={[{key: 'total', name: 'Total', color: 'hsl(var(--chart-3))'}]}
                        total={expenseHistoryData.overallTotal}
                    />
                </div>
          </CardContent>
        </Card>
    </div>
  );
}
