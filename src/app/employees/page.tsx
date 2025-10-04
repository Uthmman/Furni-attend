"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, Save } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { employees as initialEmployees, attendanceRecords as initialAttendanceRecords } from "@/lib/data";
import type { AttendanceStatus, Employee, AttendanceRecord } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { isSameDay } from "date-fns";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const getInitials = (name: string) => {
  const names = name.split(" ");
  return names
    .map((n) => n[0])
    .join("")
    .toUpperCase();
};

export default function EmployeesPage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(initialAttendanceRecords);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  const filteredAttendance = selectedDate 
    ? attendanceRecords.filter(record => isSameDay(new Date(record.date), selectedDate))
    : [];

  const handleAttendanceChange = (recordId: string, field: keyof AttendanceRecord, value: string) => {
    setAttendanceRecords(prev => prev.map(rec => {
        if (rec.id === recordId) {
            const updatedRecord = { ...rec, [field]: value };
            // if status is changed to Absent, clear times
            if (field === 'status' && value === 'Absent') {
                updatedRecord.morningEntry = undefined;
                updatedRecord.afternoonEntry = undefined;
            }
            return updatedRecord;
        }
        return rec;
    }));
  };

  const handleSaveChanges = () => {
    // Here you would typically save the changes to your backend.
    // For this demo, we'll just show a confirmation toast.
    toast({
        title: "Attendance Saved",
        description: "Your changes to the attendance records have been saved.",
    });
  }

  const getEmployeeForRecord = (employeeId: string): Employee | undefined => {
    return employees.find(e => e.id === employeeId);
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Manage employee details and track attendance."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </PageHeader>

      <Tabs defaultValue="employees">
        <TabsList className="mb-4">
          <TabsTrigger value="employees">All Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance Log</TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <Card>
            <CardHeader>
              <CardTitle>Employee Information</CardTitle>
              <CardDescription>Click on an employee to view their details.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {employees.map((employee) => (
                   <AccordionItem value={employee.id} key={employee.id}>
                    <AccordionTrigger>
                        <div className="flex items-center gap-3">
                           <Avatar>
                             <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                           </Avatar>
                           <span className="font-medium">{employee.name}</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="grid grid-cols-2 gap-4 px-4 py-2 text-sm">
                            <div>
                                <p className="font-semibold">Phone Number</p>
                                <p className="text-muted-foreground">{employee.phone}</p>
                            </div>
                             <div>
                                <p className="font-semibold">Payment Method</p>
                                <p className="text-muted-foreground">
                                    <Badge variant="outline">{employee.paymentMethod}</Badge>
                                </p>
                            </div>
                             <div>
                                <p className="font-semibold">Account Number</p>
                                <p className="text-muted-foreground">{employee.accountNumber}</p>
                            </div>
                        </div>
                    </AccordionContent>
                   </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attendance">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
                 <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    className="rounded-md border"
                  />
            </div>
            <div className="md:col-span-2">
                <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="grid gap-1">
                        <CardTitle>
                            Attendance for {selectedDate ? selectedDate.toLocaleDateString() : '...'}
                        </CardTitle>
                        <CardDescription>
                            Update employee attendance for the selected date.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={handleSaveChanges}>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                    </Button>
                </CardHeader>
                <CardContent>
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="w-[150px]">Status</TableHead>
                        <TableHead className="w-[120px]">Morning</TableHead>
                        <TableHead className="w-[120px]">Afternoon</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAttendance.length > 0 ? filteredAttendance.map(record => {
                           const employee = getEmployeeForRecord(record.employeeId);
                           const isAbsent = record.status === 'Absent';
                           return (
                            <TableRow key={record.id}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                      <Avatar className="h-8 w-8">
                                          <AvatarFallback>{employee ? getInitials(employee.name) : '?'}</AvatarFallback>
                                      </Avatar>
                                      {employee?.name || 'Unknown'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                    <Select
                                        value={record.status}
                                        onValueChange={(value) => handleAttendanceChange(record.id, 'status', value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select status" />
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
                                        value={record.morningEntry || ""}
                                        onChange={(e) => handleAttendanceChange(record.id, 'morningEntry', e.target.value)}
                                        disabled={isAbsent}
                                        className="w-full"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        type="time"
                                        value={record.afternoonEntry || ""}
                                        onChange={(e) => handleAttendanceChange(record.id, 'afternoonEntry', e.target.value)}
                                        disabled={isAbsent}
                                        className="w-full"
                                    />
                                </TableCell>
                            </TableRow>
                        )}) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                    No attendance records for this date.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>
            </div>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
