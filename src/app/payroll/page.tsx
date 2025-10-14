

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
  getDay
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import type { Employee, AttendanceRecord, PayrollEntry } from "@/lib/types";
import { useFirestore, useUser, errorEmitter, useMemoFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
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
    const parts = ethiopianDateFormatter(date, { year: 'numeric', month: 'numeric', day: 'numeric' }).split('/');
    return {
        month: parseInt(parts[0], 10),
        day: parseInt(parts[1], 10),
        year: parseInt(parts[2], 10)
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
    const dayDiff = ((ethYear - ethToday.year) * 365) + ((ethMonth - ethToday.month) * 30) + (ethDay - ethToday.day);
    return addDays(today, dayDiff);
};


export default function PayrollPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
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
                 const permissionError = new FirestorePermissionError({
                    path: attColRef.path,
                    operation: 'list',
                });
                errorEmitter.emit('permission-error', permissionError);
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

    const today = new Date();
    const options = [];
    let current = toGregorian(toEthiopian(today).year, toEthiopian(today).month, 1);
    for(let i=0; i<12; i++){
        const ethDate = toEthiopian(current);
        const monthStart = toGregorian(ethDate.year, ethDate.month, 1);

        const earliestAttendance = allAttendance.length > 0 ? getDateFromRecord(allAttendance[0].date) : new Date();
        if (monthStart < earliestAttendance && i > 0) break;

        const monthName = ethiopianDateFormatter(monthStart, { month: 'long' });
        options.push({
            value: monthStart.toISOString(),
            label: `${monthName} ${ethDate.year}`
        });
        const prevMonth = ethDate.month > 1 ? ethDate.month - 1 : 13;
        const prevYear = ethDate.month > 1 ? ethDate.year : ethDate.year - 1;
        current = toGregorian(prevYear, prevMonth, 1);
    }
    setMonthOptions(options);
  }, [setTitle, allAttendance]);


  const { weeklyPayroll, monthlyPayroll } = useMemo(() => {
    if (!employees || allAttendance.length === 0) return { weeklyPayroll: [], monthlyPayroll: [] };

    const weekly: PayrollEntry[] = [];
    const monthly: PayrollEntry[] = [];

    const today = new Date();
    const ethToday = toEthiopian(today);

    // Weekly calculation
    const weekStart = addDays(today, (1 - getDay(today) + 7) % 7);
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


  const handleMonthSelect = (value: string) => {
    if (!value) return;
    setSelectedMonth(new Date(value));
  }
  
  if (employeesLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>;
  }

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
                 <Select onValueChange={handleMonthSelect} defaultValue={selectedMonth.toISOString()}>
                    <SelectTrigger className="w-full lg:w-1/3">
                        <SelectValue placeholder="Select a month" />
                    </SelectTrigger>
                    <SelectContent>
                        {monthOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <ExpenseChart 
                    employees={employees || []} 
                    attendanceRecords={allAttendance} 
                    selectedMonth={selectedMonth} 
                />
          </CardContent>
        </Card>
    </div>
  );
}
