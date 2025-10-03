'use client';

import { StatCard } from "@/components/stat-card";
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
import { orders, storeItems, employees, attendanceRecords } from "@/lib/data";
import type { Order, StoreItem } from "@/lib/types";
import { Archive, Package, Users } from "lucide-react";
import Image from "next/image";
import Link from 'next/link';
import {
  subMonths,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  addDays,
  parse,
} from "date-fns";
import { PageHeader } from "@/components/page-header";

type PayrollEntry = {
  employeeId: string;
  employeeName: string;
  paymentMethod: "Weekly" | "Monthly";
  period: string;
  amount: number;
  status: "Paid" | "Unpaid";
  workingDays: number;
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

const calculateRecentPayroll = (): PayrollEntry[] => {
  const payroll: PayrollEntry[] = [];
  const today = new Date();
  
  const ethiopianDateFormatter = new Intl.DateTimeFormat("en-US-u-ca-ethiopic", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  const twoDaysFromNow = addDays(today, 2);

  employees.forEach((employee) => {
    const hourlyRate = employee.hourlyRate || 
      (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
      (employee.monthlyRate ? employee.monthlyRate / 22 / 8 : 0);

    if (!hourlyRate) return;

    if (employee.paymentMethod === "Weekly") {
      const thisSaturday = addDays(startOfWeek(today, { weekStartsOn: 1 }), 5);
      if (isWithinInterval(thisSaturday, { start: today, end: twoDaysFromNow })) {
         const weekPeriod = { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
         const relevantRecords = attendanceRecords.filter(
            (record) =>
              record.employeeId === employee.id &&
              (record.status === "Present" || record.status === "Late") &&
              isWithinInterval(new Date(record.date), weekPeriod)
          );
          
          let totalHours = 0;
          relevantRecords.forEach(record => {
              totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
          });

          if (totalHours > 0) {
            payroll.push({
              employeeId: employee.id,
              employeeName: employee.name,
              paymentMethod: "Weekly",
              period: `${ethiopianDateFormatter.format(weekPeriod.start)} - ${ethiopianDateFormatter.format(weekPeriod.end)}`,
              amount: totalHours * hourlyRate,
              status: "Unpaid",
              workingDays: relevantRecords.length,
            });
          }
      }
    } else if (employee.paymentMethod === "Monthly") {
        const endOfMonthDate = endOfMonth(today);
        if (isWithinInterval(endOfMonthDate, { start: today, end: twoDaysFromNow })) {
            const monthPeriod = { start: startOfMonth(today), end: endOfMonth(today) };
            const relevantRecords = attendanceRecords.filter(
                (record) =>
                record.employeeId === employee.id &&
                (record.status === "Present" || record.status === "Late") &&
                isWithinInterval(new Date(record.date), monthPeriod)
            );

            let totalHours = 0;
            relevantRecords.forEach(record => {
                totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
            });

            if(totalHours > 0) {
                 payroll.push({
                    employeeId: employee.id,
                    employeeName: employee.name,
                    paymentMethod: "Monthly",
                    period: new Intl.DateTimeFormat('en-US-u-ca-ethiopic', { year: 'numeric', month: 'long' }).format(monthPeriod.start),
                    amount: totalHours * hourlyRate,
                    status: "Unpaid",
                    workingDays: relevantRecords.length,
                });
            }
        }
    }
  });

  return payroll.filter((p) => p.amount > 0);
};

const getStatusVariant = (status: Order["status"]) => {
  switch (status) {
    case "Completed":
      return "default";
    case "In Progress":
      return "secondary";
    case "Pending":
      return "outline";
    case "Cancelled":
      return "destructive";
  }
};

export default function DashboardPage() {
  const activeOrders = orders.filter(
    (order) => order.status === "In Progress" || order.status === "Pending"
  ).length;
  const totalEmployees = employees.length;
  const lowStockItems = storeItems.filter(
    (item: StoreItem) => item.stock < 10
  );

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
    .slice(0, 5);
  const recentPayroll = calculateRecentPayroll();

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <PageHeader title="Dashboard" description="An overview of your business" />
      
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 md:gap-8">
        <Link href="/orders" className="hover:shadow-lg transition-shadow rounded-xl">
            <StatCard
            title="Active Orders"
            value={activeOrders}
            icon={<Package className="size-5 text-muted-foreground" />}
            description="Orders currently in progress or pending."
            />
        </Link>
        <Link href="/employees" className="hover:shadow-lg transition-shadow rounded-xl">
            <StatCard
            title="Total Employees"
            value={totalEmployees}
            icon={<Users className="size-5 text-muted-foreground" />}
            description="Number of active employees."
            />
        </Link>
        <Link href="/store" className="hover:shadow-lg transition-shadow rounded-xl">
            <StatCard
            title="Low Stock Items"
            value={lowStockItems.length}
            icon={<Archive className="size-5 text-muted-foreground" />}
            description="Items that are running low in inventory."
            />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>
              A quick look at the 5 most recent orders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="font-medium">{order.customerName}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(order.orderDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {order.description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        {lowStockItems.length > 0 && (
           <Card>
           <CardHeader>
             <CardTitle>Low Stock</CardTitle>
              <CardDescription>
                These items are running out. Consider reordering.
              </CardDescription>
           </CardHeader>
           <CardContent className="grid gap-4">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  <Image
                    data-ai-hint="wood"
                    src={`https://picsum.photos/seed/${item.id}/200/200`}
                    alt={item.name}
                    width={56}
                    height={56}
                    className="rounded-md object-cover"
                  />
                  <div className="flex-1">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.stock} {item.unit} left
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
         </Card>
        )}

        {recentPayroll.length > 0 && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Upcoming Payroll</CardTitle>
              <CardDescription>
                These payments are due within the next 2 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Days Worked</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayroll.map((entry) => (
                    <TableRow key={`${entry.employeeId}-${entry.period}`}>
                      <TableCell>
                        <div className="font-medium">{entry.employeeName}</div>
                        <div className="text-sm text-muted-foreground">
                          {entry.paymentMethod}
                        </div>
                      </TableCell>
                      <TableCell>{entry.workingDays}</TableCell>
                      <TableCell>ETB {entry.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.status === "Paid" ? "default" : "destructive"
                          }
                        >
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
