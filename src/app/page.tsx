
'use client';

import { useEffect } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { employees, attendanceRecords } from "@/lib/data";
import { Users, Calendar as CalendarIcon } from "lucide-react";
import Link from 'next/link';
import {
  isWithinInterval,
  addDays,
  parse,
  endOfMonth,
  getDay,
} from "date-fns";

type PayrollEntry = {
  employeeId: string;
  employeeName: string;
  paymentMethod: "Weekly" | "Monthly";
  period: string;
  amount: number;
  status: "Paid" | "Unpaid";
  workingDays: number;
};

const calculateHoursWorked = (morningEntry?: string, afternoonEntry?: string): number => {
    if (!morningEntry || !afternoonEntry) return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    const morningEntryTime = parse(morningEntry, "HH:mm", new Date());
    const afternoonEntryTime = parse(afternoonEntry, "HH:mm", new Date());
    
    let totalHours = 0;

    if(morningEntryTime < morningEndTime) {
        const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
        totalHours += morningWorkMs / (1000 * 60 * 60);
    }
    
    if(afternoonEntryTime < afternoonEndTime) {
        const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
        totalHours += afternoonWorkMs / (1000 * 60 * 60);
    }

    return Math.max(0, totalHours);
};

const calculateRecentPayroll = (): PayrollEntry[] => {
  const payroll: PayrollEntry[] = [];
  const today = new Date();
  
  const ethiopianDateFormatter = new Intl.DateTimeFormat('en-US-u-ca-ethiopic', {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const twoDaysFromNow = addDays(today, 2);

  employees.forEach((employee) => {
    const hourlyRate = employee.hourlyRate || 
      (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
      (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);

    if (!hourlyRate) return;

    if (employee.paymentMethod === "Weekly") {
      const isPaymentDayApproaching = isWithinInterval(addDays(today, 2), { start: today, end: addDays(today, 2) }) && getDay(addDays(today,2)) === 6;

      if (isPaymentDayApproaching) {
        const weekStart = addDays(today, -getDay(today));
        const weekEnd = addDays(weekStart, 6);
        const weekPeriod = { start: weekStart, end: weekEnd };

         const relevantRecords = attendanceRecords.filter(
            (record) =>
              record.employeeId === employee.id &&
              (record.status === "Present" || record.status === "Late") &&
              isWithinInterval(new Date(record.date), weekPeriod)
          );
          
          let totalHours = 0;
          relevantRecords.forEach(record => {
              totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
          });

          if (totalHours > 0) {
            payroll.push({
              employeeId: employee.id,
              employeeName: employee.name,
              paymentMethod: "Weekly",
              period: `${ethiopianDateFormatter.format(weekPeriod.start)} - ${ethiopianDateFormatter.format(weekPeriod.end)}`,
              amount: totalHours * hourlyRate,
              status: "Unpaid",
              workingDays: relevantRecords.length,
            });
          }
      }
    } else if (employee.paymentMethod === "Monthly") {
        const endOfMonthDate = endOfMonth(today);
        const isEndOfMonth = isWithinInterval(endOfMonthDate, { start: today, end: twoDaysFromNow });

        if(isEndOfMonth) {
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            const monthPeriod = { start: monthStart, end: endOfMonthDate };
            const relevantRecords = attendanceRecords.filter(
                (record) =>
                record.employeeId === employee.id &&
                (record.status === "Present" || record.status === "Late") &&
                isWithinInterval(new Date(record.date), monthPeriod)
            );

            let totalHours = 0;
            relevantRecords.forEach(record => {
                totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
            });

            if(totalHours > 0) {
                 payroll.push({
                    employeeId: employee.id,
                    employeeName: employee.name,
                    paymentMethod: "Monthly",
                    period: new Intl.DateTimeFormat('en-US-u-ca-ethiopic', { year: 'numeric', month: 'long' }).format(monthPeriod.start),
                    amount: totalHours * hourlyRate,
                    status: "Unpaid",
                    workingDays: relevantRecords.length,
                });
            }
        }
    }
  });

  return payroll.filter((p) => p.amount > 0);
};

export default function DashboardPage() {
  const { setTitle } = usePageTitle();
  const totalEmployees = employees.length;
  
  const recentPayroll = calculateRecentPayroll();
  
  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  const today = new Date();
  const ethiopianDay = new Intl.DateTimeFormat('en-US-u-ca-ethiopic', { day: 'numeric' }).format(today);
  const ethiopianMonth = new Intl.DateTimeFormat('en-US-u-ca-ethiopic', { month: 'long' }).format(today);
  const ethiopianYear = new Intl.DateTimeFormat('en-US-u-ca-ethiopic', { year: 'numeric' }).format(today).replace(' ERA1', '');


  return (
    <div className="flex flex-col gap-8">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2">
            <CardContent className="flex items-center justify-center p-6 text-center">
                <div className="flex items-baseline gap-4">
                    <span className="text-8xl font-bold text-primary">{ethiopianDay}</span>
                    <div className="flex flex-col items-start">
                        <span className="text-4xl font-semibold">{ethiopianMonth}</span>
                        <span className="text-2xl text-muted-foreground">{ethiopianYear}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
        <Link href="/employees" className="hover:shadow-lg transition-shadow rounded-xl">
            <StatCard
            title="Total Employees"
            value={totalEmployees}
            icon={<Users className="size-5 text-muted-foreground" />}
            />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {recentPayroll.length > 0 && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Upcoming Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Days Worked</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayroll.map((entry) => (
                    <TableRow key={`${entry.employeeId}-${entry.period}`}>
                      <TableCell>
                        <div className="font-medium">{entry.employeeName}</div>
                        <div className="text-sm text-muted-foreground">
                          {entry.paymentMethod}
                        </div>
                      </TableCell>
                      <TableCell>{entry.workingDays}</TableCell>
                      <TableCell>ETB {entry.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.status === "Paid" ? "default" : "destructive"
                          }
                        >
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
