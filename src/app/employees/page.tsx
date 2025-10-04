"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import {
  employees as initialEmployees,
  attendanceRecords as initialAttendanceRecords,
} from "@/lib/data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeList } from "./employee-list";
import { AttendanceTracker } from "./attendance-tracker";

export default function EmployeesPage() {
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
          <EmployeeList employees={initialEmployees} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTracker
            employees={initialEmployees}
            initialRecords={initialAttendanceRecords}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
