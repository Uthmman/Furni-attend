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
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parse } from "date-fns";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  const employee = employees.find((e) => e.id === employeeId);
  const employeeAttendance = useMemo(() => 
    attendanceRecords.filter((r) => r.employeeId === employeeId),
    [employeeId]
  );
  
  const [filter, setFilter] = useState('all');

  const filteredAttendance = useMemo(() => {
    const now = new Date();
    if (filter === 'weekly') {
        const start = startOfWeek(now, { weekStartsOn: 1 });
        const end = endOfWeek(now, { weekStartsOn: 1 });
        return employeeAttendance.filter(r => isWithinInterval(new Date(r.date), {start, end}));
    }
    if (filter === 'monthly') {
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        return employeeAttendance.filter(r => isWithinInterval(new Date(r.date), {start, end}));
    }
    return employeeAttendance;
  }, [employeeAttendance, filter]);

  const payrollData = useMemo(() => {
      if (!employee) return { hours: 0, amount: 0 };
      
      const relevantRecords = filteredAttendance.filter(
          (record) => record.status === "Present" || record.status === "Late"
      );

      const totalHours = relevantRecords.reduce((acc, record) => {
          return acc + calculateHoursWorked(record.morningEntry, record.afternoonEntry);
      }, 0);

      const hourlyRate =
        employee.hourlyRate ||
        (employee.dailyRate ? employee.dailyRate / 8 : 0) ||
        (employee.monthlyRate ? employee.monthlyRate / 22 / 8 : 0);
        
      const amount = totalHours * (hourlyRate || 0);

      return {
          hours: totalHours,
          amount: amount
      }
  }, [employee, filteredAttendance]);


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
      <PageHeader title={employee.name} description={`Profile and attendance for ${employee.name}`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 flex flex-col gap-6">
          <Card>
            <CardHeader className="items-center">
              <Avatar className="w-24 h-24 text-3xl">
                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
              </Avatar>
              <CardTitle className="pt-4">{employee.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
                <div className="grid gap-2">
                    <div>
                        <p className="font-semibold">Phone Number</p>
                        <p className="text-muted-foreground">{employee.phone}</p>
                    </div>
                     <div>
                        <p className="font-semibold">Payment Method</p>
                        <Badge variant="outline">{employee.paymentMethod}</Badge>
                    </div>
                    <div>
                        <p className="font-semibold">Account Number</p>
                        <p className="text-muted-foreground">{employee.accountNumber}</p>
                    </div>
                </div>
            </CardContent>
          </Card>
          {(filter === 'weekly' || filter === 'monthly') && (
            <Card>
                <CardHeader>
                    <CardTitle>Payroll Summary</CardTitle>
                    <CardDescription>
                        Calculated for the selected period.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div>
                        <p className="font-semibold">Total Hours Worked</p>
                        <p className="text-2xl font-bold">{payrollData.hours.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="font-semibold">Calculated Payroll</p>
                        <p className="text-2xl font-bold text-primary">ETB {payrollData.amount.toFixed(2)}</p>
                    </div>
                </CardContent>
            </Card>
          )}
        </div>
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendance History</CardTitle>
              <CardDescription>A log of the employee's attendance.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex justify-end mb-4">
                    <Select value={filter} onValueChange={setFilter}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by date" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Time</SelectItem>
                            <SelectItem value="weekly">This Week</SelectItem>
                            <SelectItem value="monthly">This Month</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Morning</TableHead>
                    <TableHead>Afternoon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendance.length > 0 ? (
                    filteredAttendance.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{format(new Date(record.date), "PPP")}</TableCell>
                        <TableCell>
                          <Badge variant={record.status === 'Absent' ? 'destructive' : 'secondary'}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.morningEntry || "N/A"}</TableCell>
                        <TableCell>{record.afternoonEntry || "N/A"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-24">
                        No attendance records for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
