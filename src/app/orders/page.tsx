"use client";

import { useEffect } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { secondaryDb } from "@/firebase/secondary";
import { collection, query, orderBy } from "firebase/firestore";
import { useCollection, useMemoFirebase } from "@/firebase";
import { format, isValid } from "date-fns";
import { ShoppingBag, Calendar, User, PackageSearch } from "lucide-react";
import type { Order } from "@/lib/types";

export default function OrdersPage() {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Orders Management");
  }, [setTitle]);

  // Memoize the collection reference from the SECONDARY database
  const ordersCollectionRef = useMemoFirebase(() => {
    return query(collection(secondaryDb, "orders"), orderBy("orderDate", "desc"));
  }, []);

  const { data: orders, isLoading } = useCollection<Order>(ordersCollectionRef);

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || 'pending';
    switch (s) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Processing</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status || 'Unknown'}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return isValid(d) ? format(d, "MMM d, yyyy") : "Invalid Date";
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Fetching orders from secondary project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-primary" />
              Recent Orders
            </CardTitle>
            <CardDescription>
              Orders fetched from your registration system (course-registration-cce07).
            </CardDescription>
          </div>
          <Badge variant="secondary" className="px-3 py-1 font-bold">
            {orders?.length || 0} Total Orders
          </Badge>
        </CardHeader>
        <CardContent>
          {orders && orders.length > 0 ? (
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold">Customer</TableHead>
                    <TableHead className="font-bold">Order Details</TableHead>
                    <TableHead className="font-bold">Date</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-2 rounded-lg">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-bold">{order.customerName || "Anonymous"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col max-w-[300px]">
                          <span className="text-sm text-foreground line-clamp-1">{order.orderDescription || "No description provided"}</span>
                          <span className="text-[10px] text-muted-foreground font-mono uppercase">ID: {order.id.slice(0, 8)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                          <Calendar className="h-3 w-3" />
                          {formatDate(order.orderDate)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(order.orderStatus)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 bg-muted/20 rounded-2xl border border-dashed">
              <PackageSearch className="h-12 w-12 text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="text-lg font-bold text-muted-foreground">No orders found</p>
                <p className="text-sm text-muted-foreground/60">Ensure the "orders" collection exists in your secondary project.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
