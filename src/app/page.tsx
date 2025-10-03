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
import Image from "next/image";
import { subMonths, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek, addDays } from "date-fns";

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
  
  const ethiopianDateFormatter = new Intl.DateTimeFormat('en-u-ca-ethiopic', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
  });

  const thisWeek = {
    start: startOfWeek(today),
    end: endOfWeek(today),
  };
  
  const todayInEthiopian = new Date(today.toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' }));
  const dayOfWeek = todayInEthiopian.getDay(); // Sunday is 0, Saturday is 6
  const dayOfMonth = todayInEthiopian.getDate();
  const endOfMonthDate = endOfMonth(todayInEthiopian);

  const isSaturdaySoon = dayOfWeek >= 4; // Thursday, Friday, Saturday
  const isEndOfMonthSoon = endOfMonthDate.getDate() - dayOfMonth <= 2;
  
  employees.forEach(employee => {
    if (employee.paymentMethod === 'Weekly' && employee.dailyRate && isSaturdaySoon) {
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
    else if (employee.paymentMethod === 'Monthly' && employee.monthlyRate && isEndOfMonthSoon) {
       payroll.push({
          employeeId: employee.id,
          employeeName: employee.name,
          paymentMethod: 'Monthly',
          period: new Intl.DateTimeFormat('am-ET-u-ca-ethiopic', { year: 'numeric', month: 'long' }).format(startOfMonth(today)),
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <StatCard
          title="Active Orders"
          value={activeOrders}
          icon={<Package className="h-6 w-6 text-muted-foreground" />}
          description="Orders currently in progress"
        />
        {lowStockItems.length > 0 && (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Archive className="h-6 w-6 text-muted-foreground" />
                        Low Stock
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {lowStockItems.map(item => (
                        <div key={item.id} className="flex flex-col items-center gap-2">
                            <Image 
                                src={`https://picsum.photos/seed/${item.id}/200/200`} 
                                alt={item.name}
                                width={80}
                                height={80}
                                className="rounded-md object-cover"
                            />
                            <div className="text-center">
                                <p className="font-medium text-sm">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{item.stock} {item.unit}</p>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        )}
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
