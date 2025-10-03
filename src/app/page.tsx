import { StatCard } from "@/components/stat-card";
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
import { orders, storeItems, employees, attendanceRecords } from "@/lib/data";
import type { Order, StoreItem } from "@/lib/types";
import {
  Archive,
  Package,
} from "lucide-react";
import { subMonths, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek, subWeeks } from "date-fns";

type PayrollEntry = {
  employeeId: string;
  employeeName: string;
  paymentMethod: "Weekly" | "Monthly";
  period: string;
  amount: number;
  status: "Paid" | "Unpaid";
};

const calculateRecentPayroll = (): PayrollEntry[] => {
  const payroll: PayrollEntry[] = [];
  const today = new Date();
  const dayOfWeek = today.getDay(); // Sunday is 0, Saturday is 6

  const ethiopianDateFormatter = new Intl.DateTimeFormat('en-u-ca-ethiopic', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
  });
  
  const ethiopianDay = parseInt(new Intl.DateTimeFormat('en-u-ca-ethiopic', { day: 'numeric' }).format(today));
  
  const thisWeek = {
    start: startOfWeek(today),
    end: endOfWeek(today),
  };
  const lastMonth = {
    start: startOfMonth(subMonths(today, 1)),
    end: endOfMonth(subMonths(today, 1)),
  };

  employees.forEach(employee => {
    // Show weekly payroll only on Saturdays
    if (employee.paymentMethod === 'Weekly' && employee.dailyRate && dayOfWeek === 6) {
      const presentDays = attendanceRecords.filter(
        record =>
          record.employeeId === employee.id &&
          (record.status === 'Present' || record.status === 'Late') &&
          isWithinInterval(new Date(record.date), thisWeek)
      ).length;

      if (presentDays > 0) {
        payroll.push({
          employeeId: employee.id,
          employeeName: employee.name,
          paymentMethod: 'Weekly',
          period: `${ethiopianDateFormatter.format(thisWeek.start)} - ${ethiopianDateFormatter.format(thisWeek.end)}`,
          amount: presentDays * employee.dailyRate,
          status: 'Unpaid',
        });
      }
    } 
    // Show monthly payroll at the end of the Ethiopian month (day 28 or later)
    else if (employee.paymentMethod === 'Monthly' && employee.monthlyRate && ethiopianDay >= 28) {
       payroll.push({
          employeeId: employee.id,
          employeeName: employee.name,
          paymentMethod: 'Monthly',
          period: new Intl.DateTimeFormat('en-u-ca-ethiopic', { year: 'numeric', month: 'long' }).format(startOfMonth(today)),
          amount: employee.monthlyRate,
          status: 'Unpaid',
        });
    }
  });

  return payroll.filter(p => p.amount > 0);
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
  const lowStockItems = storeItems.filter(
    (item: StoreItem) => item.stock < 10
  );

  const recentOrders = [...orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5);
  const recentPayroll = calculateRecentPayroll();


  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Orders"
          value={activeOrders}
          icon={<Package className="h-6 w-6 text-muted-foreground" />}
          description="Orders currently in progress"
        />
        {lowStockItems.map(item => (
            <StatCard 
                key={item.id}
                title={item.name}
                value={`${item.stock} ${item.unit}`}
                icon={<Archive className="h-6 w-6 text-muted-foreground" />}
                description="Low stock"
            />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {recentPayroll.length > 0 && (
          <Card>
              <CardHeader>
                  <CardTitle>Recent Payroll</CardTitle>
              </CardHeader>
              <CardContent>
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {recentPayroll.map((entry) => (
                              <TableRow key={`${entry.employeeId}-${entry.period}`}>
                                  <TableCell>
                                      <div className="font-medium">{entry.employeeName}</div>
                                      <div className="text-sm text-muted-foreground">{entry.period}</div>
                                  </TableCell>
                                  <TableCell>ETB {entry.amount.toFixed(2)}</TableCell>
                                  <TableCell>
                                      <Badge variant={entry.status === 'Paid' ? 'default' : 'destructive'}>
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
