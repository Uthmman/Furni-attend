
"use client";

import { useMemo, useEffect } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { CircleDollarSign, Calendar, History } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parse,
  eachMonthOfInterval,
  subMonths,
  eachWeekOfInterval,
  subWeeks,
} from "date-fns";
import type { Timestamp } from "firebase/firestore";
import type { PayrollEntry, Employee, AttendanceRecord } from "@/lib/types";
import Link from 'next/link';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';

const calculateHoursWorked = (
  morningEntry?: string,
  afternoonEntry?: string
): number => {
  if (!morningEntry || !afternoonEntry) return 0;

  const morningStartTime = parse("08:00", "HH:mm", new Date());
  const morningEndTime = parse("12:30", "HH:mm", new Date());
  const afternoonStartTime = parse("13:30", "HH:mm", new Date());
  const afternoonEndTime = parse("17:00", "HH:mm", new Date());

  const morningEntryTime = parse(morningEntry, "HH:mm", new Date());
  const afternoonEntryTime = parse(afternoonEntry, "HH:mm", new Date());

  let totalHours = 0;

  if (morningEntryTime < morningEndTime) {
    const morningWorkMs =
      morningEndTime.getTime() -
      Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
    totalHours += morningWorkMs / (1000 * 60 * 60);
  }

  if (afternoonEntryTime < afternoonEndTime) {
    const afternoonWorkMs =
      afternoonEndTime.getTime() -
      Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
    totalHours += afternoonWorkMs / (1000 * 60 * 60);
  }

  return Math.max(0, totalHours);
};


const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
    return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
};

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}

export default function PayrollPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef);
  
  const attendanceCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance');
  }, [firestore, user]);
  
  const { data: attendanceRecords, loading: attendanceLoading } = useCollection(attendanceCollectionRef);


  const payrollData = useMemo((): PayrollEntry[] => {
    if (!employees || !attendanceRecords) return [];
    const payroll: PayrollEntry[] = [];
    const today = new Date();

    const currentWeek = {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 }),
    };
    const currentMonth = {
      start: startOfMonth(today),
      end: endOfMonth(today),
    };

    employees.forEach((employee) => {
      const hourlyRate =
        employee.hourlyRate ||
        (employee.dailyRate ? employee.dailyRate / 8 : 0) ||
        (employee.monthlyRate ? employee.monthlyRate / 22 / 8 : 0);

      if (!hourlyRate) return;

      if (employee.paymentMethod === "Weekly") {
        const relevantRecords = attendanceRecords.filter(
          (record) =>
            record.employeeId === employee.id &&
            (record.status === "Present" || record.status === "Late") &&
            isWithinInterval(getDateFromRecord(record.date), currentWeek)
        );

        const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
        const totalAmount = (totalHours + totalOvertime) * hourlyRate;

        if (totalAmount > 0) {
          payroll.push({
            employeeId: employee.id,
            employeeName: employee.name,
            paymentMethod: "Weekly",
            period: `${ethiopianDateFormatter(currentWeek.start, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(currentWeek.end, { day: 'numeric', month: 'short', year: 'numeric' })}`,
            amount: totalAmount,
            status: "Unpaid",
          });
        }
      } else if (employee.paymentMethod === "Monthly") {
        const relevantRecords = attendanceRecords.filter(
          (record) =>
            record.employeeId === employee.id &&
            (record.status === "Present" || record.status === "Late") &&
            isWithinInterval(getDateFromRecord(record.date), currentMonth)
        );

        const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
        const totalAmount = (totalHours + totalOvertime) * hourlyRate;

        if (totalAmount > 0) {
          payroll.push({
            employeeId: employee.id,
            employeeName: employee.name,
            paymentMethod: "Monthly",
            period: ethiopianDateFormatter(currentMonth.start, { year: "numeric", month: "long" }),
            amount: totalAmount,
            status: "Unpaid",
          });
        }
      }
    });

    return payroll.filter((p) => p.amount > 0);
  }, [employees, attendanceRecords]);

  const { monthlyHistory, weeklyHistory } = useMemo(() => {
    const monthlyHistory: { period: string, totalAmount: number }[] = [];
    const weeklyHistory: { period: string, totalAmount: number }[] = [];

    if (!employees || !attendanceRecords || attendanceRecords.length === 0) return { monthlyHistory, weeklyHistory };

    const firstRecordDate = attendanceRecords.reduce((earliest, current) => 
        getDateFromRecord(current.date) < getDateFromRecord(earliest.date) ? current : earliest
    ).date;
    
    // Monthly History
    const months = eachMonthOfInterval({
        start: startOfMonth(getDateFromRecord(firstRecordDate)),
        end: subMonths(new Date(), 1)
    });

    months.reverse().forEach(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const period = { start: monthStart, end: monthEnd };
        
        let monthTotal = 0;
        employees.filter(e => e.paymentMethod === 'Monthly').forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.monthlyRate ? employee.monthlyRate / 22 / 8 : 0);
            if(!hourlyRate) return;

            const relevantRecords = attendanceRecords.filter(r =>
                r.employeeId === employee.id &&
                (r.status === "Present" || r.status === "Late") &&
                isWithinInterval(getDateFromRecord(r.date), period)
            );
            
            const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
            const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
            monthTotal += (totalHours + totalOvertime) * hourlyRate;
        });

        if (monthTotal > 0) {
            monthlyHistory.push({
                period: ethiopianDateFormatter(monthStart, { month: 'long', year: 'numeric' }),
                totalAmount: monthTotal
            });
        }
    });

    // Weekly History
    const weeks = eachWeekOfInterval({
        start: startOfWeek(getDateFromRecord(firstRecordDate), { weekStartsOn: 1 }),
        end: subWeeks(new Date(), 1)
    }, { weekStartsOn: 1 });

    weeks.reverse().forEach(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const period = { start: weekStart, end: weekEnd };

        let weekTotal = 0;
        employees.filter(e => e.paymentMethod === 'Weekly').forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
             if(!hourlyRate) return;

            const relevantRecords = attendanceRecords.filter(r =>
                r.employeeId === employee.id &&
                (r.status === "Present" || r.status === "Late") &&
                isWithinInterval(getDateFromRecord(r.date), period)
            );

            const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
            const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
            weekTotal += (totalHours + totalOvertime) * hourlyRate;
        });

        if (weekTotal > 0) {
            weeklyHistory.push({
                period: `${ethiopianDateFormatter(weekStart, {day: 'numeric', month: 'short'})} - ${ethiopianDateFormatter(weekEnd, {day: 'numeric', month: 'short', year: 'numeric'})}`,
                totalAmount: weekTotal
            });
        }
    });

    return { monthlyHistory, weeklyHistory };
  }, [employees, attendanceRecords]);

  useEffect(() => {
    setTitle("Payroll");
  }, [setTitle]);
  
  if (employeesLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-8">
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Upcoming Payments</h2>
                <Button variant="secondary">
                <CircleDollarSign className="mr-2 h-4 w-4" />
                Process All Payments
                </Button>
            </div>

            {payrollData.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                {payrollData.map((entry) => (
                    <Link key={`${entry.employeeId}-${entry.period}`} href={`/employees/${entry.employeeId}`} className="block hover:shadow-lg transition-shadow rounded-xl">
                    <Card className="flex flex-col h-full w-full">
                        <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                            <CardTitle>{entry.employeeName}</CardTitle>
                            <div className="text-sm text-muted-foreground mt-1">
                                <Badge variant="outline">{entry.paymentMethod}</Badge>
                            </div>
                            </div>
                            <Badge
                            variant={
                                entry.status === "Paid" ? "secondary" : "destructive"
                            }
                            className="capitalize"
                            >
                            {entry.status}
                            </Badge>
                        </div>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <div className="text-sm text-muted-foreground space-y-2">
                                <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>{entry.period}</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col items-start gap-2 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">Amount Due</p>
                        <p className="text-2xl font-bold text-primary">ETB {entry.amount.toFixed(2)}</p>
                        </CardFooter>
                    </Card>
                    </Link>
                ))}
                </div>
            ) : (
                <div className="flex justify-center items-center h-48 border-2 border-dashed rounded-lg">
                <div className="text-center text-muted-foreground">
                    <CircleDollarSign className="mx-auto h-12 w-12" />
                    <p className="mt-4">No upcoming payroll for the current period.</p>
                </div>
                </div>
            )}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
                <CardHeader>
                    <CardTitle>Monthly Payroll History</CardTitle>
                    <CardDescription>Summary of total monthly payments.</CardDescription>
                </CardHeader>
                <CardContent>
                    {monthlyHistory.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Total Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthlyHistory.map((item) => (
                                    <TableRow key={item.period}>
                                        <TableCell className="font-medium">{item.period}</TableCell>
                                        <TableCell className="text-right font-mono">ETB {item.totalAmount.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                         <div className="flex justify-center items-center h-48">
                            <div className="text-center text-muted-foreground">
                                <History className="mx-auto h-12 w-12" />
                                <p className="mt-4">No monthly payroll history available.</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Weekly Payroll History</CardTitle>
                     <CardDescription>Summary of total weekly payments.</CardDescription>
                </CardHeader>
                <CardContent>
                    {weeklyHistory.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Total Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {weeklyHistory.map((item) => (
                                    <TableRow key={item.period}>
                                        <TableCell className="font-medium">{item.period}</TableCell>
                                        <TableCell className="text-right font-mono">ETB {item.totalAmount.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                         <div className="flex justify-center items-center h-48">
                            <div className="text-center text-muted-foreground">
                                <History className="mx-auto h-12 w-12" />
                                <p className="mt-4">No weekly payroll history available.</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
