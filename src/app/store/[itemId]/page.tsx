"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { useDoc, useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { doc, collection, query, where, orderBy } from "firebase/firestore";
import type { Item, StockAdjustment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit2, ShoppingCart, Activity, TrendingUp, History, Package } from "lucide-react";
import { ItemForm } from "../item-form";
import { 
  getCategoryIcon, 
  getCategoryColor 
} from "../page";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from "@/lib/utils";

export default function ItemProfilePage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.itemId as string;
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);

  const itemDocRef = useMemoFirebase(() => {
    // Critical: Only attempt query when auth state is fully ready and user is present
    if (!firestore || !itemId || !user || isUserLoading) return null;
    return doc(firestore, "items", itemId);
  }, [firestore, itemId, user, isUserLoading]);

  const { data: item, isLoading: itemLoading } = useDoc<Item>(itemDocRef);

  const adjustmentsColRef = useMemoFirebase(() => {
    // Critical: Only attempt query when auth state is fully ready and user is present
    if (!firestore || !itemId || !user || isUserLoading) return null;
    return query(
      collection(firestore, "stockAdjustments"),
      where("itemId", "==", itemId),
      orderBy("adjustmentDate", "desc")
    );
  }, [firestore, itemId, user, isUserLoading]);

  const { data: allAdjustments, isLoading: adjustmentsLoading } = useCollection<StockAdjustment>(adjustmentsColRef);

  useEffect(() => {
    if (item) {
      setTitle(item.name);
    }
  }, [item, setTitle]);

  const priceHistory = useMemo(() => {
    if (!allAdjustments) return [];
    return allAdjustments
      .filter(adj => adj.type === "In" && adj.unitPrice !== undefined)
      .map(adj => ({
        date: format(new Date(adj.adjustmentDate), "MMM d"),
        price: adj.unitPrice || 0,
        fullDate: adj.adjustmentDate
      }))
      .reverse(); 
  }, [allAdjustments]);

  const purchaseLogs = useMemo(() => {
    if (!allAdjustments) return [];
    return allAdjustments.filter(adj => adj.type === "In");
  }, [allAdjustments]);

  const usageLogs = useMemo(() => {
    if (!allAdjustments) return [];
    return allAdjustments.filter(adj => adj.type === "Out");
  }, [allAdjustments]);

  const isGlobalLoading = itemLoading || adjustmentsLoading || isUserLoading;

  if (isGlobalLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Syncing Profile...</p>
        </div>
      </div>
    );
  }

  if (!item && !itemLoading) return <div className="p-8 text-center">Item not found in registry.</div>;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <ItemForm 
        isOpen={isEditFormOpen} 
        setIsOpen={setIsEditFormOpen} 
        item={item} 
      />

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/store')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{item?.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="uppercase font-black tracking-tight">{item?.category}</Badge>
            <Badge variant="secondary" className="hidden sm:inline-flex">Reference: {item?.id.slice(0, 8)}</Badge>
          </div>
        </div>
        <Button onClick={() => setIsEditFormOpen(true)} variant="outline" size="sm" className="hidden sm:flex">
          <Edit2 className="mr-2 h-4 w-4" /> Edit Registry
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-primary/5 border-primary/10 shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Stock Level</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-4xl font-black text-primary tabular-nums">{item?.stockLevel}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{item?.unitOfMeasurement}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-green-500/5 border-green-500/10 shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Latest Market Price</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-4xl font-black text-green-600 tabular-nums">ETB {item?.currentPrice?.toFixed(0)}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">/ {item?.unitOfMeasurement}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b mb-4">
              <div>
                <CardTitle className="text-lg">Price Trend</CardTitle>
                <CardDescription className="text-[10px]">Fluctuations in market cost over time</CardDescription>
              </div>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                {priceHistory.length > 0 ? (
                   <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `ETB ${v}`} />
                      <Tooltip 
                        contentStyle={{ background: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: '8px', fontSize: '10px' }}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                      />
                      <Line 
                        type="stepAfter" 
                        dataKey="price" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "white" }} 
                        activeDot={{ r: 6, strokeWidth: 0 }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm italic gap-2">
                    <History className="h-8 w-8 opacity-20" />
                    <span>Insufficient data for price trend analysis.</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-md overflow-hidden">
            <div className={cn("p-6 flex flex-col items-center gap-4 text-center", item ? getCategoryColor(item.category) : "")}>
                <div className="p-4 bg-background/80 backdrop-blur rounded-full shadow-lg">
                  {item ? getCategoryIcon(item.category) : <Package className="h-8 w-8" />}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Classification</p>
                  <p className="text-lg font-bold">{item?.category}</p>
                </div>
            </div>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">Replenish Limit</span>
                <Badge variant="destructive" className="font-bold tabular-nums">
                   {item?.lowStockThreshold || 5} {item?.unitOfMeasurement}
                </Badge>
              </div>
              <div className="flex justify-between items-center text-xs border-t pt-4">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">Total Purchases</span>
                <span className="font-bold tabular-nums">{purchaseLogs.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t pt-4">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">Production Usage</span>
                <span className="font-bold tabular-nums">{usageLogs.length}</span>
              </div>
              <Button onClick={() => setIsEditFormOpen(true)} variant="outline" className="w-full mt-4 sm:hidden">
                <Edit2 className="mr-2 h-4 w-4" /> Edit registry
              </Button>
            </CardContent>
          </Card>

          <div className="bg-primary/5 p-4 rounded-2xl border border-dashed flex items-start gap-3">
            <History className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-primary uppercase">Stock Intelligence</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Unit prices are captured from each purchase log to calculate financial trends. The current price represents your most recent acquisition cost.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
         <Card className="shadow-sm border-primary/10">
            <CardHeader className="bg-primary/5 border-b py-3 px-6">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-green-600" /> Recent Purchase History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <Table>
                 <TableHeader className="bg-muted/30">
                   <TableRow>
                     <TableHead className="pl-6 h-10 text-[10px] uppercase font-black">Date</TableHead>
                     <TableHead className="h-10 text-[10px] uppercase font-black">Price</TableHead>
                     <TableHead className="h-10 text-[10px] uppercase font-black">Qty</TableHead>
                     <TableHead className="pr-6 h-10 text-[10px] uppercase font-black">Supplier</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                    {purchaseLogs.length > 0 ? purchaseLogs.slice(0, 8).map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="pl-6 text-[10px] font-medium whitespace-nowrap">{format(new Date(log.adjustmentDate), "MMM d, yy")}</TableCell>
                        <TableCell className="font-black text-xs tabular-nums">ETB {log.unitPrice?.toFixed(0)}</TableCell>
                        <TableCell className="text-xs text-green-600 font-black tabular-nums">+{log.adjustmentQuantity}</TableCell>
                        <TableCell className="pr-6 text-[10px] truncate max-w-[80px] font-medium">{log.supplier || "—"}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-xs italic">No purchase history records.</TableCell></TableRow>
                    )}
                 </TableBody>
               </Table>
            </CardContent>
         </Card>

         <Card className="shadow-sm border-primary/10">
            <CardHeader className="bg-primary/5 border-b py-3 px-6">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Activity className="h-4 w-4 text-destructive" /> Production Usage History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <Table>
                 <TableHeader className="bg-muted/30">
                   <TableRow>
                     <TableHead className="pl-6 h-10 text-[10px] uppercase font-black">Date</TableHead>
                     <TableHead className="h-10 text-[10px] uppercase font-black">Qty</TableHead>
                     <TableHead className="pr-6 h-10 text-[10px] uppercase font-black">Reason / Purpose</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                    {usageLogs.length > 0 ? usageLogs.slice(0, 8).map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="pl-6 text-[10px] font-medium whitespace-nowrap">{format(new Date(log.adjustmentDate), "MMM d, yy")}</TableCell>
                        <TableCell className="text-xs text-destructive font-black tabular-nums">-{Math.abs(log.adjustmentQuantity)}</TableCell>
                        <TableCell className="pr-6 text-[11px] italic truncate max-w-[150px]">{log.reason}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground text-xs italic">No usage logged yet.</TableCell></TableRow>
                    )}
                 </TableBody>
               </Table>
            </CardContent>
         </Card>
      </div>
    </div>
  );
}