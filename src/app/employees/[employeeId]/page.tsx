
"use client";

import { useParams } from "next/navigation";
import { employees, attendanceRecords } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  parse,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isValid,
} from "date-fns";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Employee } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Copy, Phone } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

const getInitials = (name: string) => {
  const names = name.split(" ");
  return names.map((n) => n[0]).join("").toUpperCase();
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


export default function EmployeeProfilePage() {
  const params = useParams();
  const { employeeId } = params;
  const [_copiedValue, copy] = useCopyToClipboard();

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);

  const employee = employees.find((e) => e.id === employeeId);
  const employeeAttendance = useMemo(() => 
    attendanceRecords.filter((r) => r.employeeId === employeeId),
    [employeeId]
  );
  
  const hourlyRate = useMemo(() => {
    if (!employee) return 0;
    return employee.hourlyRate ||
        (employee.dailyRate ? employee.dailyRate / 8 : 0) ||
        (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
  }, [employee]);

  const firstAttendanceDate = useMemo(() => {
    if (employeeAttendance.length === 0) return new Date();
    const earliestRecord = employeeAttendance.reduce((earliest, current) => {
      const currentDate = new Date(current.date);
      return currentDate < new Date(earliest.date) ? current : earliest;
    });
    return new Date(earliestRecord.date);
  }, [employeeAttendance]);

  const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
    if (!isValid(date)) return "Invalid Date";
    try {
        return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
    } catch (e) {
        return "Invalid Date";
    }
  };

  const periodOptions = useMemo(() => {
    if (!employee || !isValid(firstAttendanceDate)) return [];
    
    const today = new Date();
    const interval = { start: firstAttendanceDate, end: today };
    const options: { value: string, label: string }[] = [];

    if (employee.paymentMethod === 'Monthly') {
      const months = eachMonthOfInterval(interval);
      months.reverse().forEach(monthStart => {
        const period = { start: startOfMonth(monthStart), end: endOfMonth(monthStart) };
        options.push({
          value: period.start.toISOString(),
          label: ethiopianDateFormatter(period.start, { month: 'long', year: 'numeric' })
        });
      });
    } else { // Weekly
      const weeks = eachWeekOfInterval(interval, { weekStartsOn: 1 });
      weeks.reverse().forEach(weekStart => {
        const period = { start: startOfWeek(weekStart, { weekStartsOn: 1 }), end: endOfWeek(weekStart, { weekStartsOn: 1 }) };
        const startDay = ethiopianDateFormatter(period.start, { day: 'numeric', month: 'long' });
        const endDay = ethiopianDateFormatter(period.end, { day: 'numeric', month: 'long', year: 'numeric' });
        options.push({
          value: period.start.toISOString(),
          label: `${startDay} - ${endDay}`
        });
      });
    }
    return options;
  }, [employee, firstAttendanceDate]);

  
  const filteredAttendance = useMemo(() => {
    if (!selectedPeriod || !employee) return [];
    
    const startDate = new Date(selectedPeriod);
    let interval;
    if (employee.paymentMethod === 'Weekly') {
      interval = { start: startOfWeek(startDate, { weekStartsOn: 1 }), end: endOfWeek(startDate, { weekStartsOn: 1 }) };
    } else { // monthly
      interval = { start: startOfMonth(startDate), end: endOfMonth(startDate) };
    }
    return employeeAttendance.filter(r => isWithinInterval(new Date(r.date), interval));
  }, [employeeAttendance, selectedPeriod, employee]);

  const payrollData = useMemo(() => {
    if (!employee) return { hours: 0, amount: 0, daysWorked: 0, overtimePay: 0, totalAmount: 0 };

    const relevantRecords = filteredAttendance.filter(
      (record) => record.status === "Present" || record.status === "Late"
    );

    const totalHours = relevantRecords.reduce((acc, record) => {
      return acc + calculateHoursWorked(record.morningEntry, record.afternoonEntry);
    }, 0);
    
    const totalOvertimeHours = relevantRecords.reduce((acc, record) => {
        return acc + (record.overtimeHours || 0);
    }, 0);

    const baseAmount = totalHours * (hourlyRate || 0);
    const overtimePay = totalOvertimeHours * (hourlyRate || 0);
    const totalAmount = baseAmount + overtimePay;

    return {
      hours: totalHours,
      amount: baseAmount,
      daysWorked: totalHours / 8,
      overtimePay: overtimePay,
      totalAmount: totalAmount
    };
  }, [employee, filteredAttendance, hourlyRate]);
  
  const formatPeriod = (periodValue: string | undefined, employee: Employee) => {
      if (!periodValue) return "N/A";
      const startDate = new Date(periodValue);
       if (employee.paymentMethod === 'Weekly') {
          const start = startOfWeek(startDate, { weekStartsOn: 1 });
          const end = endOfWeek(startDate, { weekStartsOn: 1 });
          return `${ethiopianDateFormatter(start, { day: 'numeric', month: 'long' })} - ${ethiopianDateFormatter(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
      }
      return ethiopianDateFormatter(startDate, { month: 'long', year: 'numeric' });
  }

  if (!employee) {
    return (
      <div>
        <PageHeader title="Employee Not Found" />
        <p>The requested employee could not be found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={employee.name} description={employee.position || `Profile and attendance for ${employee.name}`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 flex flex-col gap-6">
          <Card>
            <CardHeader className="items-center">
              <Avatar className="w-24 h-24 text-3xl">
                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
              </Avatar>
              <CardTitle className="pt-4">{employee.name}</CardTitle>
              <CardDescription>{employee.position}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
                <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">Phone Number</p>
                        <Button variant="ghost" size="sm" asChild>
                            <a href={`tel:${employee.phone}`}>
                                <Phone className="mr-2 h-4 w-4" />
                                {employee.phone}
                            </a>
                        </Button>
                    </div>
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">Account Number</p>
                        <div className="flex items-center gap-2">
                           <p className="text-muted-foreground">{employee.accountNumber}</p>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(employee.accountNumber)}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div>
                        <p className="font-semibold">Payment Method</p>
                        <Badge variant="outline">{employee.paymentMethod}</Badge>
                    </div>
                    <div>
                        <p className="font-semibold">{employee.paymentMethod} Rate</p>
                        <p className="text-muted-foreground">ETB {employee.monthlyRate || employee.dailyRate || "N/A"}</p>
                    </div>
                    <div>
                        <p className="font-semibold">Calculated Hourly Rate</p>
                        <p className="text-muted-foreground">ETB {hourlyRate.toFixed(2)}</p>
                    </div>
                </div>
            </CardContent>
          </Card>
          
           <Card>
                <CardHeader>
                    <CardTitle>Payroll Summary</CardTitle>
                    <CardDescription>
                        For {formatPeriod(selectedPeriod, employee)}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                     <div>
                        <p className="font-semibold">Total Days Worked</p>
                        <p className="text-2xl font-bold">{payrollData.daysWorked.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="font-semibold">Total Hours Worked</p>
                        <p className="text-2xl font-bold">{payrollData.hours.toFixed(2)}</p>
                    </div>
                    {payrollData.overtimePay > 0 && (
                        <div>
                            <p className="font-semibold">Overtime Pay</p>
                            <p className="text-2xl font-bold">ETB {payrollData.overtimePay.toFixed(2)}</p>
                        </div>
                    )}
                    <div>
                        <p className="font-semibold">Calculated Payroll</p>
                        <p className="text-2xl font-bold text-primary">ETB {payrollData.totalAmount.toFixed(2)}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendance History</CardTitle>
              <CardDescription>Select a pay period to view attendance.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
               <div className="flex flex-col gap-4">
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger>
                          <SelectValue placeholder="Select a period" />
                      </SelectTrigger>
                      <SelectContent>
                          {periodOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
               </div>
              <div className="flex-1 mt-4">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Morning</TableHead>
                        <TableHead>Afternoon</TableHead>
                        <TableHead>Overtime</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredAttendance.length > 0 ? (
                        filteredAttendance.map((record) => (
                        <TableRow key={record.id}>
                            <TableCell>{ethiopianDateFormatter(new Date(record.date), { weekday: 'short', day: 'numeric' })}</TableCell>
                            <TableCell>
                            <Badge variant={record.status === 'Absent' ? 'destructive' : 'secondary'}>
                                {record.status}
                            </Badge>
                            </TableCell>
                            <TableCell>{record.morningEntry || "N/A"}</TableCell>
                            <TableCell>{record.afternoonEntry || "N/A"}</TableCell>
                            <TableCell>{record.overtimeHours ? `${record.overtimeHours} hr(s)` : "N/A"}</TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={5} className="text-center h-24">
                            {selectedPeriod ? "No attendance records for this period." : "Please select a period to view records."}
                        </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

    

    

    