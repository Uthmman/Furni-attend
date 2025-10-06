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
import { Phone } from "lucide-react";
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
    <div className="grid grid-cols-1 gap-6">
      {employees.map((employee) => (
        <Link key={employee.id} href={`/employees/${employee.id}`} className="block hover:shadow-lg transition-shadow rounded-xl">
           <Card className="flex flex-col h-full w-full">
            <CardHeader className="flex-row items-center gap-4">
                <Avatar className="w-12 h-12">
                  <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    <CardTitle className="text-lg">{employee.name}</CardTitle>
                    <CardDescription>{employee.position}</CardDescription>
                </div>
            </CardHeader>
             <CardContent className="flex flex-col justify-between flex-grow">
               <div className="text-sm text-muted-foreground space-y-2">
                 <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{employee.phone}</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Badge variant="outline">{employee.paymentMethod}</Badge>
                 </div>
               </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
