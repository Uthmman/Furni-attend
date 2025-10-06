
"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CircleDollarSign } from "lucide-react";
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
import {
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parse,
} from "date-fns";
import type { PayrollEntry } from "@/lib/types";
import Link from 'next/link';
import { useMemo } from 'react';

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


const calculateUpcomingPayroll = (): PayrollEntry[] => {
  const payroll: PayrollEntry[] = [];
  const today = new Date();

  const ethiopianDateFormatter = new Intl.DateTimeFormat(
    "en-US-u-ca-ethiopic",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

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
      (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);

    if (!hourlyRate) return;

    if (employee.paymentMethod === "Weekly") {
      const relevantRecords = attendanceRecords.filter(
        (record) =>
          record.employeeId === employee.id &&
          (record.status === "Present" || record.status === "Late") &&
          isWithinInterval(new Date(record.date), currentWeek)
      );

      const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
      const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
      const totalAmount = (totalHours + totalOvertime) * hourlyRate;

      if (totalAmount > 0) {
        payroll.push({
          employeeId: employee.id,
          employeeName: employee.name,
          paymentMethod: "Weekly",
          period: `${ethiopianDateFormatter.format(
            currentWeek.start
          )} - ${ethiopianDateFormatter.format(currentWeek.end)}`,
          amount: totalAmount,
          status: "Unpaid",
        });
      }
    } else if (employee.paymentMethod === "Monthly") {
      const relevantRecords = attendanceRecords.filter(
        (record) =>
          record.employeeId === employee.id &&
          (record.status === "Present" || record.status === "Late") &&
          isWithinInterval(new Date(record.date), currentMonth)
      );

      const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
      const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
      const totalAmount = (totalHours + totalOvertime) * hourlyRate;

      if (totalAmount > 0) {
        payroll.push({
          employeeId: employee.id,
          employeeName: employee.name,
          paymentMethod: "Monthly",
          period: new Intl.DateTimeFormat("en-US-u-ca-ethiopic", {
            year: "numeric",
            month: "long",
          }).format(currentMonth.start),
          amount: totalAmount,
          status: "Unpaid",
        });
      }
    }
  });

  return payroll.filter((p) => p.amount > 0);
};

export default function PayrollPage() {
  const payrollData = useMemo(() => calculateUpcomingPayroll(), []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="Calculate and process employee payments for the current period."
      >
        <Button variant="secondary">
          <CircleDollarSign className="mr-2 h-4 w-4" />
          Process All Payments
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Payment Period</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollData.length > 0 ? (
                payrollData.map((entry) => (
                <TableRow key={`${entry.employeeId}-${entry.period}`}>
                  <TableCell>
                     <Link href={`/employees/${entry.employeeId}`} className="font-medium hover:underline">
                        {entry.employeeName}
                     </Link>
                  </TableCell>
                  <TableCell>{entry.period}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.paymentMethod}</Badge>
                  </TableCell>
                  <TableCell>ETB {entry.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.status === "Paid" ? "secondary" : "destructive"
                      }
                      className="capitalize"
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No upcoming payroll for the current period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
