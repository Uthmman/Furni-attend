
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
import { cn } from "@/lib/utils";

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
        <Link key={employee.id} href={`/employees/${employee.id}`} className={cn("block hover:shadow-lg transition-all rounded-xl", employee.status === 'Inactive' && "opacity-60 grayscale-[0.5]")}>
           <Card className="flex flex-col h-full w-full">
            <CardHeader className="flex-row items-center gap-4">
                <Avatar className="w-12 h-12">
                  <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{employee.name}</CardTitle>
                        {employee.status === 'Inactive' && (
                            <Badge variant="destructive" className="h-5 text-[10px]">Inactive</Badge>
                        )}
                    </div>
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
