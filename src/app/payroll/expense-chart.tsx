
'use client';

import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { type Employee, type AttendanceRecord } from '@/lib/types';
import { isWithinInterval, parse, format, isValid, eachDayOfInterval, addDays } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface ExpenseChartProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  selectedMonth: Date;
}

const getDateFromRecord = (date: string | Timestamp): Date => {
    if (date instanceof Timestamp) return date.toDate();
    return new Date(date);
};

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

const getEthiopianMonthDays = (year: number, month: number): number => {
    if (month < 1 || month > 13) return 0;
    if (month <= 12) return 30;
    const isLeap = (year + 1) % 4 === 0;
    return isLeap ? 6 : 5;
};

export function ExpenseChart({ employees, attendanceRecords, selectedMonth }: ExpenseChartProps) {
  const chartData = useMemo(() => {
    if (!employees || !attendanceRecords) return { data: [], totals: { weekly: 0, monthly: 0, total: 0 } };

    const ethSelected = toEthiopian(selectedMonth);
    const monthStart = selectedMonth;
    const daysInMonthCount = getEthiopianMonthDays(ethSelected.year, ethSelected.month);
    const monthEnd = addDays(monthStart, daysInMonthCount - 1);

    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let totalMonthly = 0;
    let totalWeekly = 0;

    const data = daysInMonth.map(day => {
        let dailyWeeklyExpense = 0;
        let dailyMonthlyExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0) || (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
            if (!hourlyRate) return;

            const record = attendanceRecords.find(r => 
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
        
        totalWeekly += dailyWeeklyExpense;
        totalMonthly += dailyMonthlyExpense;

        return {
            name: toEthiopian(day).day.toString(),
            weekly: dailyWeeklyExpense,
            monthly: dailyMonthlyExpense
        };
    });

    return {
        data,
        totals: {
            weekly: totalWeekly,
            monthly: totalMonthly,
            total: totalWeekly + totalMonthly
        }
    };
  }, [employees, attendanceRecords, selectedMonth]);

  return (
    <Card>
        <CardHeader>
            <CardTitle>
                Expense Breakdown for {ethiopianDateFormatter(selectedMonth, {month: 'long', year: 'numeric'})}
            </CardTitle>
            <CardDescription>
                Gregorian equivalent: {format(selectedMonth, 'MMMM yyyy')}
            </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.data}>
                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `ETB ${value}`} />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--background))",
                            borderColor: "hsl(var(--border))",
                        }}
                    />
                    <Legend />
                    <Bar dataKey="weekly" name="Weekly" fill="var(--color-weekly)" stackId="a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="monthly" name="Monthly" fill="var(--color-monthly)" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
                </ResponsiveContainer>
            </div>
             <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                    <p className="text-sm text-muted-foreground">Weekly Total</p>
                    <p className="font-bold text-lg">ETB {chartData.totals.weekly.toFixed(2)}</p>
                </div>
                 <div>
                    <p className="text-sm text-muted-foreground">Monthly Total</p>
                    <p className="font-bold text-lg">ETB {chartData.totals.monthly.toFixed(2)}</p>
                </div>
                 <div>
                    <p className="text-sm font-bold text-primary">Overall Total</p>
                    <p className="font-bold text-lg text-primary">ETB {chartData.totals.total.toFixed(2)}</p>
                </div>
            </div>
        </CardContent>
        <style jsx>{`
            :root {
                --color-weekly: hsl(var(--chart-1));
                --color-monthly: hsl(var(--chart-2));
            }
        `}</style>
    </Card>
  );
}

    