
'use client';

import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { type Employee, type AttendanceRecord } from '@/lib/types';
import { isWithinInterval, startOfMonth, endOfMonth, parse, format, isValid, eachDayOfInterval } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface ExpenseChartProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  selectedMonth: Date;
}

const calculateHoursWorked = (morningEntry?: string, afternoonEntry?: string): number => {
    if (!morningEntry || !afternoonEntry) return 0;
    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());
    const morningEntryTime = parse(morningEntry, "HH:mm", new Date());
    const afternoonEntryTime = parse(afternoonEntry, "HH:mm", new Date());
    let totalHours = 0;
    if(morningEntryTime < morningEndTime) totalHours += (morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime())) / (1000 * 60 * 60);
    if(afternoonEntryTime < afternoonEndTime) totalHours += (afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime())) / (1000 * 60 * 60);
    return Math.max(0, totalHours);
};

const getDateFromRecord = (date: string | Timestamp): Date => {
    if (date instanceof Timestamp) return date.toDate();
    return new Date(date);
};

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  if (!isValid(date)) return "Invalid Date";
  return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
};

export function ExpenseChart({ employees, attendanceRecords, selectedMonth }: ExpenseChartProps) {
  const chartData = useMemo(() => {
    if (!employees || !attendanceRecords) return { data: [], totals: { weekly: 0, monthly: 0, total: 0 } };

    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let totalMonthly = 0;
    let totalWeekly = 0;

    const data = daysInMonth.map(day => {
        let dailyWeeklyExpense = 0;
        let dailyMonthlyExpense = 0;

        employees.forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0) || (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
            if (!hourlyRate) return;

            const record = attendanceRecords.find(r => 
                r.employeeId === employee.id && 
                format(getDateFromRecord(r.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') &&
                (r.status === 'Present' || r.status === 'Late')
            );
            
            if (record) {
                const hoursWorked = calculateHoursWorked(record.morningEntry, record.afternoonEntry);
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
            name: format(day, 'd'),
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
                Expense Breakdown for {format(selectedMonth, 'MMMM yyyy')}
            </CardTitle>
            <CardDescription>
                Ethiopian equivalent: {ethiopianDateFormatter(selectedMonth, { month: 'long', year: 'numeric' })}
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
