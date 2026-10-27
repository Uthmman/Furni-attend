
"use client";

import { useEffect, useMemo, useState } from "react";
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
import { collection, query, orderBy } from "firebase/firestore";
import { useCollection, useMemoFirebase, useUser, useFirestore } from "@/firebase";
import { secondaryDb } from "@/firebase/secondary";
import { format, isValid } from "date-fns";
import { ShoppingBag, Calendar, User, PackageSearch, Clock, Timer, PenTool, PlayCircle, ChevronDown, ChevronUp, Box, Layers, Loader2, ClipboardList } from "lucide-react";
import type { Order, OrderMaterial, BOMItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function OrdersPage() {
  const { setTitle } = usePageTitle();
  const { user } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    setTitle("Orders Management");
  }, [setTitle]);

  const ordersCollectionRef = useMemoFirebase(() => {
    if (!secondaryDb || !user) return null;
    return collection(secondaryDb, "orders");
  }, [user]);

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
          <p className="text-sm font-medium text-muted-foreground">Fetching orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
              Expand orders to see design BOM vs. workshop material consumption.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 font-bold">
              {activeOrders.length} Queue Items
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-6">
          {activeOrders.length > 0 ? (
            <Accordion type="single" collapsible className="w-full space-y-4">
                {activeOrders.map((order) => (
                    <AccordionItem key={order.id} value={order.id} className="border rounded-2xl overflow-hidden px-0">
                        <AccordionTrigger className="hover:no-underline px-4 py-4 sm:px-6">
                            <div className="flex flex-1 items-center justify-between gap-4 pr-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                                        <Box className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="text-left min-w-0">
                                        <p className="font-black text-sm sm:text-base leading-tight truncate">{order.uniqueName || "Untitled Order"}</p>
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                            <User className="h-2.5 w-2.5" />
                                            <span className="truncate">{order.customerName || "Anonymous"}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
                                    <div className={cn(
                                        "flex items-center gap-1.5 text-[10px] font-bold",
                                        order.isUrgent ? "text-destructive" : "text-amber-600"
                                    )}>
                                        <Timer className="h-3 w-3" />
                                        <span>Deadline: {formatDate(order.deadline)}</span>
                                    </div>
                                    {getStatusBadge(order.status || "", order.isUrgent)}
                                </div>
                                <div className="sm:hidden shrink-0">
                                    {getStatusBadge(order.status || "", order.isUrgent)}
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="bg-muted/10 p-0">
                            <div className="p-4 sm:p-6 space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Left Side: Info & BOM */}
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">Order Description</h4>
                                            <div className="bg-background rounded-xl p-4 border italic text-sm text-foreground/80 min-h-[80px]">
                                                {order.description || "No detailed description provided for this order."}
                                            </div>
                                        </div>

                                        {order.bom && order.bom.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-3 flex items-center gap-2">
                                                    <ClipboardList className="h-3 w-3 text-purple-600" /> Bill of Materials (Project Plan)
                                                </h4>
                                                <div className="bg-background rounded-xl border p-2 space-y-1">
                                                    {order.bom.map((item, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-2 px-3 rounded-lg hover:bg-muted/5 transition-colors">
                                                            <span className="text-xs font-bold text-foreground">{item.name}</span>
                                                            <Badge variant="outline" className="font-black text-[9px] border-purple-100 bg-purple-50/50 text-purple-700">
                                                                {item.quantity} {item.unit}
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-background rounded-xl p-3 border">
                                                <p className="text-[9px] font-bold text-muted-foreground uppercase">Material Target</p>
                                                <p className="font-bold text-xs uppercase mt-1">{order.material || "N/A"}</p>
                                            </div>
                                            <div className="bg-background rounded-xl p-3 border">
                                                <p className="text-[9px] font-bold text-muted-foreground uppercase">Income Status</p>
                                                <p className="font-bold text-xs uppercase mt-1 text-primary">{order.paymentStatus || "Unpaid"}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Side: Actual Workshop Usage */}
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-3 flex items-center gap-2">
                                            <Layers className="h-3 w-3 text-primary" /> Actual Materials Used (Workshop Log)
                                        </h4>
                                        <OrderMaterialsList orderId={order.id} />
                                    </div>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
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

function OrderMaterialsList({ orderId }: { orderId: string }) {
    const firestore = useFirestore();
    const { user } = useUser();

    const materialsRef = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return query(collection(firestore, "orderUsage", orderId, "materials"), orderBy("date", "desc"));
    }, [firestore, user, orderId]);

    const { data: materials, isLoading } = useCollection<OrderMaterial>(materialsRef);

    if (isLoading) {
        return <div className="h-32 flex items-center justify-center bg-background rounded-xl border border-dashed"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" /></div>;
    }

    if (!materials || materials.length === 0) {
        return (
            <div className="bg-background rounded-xl border border-dashed p-8 flex flex-col items-center justify-center text-center gap-2">
                <PackageSearch className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No Workshop Usage Logged</p>
                <p className="text-[9px] text-muted-foreground/60">Link inventory logs to this order to track consumption.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 bg-background rounded-xl border p-2">
            {materials.map((mat) => (
                <div key={mat.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/5 hover:bg-muted/10 transition-colors">
                    <div className="flex flex-col">
                        <span className="font-bold text-xs">{mat.itemName}</span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />
                                <span>{format(new Date(mat.date), "MMM d, HH:mm")}</span>
                            </div>
                            {mat.employeeName && (
                                <div className="flex items-center gap-1 text-[9px] font-medium text-primary">
                                    <User className="h-2.5 w-2.5" />
                                    <span>{mat.employeeName}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary" className="font-black text-[10px] bg-primary/10 text-primary border-none">
                            {mat.quantity} {mat.unit}
                        </Badge>
                        {mat.unitPrice && (
                             <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">@ ETB {mat.unitPrice.toFixed(2)}</span>
                        )}
                    </div>
                </div>
            ))}
            <div className="pt-2 border-t border-dashed mt-2 px-1 flex justify-between items-center">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Consumption</span>
                <span className="text-[10px] font-bold text-primary">{materials.length} Items Logged</span>
            </div>
        </div>
    );
}
