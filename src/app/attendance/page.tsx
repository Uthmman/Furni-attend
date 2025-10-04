"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { employees, attendanceRecords as initialRecords } from "@/lib/data";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/types";
import { format } from "date-fns";

type DailyAttendance = {
    employeeId: string;
    employeeName: string;
    status: AttendanceStatus;
    morningEntry?: string;
    afternoonEntry?: string;
    overtimeHours?: number;
};


export default function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [attendance, setAttendance] = useState<DailyAttendance[]>(() => {
    return employees.map(emp => {
        const record = initialRecords.find(r => r.employeeId === emp.id && new Date(r.date).toDateString() === selectedDate.toDateString());
        return {
            employeeId: emp.id,
            employeeName: emp.name,
            status: record?.status || "Present",
            morningEntry: record?.morningEntry || "",
            afternoonEntry: record?.afternoonEntry || "",
            overtimeHours: record?.overtimeHours || 0
        }
    })
  });

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    // You might want to fetch and populate attendance for the new date here
     setAttendance(employees.map(emp => {
        const record = initialRecords.find(r => r.employeeId === emp.id && new Date(r.date).toDateString() === date.toDateString());
        return {
            employeeId: emp.id,
            employeeName: emp.name,
            status: record?.status || "Present",
            morningEntry: record?.morningEntry || "",
            afternoonEntry: record?.afternoonEntry || "",
            overtimeHours: record?.overtimeHours || 0
        }
    }));
  };
  
  const handleAttendanceChange = (employeeId: string, field: keyof DailyAttendance, value: string | number) => {
      setAttendance(prev => 
        prev.map(att => {
            if(att.employeeId === employeeId) {
                const updated = { ...att, [field]: value };
                if (field === 'status' && value === 'Absent') {
                    updated.morningEntry = "";
                    updated.afternoonEntry = "";
                    updated.overtimeHours = 0;
                }
                return updated;
            }
            return att;
        })
      );
  }

  const handleSaveChanges = () => {
    // Here you would typically save the attendance data to your backend.
    // For now, we'll just log it to the console.
    console.log("Saving attendance for", format(selectedDate, "yyyy-MM-dd"), attendance);
    alert("Attendance saved! (Check the console for data)");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Log Attendance"
        description="Select a date and fill in the attendance details for each employee."
      >
        <Button onClick={handleSaveChanges}>Save Attendance</Button>
      </PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Select Date</CardTitle>
                    <CardDescription>Pick a day to log attendance for.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                    />
                </CardContent>
            </Card>
        </div>
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Employee Attendance for {format(selectedDate, "MMMM dd, yyyy")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Morning</TableHead>
                                <TableHead>Afternoon</TableHead>
                                <TableHead>Overtime (hrs)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {attendance.map(att => (
                                <TableRow key={att.employeeId}>
                                    <TableCell className="font-medium">{att.employeeName}</TableCell>
                                    <TableCell>
                                        <Select value={att.status} onValueChange={(value) => handleAttendanceChange(att.employeeId, 'status', value)}>
                                            <SelectTrigger className="w-[100px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Present">Present</SelectItem>
                                                <SelectItem value="Late">Late</SelectItem>
                                                <SelectItem value="Absent">Absent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="time" 
                                            className="w-28"
                                            value={att.morningEntry}
                                            onChange={(e) => handleAttendanceChange(att.employeeId, 'morningEntry', e.target.value)}
                                            disabled={att.status === 'Absent'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="time" 
                                            className="w-28"
                                            value={att.afternoonEntry}
                                            onChange={(e) => handleAttendanceChange(att.employeeId, 'afternoonEntry', e.target.value)}
                                            disabled={att.status === 'Absent'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number" 
                                            className="w-20"
                                            min="0"
                                            value={att.overtimeHours}
                                            onChange={(e) => handleAttendanceChange(att.employeeId, 'overtimeHours', Number(e.target.value))}
                                            disabled={att.status === 'Absent'}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
