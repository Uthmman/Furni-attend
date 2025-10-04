import type { Employee } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight } from "lucide-react";

const getInitials = (name: string) => {
  const names = name.split(" ");
  return names
    .map((n) => n[0])
    .join("")
    .toUpperCase();
};

export function EmployeeList({ employees }: { employees: Employee[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>All Employees</CardTitle>
        <CardDescription>Select an employee to view their profile.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Link href={`/employees/${employee.id}`} className="flex items-center gap-3 hover:underline">
                    <Avatar>
                      <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{employee.name}</span>
                  </Link>
                </TableCell>
                <TableCell>{employee.phone}</TableCell>
                <TableCell>{employee.paymentMethod}</TableCell>
                <TableCell className="text-right">
                   <Link href={`/employees/${employee.id}`} className="text-muted-foreground">
                    <ChevronRight className="h-5 w-5" />
                   </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
