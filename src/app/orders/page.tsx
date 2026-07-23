
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
import { ShoppingBag, Calendar, User, PackageSearch, Clock, Timer, PenTool, PlayCircle } from "lucide-react";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function OrdersPage() {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Orders Management");
  }, [setTitle]);

  const ordersCollectionRef = useMemoFirebase(() => {
    return collection(secondaryDb, "orders");
  }, []);

  const { data: allOrders, isLoading } = useCollection<Order>(ordersCollectionRef);

  const designingCount = useMemo(() => {
    if (!allOrders) return 0;
    return allOrders.filter(o => (o.status || "").toLowerCase() === 'designing').length;
  }, [allOrders]);

  const inProgressCount = useMemo(() => {
    if (!allOrders) return 0;
    return allOrders.filter(o => {
      const s = (o.status || "").toLowerCase();
      return s === 'in progress' || s === 'processing';
    }).length;
  }, [allOrders]);

  const activeOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders
      .filter(order => {
        const s = (order.status || "").toLowerCase();
        // Don't show shipped, designing, or in progress in the main list
        return s !== 'shipped' && s !== 'designing' && s !== 'in progress' && s !== 'processing';
      })
      .sort((a, b) => {
        const dateA = (a.deadline as any)?.seconds || 0;
        const dateB = (b.deadline as any)?.seconds || 0;
        return dateA - dateB;
      });
  }, [allOrders]);

  const getStatusBadge = (status: string, isUrgent?: boolean) => {
    const s = status?.toLowerCase() || 'pending';
    if (isUrgent && s !== 'completed') {
      return <Badge className="bg-red-500 text-white border-none animate-pulse">URGENT</Badge>;
    }
    switch (s) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
      case 'processing':
      case 'in progress':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Progress</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending</Badge>;
      case 'designing':
        return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">Designing</Badge>;
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
      {/* Summary Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-purple-50/50 border-purple-100 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <PenTool className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-purple-600 uppercase tracking-wider">Designing</p>
              <p className="text-2xl font-black text-purple-900">{designingCount} Active Orders</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50/50 border-blue-100 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <PlayCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600 uppercase tracking-wider">In Progress</p>
              <p className="text-2xl font-black text-blue-900">{inProgressCount} Active Orders</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg border-primary/10">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-7">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-primary" />
              Order Queue
            </CardTitle>
            <CardDescription>
              Displaying pending and completed orders (excluding work in progress).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 font-bold">
              {activeOrders.length} In List
            </Badge>
            <Badge variant="secondary" className="px-3 py-1 font-bold">
              {allOrders?.length || 0} Total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {activeOrders.length > 0 ? (
            <>
              <div className="hidden lg:block rounded-xl border overflow-hidden">
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

              <div className="grid grid-cols-1 gap-4 lg:hidden">
                {activeOrders.map((order) => (
                  <Card key={order.id} className={cn(
                    "border-l-4 transition-all hover:shadow-md",
                    order.isUrgent ? "border-l-destructive shadow-sm" : "border-l-primary"
                  )}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm leading-snug truncate">{order.uniqueName || "Untitled Order"}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                            <User className="h-2.5 w-2.5" />
                            <span className="truncate">{order.customerName || "Anonymous"}</span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {getStatusBadge(order.status || "", order.isUrgent)}
                        </div>
                      </div>

                      {order.description && (
                        <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg italic">
                          {order.description}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-dashed">
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Deadline</p>
                          <div className={cn(
                            "flex items-center gap-1.5 text-[11px] font-black",
                            order.isUrgent ? "text-destructive animate-pulse" : "text-amber-600"
                          )}>
                            <Timer className="h-3 w-3" />
                            {formatDate(order.deadline)}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Material</p>
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary/80">
                            <PackageSearch className="h-3 w-3" />
                            <span className="truncate uppercase">{order.material || "N/A"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          <span>Added: {formatDate(order.creationDate)}</span>
                        </div>
                        {order.paymentStatus && (
                          <Badge variant="outline" className="text-[8px] h-4 py-0 px-1.5 font-bold uppercase tracking-tight">
                            {order.paymentStatus}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 bg-muted/20 rounded-2xl border border-dashed">
              <PackageSearch className="h-12 w-12 text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="text-lg font-bold text-muted-foreground">No orders in queue</p>
                <p className="text-sm text-muted-foreground/60">The list is empty based on the current filters.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
