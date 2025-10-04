"use client";

import type { Employee } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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
        <CardTitle>Employee Information</CardTitle>
        <CardDescription>
          Click on an employee to view their details.
        </CardDescription>
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
                    <div className="text-muted-foreground">
                      <Badge variant="outline">{employee.paymentMethod}</Badge>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold">Account Number</p>
                    <p className="text-muted-foreground">
                      {employee.accountNumber}
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
