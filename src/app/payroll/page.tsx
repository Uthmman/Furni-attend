
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
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import type { Employee, AttendanceRecord } from "@/lib/types";
import { useFirestore, useUser, errorEmitter, FirestorePermissionError, useMemoFirebase, useCollection } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { ExpenseChart } from './expense-chart';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (!date) return new Date();
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
    if (!isValid(date)) return "Invalid Date";
    return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
};

const toEthiopian = (date: Date) => {
    const parts = ethiopianDateFormatter(date, { year: 'numeric', month: 'numeric', day: 'numeric' }).split('/');
    return {
        month: parseInt(parts[0], 10),
        day: parseInt(parts[1], 10),
        year: parseInt(parts[2], 10)
    };
};

const toGregorian = (ethYear: number, ethMonth: number, ethDay: number): Date => {
    const today = new Date();
    const ethToday = toEthiopian(today);
    // This is a simplified conversion and might have inaccuracies.
    // For a production app, a robust library for calendar conversions would be better.
    const dayDiff = ((ethYear - ethToday.year) * 365.25) + ((ethMonth - ethToday.month) * 30) + (ethDay - ethToday.day);
    return addDays(today, Math.round(dayDiff));
};


export default function PayrollPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [monthOptions, setMonthOptions] = useState<{label: string, value: string}[]>([]);


  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef);
  
  useEffect(() => {
    const fetchAllAttendance = async () => {
        if (!firestore || !employees || employees.length === 0) {
          setAttendanceLoading(false);
          return;
        }

        setAttendanceLoading(true);
        const allRecords: AttendanceRecord[] = [];
        let date = new Date(employees.reduce((min, e) => !e.attendanceStartDate || new Date(e.attendanceStartDate) < min ? new Date(e.attendanceStartDate!) : min, new Date()));
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

        setAttendanceRecords(allRecords);
        setAttendanceLoading(false);
    };

    if (!employeesLoading) {
      fetchAllAttendance();
    }
  }, [firestore, employees, employeesLoading]);
  
  useEffect(() => {
    setTitle("Payroll Analytics");

    const today = new Date();
    const options = [];
    for(let i=0; i<12; i++){
        let ethDate = toEthiopian(today);
        let monthStartGregorian;

        if (i === 0) {
            monthStartGregorian = toGregorian(ethDate.year, ethDate.month, 1);
        } else {
            const prevMonth = ethDate.month - i;
            if (prevMonth > 0) {
                monthStartGregorian = toGregorian(ethDate.year, prevMonth, 1);
            } else {
                const yearOffset = Math.floor((i - ethDate.month) / 13) + 1;
                const month = 13 + ((prevMonth - 1) % 13);
                monthStartGregorian = toGregorian(ethDate.year - yearOffset, month, 1);
            }
        }
        
        const ethMonthInfo = toEthiopian(monthStartGregorian);
        const monthName = ethiopianDateFormatter(monthStartGregorian, { month: 'long' });

        options.push({
            value: monthStartGregorian.toISOString(),
            label: `${monthName} ${ethMonthInfo.year}`
        });
    }
    setMonthOptions(options);
  }, [setTitle]);

  const handleMonthSelect = (value: string) => {
    if (!value) return;
    setSelectedMonth(new Date(value));
  }
  
  if (employeesLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-8">
        <Card>
          <CardHeader>
              <CardTitle>Monthly Expense History</CardTitle>
              <CardDescription>Select an Ethiopian month to view the detailed expense breakdown.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                 <Select onValueChange={handleMonthSelect} defaultValue={selectedMonth.toISOString()}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a month" />
                    </SelectTrigger>
                    <SelectContent>
                        {monthOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="lg:col-span-2">
                <ExpenseChart 
                    employees={employees || []} 
                    attendanceRecords={attendanceRecords} 
                    selectedMonth={selectedMonth} 
                />
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
