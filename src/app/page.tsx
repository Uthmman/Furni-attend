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
import { subMonths, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";

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
  const thisWeek = {
    start: startOfWeek(new Date()),
    end: endOfWeek(new Date()),
  };
  const lastMonth = {
    start: startOfMonth(subMonths(new Date(), 1)),
    end: endOfMonth(subMonths(new Date(), 1)),
  };

  employees.forEach(employee => {
    if (employee.paymentMethod === 'Weekly' && employee.dailyRate) {
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
          period: `${thisWeek.start.toLocaleDateString()} - ${thisWeek.end.toLocaleDateString()}`,
          amount: presentDays * employee.dailyRate,
          status: 'Unpaid',
        });
      }
    } else if (employee.paymentMethod === 'Monthly' && employee.monthlyRate) {
      // Assuming monthly payment is for the previous calendar month
      const isLastMonthApplicable = new Date().getDate() < 7; // e.g. show last month's payroll in the first week of new month
      if (isLastMonthApplicable) {
        payroll.push({
          employeeId: employee.id,
          employeeName: employee.name,
          paymentMethod: 'Monthly',
          period: lastMonth.start.toLocaleString('default', { month: 'long', year: 'numeric' }),
          amount: employee.monthlyRate,
          status: 'Unpaid',
        });
      }
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
        <StatCard
          title="Low Stock Items"
          value={lowStockItems.length}
          icon={<Archive className="h-6 w-6 text-muted-foreground" />}
          description={`${lowStockItems.map(i => i.name).join(', ')}`}
        />
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

        <Card>
            <CardHeader>
                <CardTitle>የቅርብ ጊዜ የደመወዝ ክፍያ</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ሰራተኛ</TableHead>
                            <TableHead>መጠን</TableHead>
                            <TableHead>ሁኔታ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recentPayroll.length > 0 ? recentPayroll.map((entry) => (
                            <TableRow key={`${entry.employeeId}-${entry.period}`}>
                                <TableCell className="font-medium">{entry.employeeName}</TableCell>
                                <TableCell>${entry.amount.toFixed(2)}</TableCell>
                                <TableCell>
                                    <Badge variant={entry.status === 'Paid' ? 'default' : 'destructive'}>
                                    {entry.status === 'Paid' ? 'የተከፈለ' : 'ያልተከፈለ'}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground">
                                    ምንም በመጠባበቅ ላይ ያለ የደመወዝ ክፍያ የለም።
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
