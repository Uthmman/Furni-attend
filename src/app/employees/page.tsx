import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, UserCheck, UserX } from "lucide-react";
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
import type { AttendanceStatus, Employee } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const getInitials = (name: string) => {
  const names = name.split(" ");
  return names
    .map((n) => n[0])
    .join("")
    .toUpperCase();
};

const getAttendanceStatusVariant = (status: AttendanceStatus) => {
  switch (status) {
    case "Present":
      return "default";
    case "Late":
      return "secondary";
    case "Absent":
      return "destructive";
  }
};

const getAttendanceStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case "Present":
      case "Late":
        return <UserCheck className="h-4 w-4 text-green-500" />;
      case "Absent":
        return <UserX className="h-4 w-4 text-red-500" />;
    }
}

export default function EmployeesPage() {

  const getEmployeeName = (employeeId: string) => {
    return employees.find(e => e.id === employeeId)?.name || 'Unknown';
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
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Account Number</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium flex items-center gap-3">
                         <Avatar>
                           <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                         </Avatar>
                         {employee.name}
                      </TableCell>
                      <TableCell>{employee.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{employee.paymentMethod}</Badge>
                      </TableCell>
                      <TableCell>{employee.accountNumber}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attendance">
           <Card>
            <CardHeader>
              <CardTitle>Daily Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Morning Entry</TableHead>
                    <TableHead>Afternoon Entry</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {attendanceRecords.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => (
                        <TableRow key={record.id}>
                            <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                            <TableCell>{getEmployeeName(record.employeeId)}</TableCell>
                            <TableCell>{record.morningEntry || 'N/A'}</TableCell>
                            <TableCell>{record.afternoonEntry || 'N/A'}</TableCell>
                            <TableCell>
                                <Badge variant={getAttendanceStatusVariant(record.status)} className="flex items-center gap-2">
                                    {getAttendanceStatusIcon(record.status)}
                                    {record.status}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
