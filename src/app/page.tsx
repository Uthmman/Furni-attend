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
import { orders, storeItems } from "@/lib/data";
import type { Order, StoreItem } from "@/lib/types";
import {
  Activity,
  Archive,
  CircleDollarSign,
  Package,
} from "lucide-react";

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
  const totalRevenue = 5423.45;
  const activeOrders = orders.filter(
    (order) => order.status === "In Progress" || order.status === "Pending"
  ).length;
  const lowStockItems = storeItems.filter(
    (item: StoreItem) => item.stock < 10
  ).length;

  const recentOrders = [...orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          icon={<CircleDollarSign className="h-6 w-6 text-muted-foreground" />}
          description="+20.1% from last month"
        />
        <StatCard
          title="Active Orders"
          value={activeOrders}
          icon={<Package className="h-6 w-6 text-muted-foreground" />}
          description="Orders currently in progress"
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockItems}
          icon={<Archive className="h-6 w-6 text-muted-foreground" />}
          description="Items needing to be restocked"
        />
        <StatCard
          title="Sales Activity"
          value="+120"
          icon={<Activity className="h-6 w-6 text-muted-foreground" />}
          description="+19% from last month"
        />
      </div>

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
    </div>
  );
}
