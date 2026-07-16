
"use client";

import { useEffect, useMemo } from "react";
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
import { collection } from "firebase/firestore";
import { useCollection, useMemoFirebase } from "@/firebase";
import { format, isValid } from "date-fns";
import { ShoppingBag, Calendar, User, PackageSearch, Clock, Timer } from "lucide-react";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function OrdersPage() {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Orders Management");
  }, [setTitle]);

  // Memoize the collection reference from the SECONDARY database
  const ordersCollectionRef = useMemoFirebase(() => {
    return collection(secondaryDb, "orders");
  }, []);

  const { data: allOrders, isLoading } = useCollection<Order>(ordersCollectionRef);

  // Filter for active orders (not Shipped) and sort by deadline
  const activeOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders
      .filter(order => (order.status || "").toLowerCase() !== 'shipped')
      .sort((a, b) => {
        const dateA = a.deadline?.seconds || 0;
        const dateB = b.deadline?.seconds || 0;
        return dateA - dateB;
      });
  }, [allOrders]);

  const getStatusBadge = (status: string, isUrgent?: boolean) => {
    const s = status?.toLowerCase() || 'pending';
    if (isUrgent) {
      return <Badge className="bg-red-500 text-white border-none animate-pulse">URGENT</Badge>;
    }
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

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    let d: Date;
    if (date?.toDate) {
      d = date.toDate();
    } else if (typeof date?.seconds === 'number') {
      d = new Date(date.seconds * 1000);
    } else {
      d = new Date(date);
    }
    return isValid(d) ? format(d, "MMM d, yyyy") : "N/A";
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Fetching orders from registration system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-7">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-primary" />
              Active Orders
            </CardTitle>
            <CardDescription>
              Displaying ongoing projects (status not Shipped).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 font-bold">
              {activeOrders.length} Active
            </Badge>
            <Badge variant="secondary" className="px-3 py-1 font-bold">
              {allOrders?.length || 0} Total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {activeOrders.length > 0 ? (
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold">Order Name & Customer</TableHead>
                    <TableHead className="font-bold">Details</TableHead>
                    <TableHead className="font-bold">Timeline</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeOrders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-sm leading-tight">{order.uniqueName || "Untitled Order"}</span>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>{order.customerName || "Anonymous"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 max-w-[250px]">
                          <span className="text-sm text-foreground line-clamp-1 italic">{order.description || "No description"}</span>
                          {order.material && (
                            <span className="text-[10px] uppercase font-bold text-primary/70">{order.material}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Ordered: {formatDate(order.creationDate)}</span>
                          </div>
                          <div className={cn(
                            "flex items-center gap-2 text-xs font-bold",
                            order.isUrgent ? "text-destructive" : "text-amber-600"
                          )}>
                            <Timer className="h-3 w-3" />
                            <span>Deadline: {formatDate(order.deadline)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          {getStatusBadge(order.status || "", order.isUrgent)}
                          {order.paymentStatus && (
                             <span className="text-[10px] font-bold text-muted-foreground px-1 uppercase tracking-tight">
                               {order.paymentStatus}
                             </span>
                          )}
                        </div>
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
                <p className="text-lg font-bold text-muted-foreground">No active orders</p>
                <p className="text-sm text-muted-foreground/60">There are no orders with a status other than 'Shipped'.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
