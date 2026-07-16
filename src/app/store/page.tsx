
"use client";

import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package, 
  Plus, 
  Search, 
  History,
  Edit2,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  Wrench,
  Paintbrush,
  Trees,
  Hammer,
  Zap,
  Droplets,
  Box,
  Layers,
  Trash2,
  Settings2,
  CreditCard,
  Wallet,
  Calendar,
  ShoppingBag,
} from "lucide-react";
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, query, orderBy, limit, doc, deleteDoc } from "firebase/firestore";
import type { Item, StockAdjustment } from "@/lib/types";
import { ItemForm } from "./item-form";
import { AdjustmentDialog } from "./adjustment-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export const getCategoryIcon = (category: string) => {
  const iconClass = "h-8 w-8";
  switch (category) {
    case "Hardware": return <Wrench className={iconClass} />;
    case "Paint": return <Paintbrush className={iconClass} />;
    case "Timber": return <Trees className={iconClass} />;
    case "Tools": return <Hammer className={iconClass} />;
    case "Consumables": return <Zap className={iconClass} />;
    case "Finishes": return <Droplets className={iconClass} />;
    case "Upholstery": return <Layers className={iconClass} />;
    default: return <Box className={iconClass} />;
  }
};

export const getCategoryColor = (category: string) => {
  switch (category) {
    case "Hardware": return "bg-blue-500/10 text-blue-600";
    case "Paint": return "bg-pink-500/10 text-pink-600";
    case "Timber": return "bg-orange-500/10 text-orange-600";
    case "Tools": return "bg-slate-500/10 text-slate-600";
    case "Consumables": return "bg-amber-500/10 text-amber-600";
    case "Finishes": return "bg-cyan-500/10 text-cyan-600";
    case "Upholstery": return "bg-purple-500/10 text-purple-600";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function StorePage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"In" | "Out" | null>(null);

  useEffect(() => {
    setTitle("Store Management");
  }, [setTitle]);

  const itemsCollectionRef = useMemoFirebase(() => {
    if (!firestore || isUserLoading || !user) return null;
    return collection(firestore, "items");
  }, [firestore, user, isUserLoading]);

  const { data: items, isLoading: itemsLoading } = useCollection<Item>(itemsCollectionRef);

  const adjustmentsCollectionRef = useMemoFirebase(() => {
    if (!firestore || isUserLoading || !user) return null;
    return query(
      collection(firestore, "stockAdjustments"), 
      orderBy("adjustmentDate", "desc"), 
      limit(100)
    );
  }, [firestore, user, isUserLoading]);

  const { data: adjustments, isLoading: adjustmentsLoading } = useCollection<StockAdjustment>(adjustmentsCollectionRef);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchQuery]);

  const purchaseHistory = useMemo(() => {
    if (!adjustments) return [];
    return adjustments.filter(adj => adj.type === "In");
  }, [adjustments]);

  const handleEditItem = (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();
    setSelectedItem(item);
    setIsItemFormOpen(true);
  };

  const handleAdjustStock = (e: React.MouseEvent | null, item: Item | null, type: "In" | "Out" | null) => {
    if (e) e.stopPropagation();
    setSelectedItem(item);
    setAdjustmentType(type);
    setIsAdjustmentOpen(true);
  };

  const handleDeleteItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!firestore) return;
    try {
        await deleteDoc(doc(firestore, "items", itemId));
        toast({ title: "Item Removed", description: "The item has been deleted from the registry." });
    } catch (e) {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `items/${itemId}`, operation: 'delete' }));
    }
  };

  const isLoadingData = itemsLoading || adjustmentsLoading || isUserLoading;

  if (isLoadingData) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Initializing Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 relative min-h-[calc(100vh-200px)] pb-24">
      {/* Floating Action Buttons */}
      <div className="fixed bottom-24 right-6 flex flex-col gap-3 z-50 md:bottom-12 md:right-12">
        <Button 
          size="lg" 
          className="rounded-full shadow-2xl bg-green-600 hover:bg-green-700 h-16 w-16 p-0 group flex items-center justify-center transition-all duration-300 hover:scale-110"
          onClick={() => handleAdjustStock(null, null, "In")}
          title="Log Purchase / Restock"
        >
          <PlusCircle className="h-8 w-8" />
          <span className="absolute right-full mr-3 bg-card border px-3 py-1.5 rounded-lg text-sm font-bold shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Log Purchase
          </span>
        </Button>
        <Button 
          size="lg" 
          className="rounded-full shadow-2xl bg-destructive hover:bg-destructive/90 h-16 w-16 p-0 group flex items-center justify-center transition-all duration-300 hover:scale-110"
          onClick={() => handleAdjustStock(null, null, "Out")}
          title="Log Usage"
        >
          <MinusCircle className="h-8 w-8" />
          <span className="absolute right-full mr-3 bg-card border px-3 py-1.5 rounded-lg text-sm font-bold shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Log Usage
          </span>
        </Button>
      </div>

      <ItemForm 
        isOpen={isItemFormOpen} 
        setIsOpen={setIsItemFormOpen} 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)} 
      />
      <AdjustmentDialog 
        isOpen={isAdjustmentOpen} 
        setIsOpen={setIsAdjustmentOpen} 
        items={items || []}
        preSelectedItem={selectedItem} 
        forcedType={adjustmentType}
        onClose={() => { setSelectedItem(null); setAdjustmentType(null); }} 
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search supplies..." 
            className="pl-10 h-11 bg-background border-primary/20 shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="mb-6 h-12 p-1 bg-muted/50 w-full flex overflow-x-auto justify-start sm:justify-center">
          <TabsTrigger value="inventory" className="flex items-center gap-2 px-6">
            <Package className="h-4 w-4 shrink-0" /> <span className="text-sm font-bold tracking-tight">Stock</span>
          </TabsTrigger>
          <TabsTrigger value="items" className="flex items-center gap-2 px-6">
            <Settings2 className="h-4 w-4 shrink-0" /> <span className="text-sm font-bold tracking-tight">Items</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2 px-6">
            <History className="h-4 w-4 shrink-0" /> <span className="text-sm font-bold tracking-tight">Log</span>
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2 px-6">
            <CreditCard className="h-4 w-4 shrink-0" /> <span className="text-sm font-bold tracking-tight">Costs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6">
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
             {filteredItems.map(item => {
               const isLowStock = item.stockLevel <= (item.lowStockThreshold || 5);
               return (
                 <Card key={item.id} className="overflow-hidden shadow-md group border-primary/5 transition-all">
                    <CardContent className="p-4">
                       <div className="flex items-start gap-4">
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <div className={cn("flex items-center justify-center h-20 w-20 rounded-2xl shadow-sm shrink-0", getCategoryColor(item.category))}>
                              {getCategoryIcon(item.category)}
                            </div>
                            <div className="flex-1 space-y-1 min-w-0">
                               <h3 className="font-bold text-lg truncate leading-none mb-1">{item.name}</h3>
                               <div className="flex items-center justify-between">
                                  <Badge variant="outline" className="text-[9px] h-4 py-0 px-2 uppercase font-black tracking-tight border-primary/20">
                                  {item.category}
                                  </Badge>
                                  <span className="text-[10px] font-bold text-muted-foreground">ETB {item.currentPrice?.toFixed(2) || "0.00"}</span>
                               </div>
                               <div className="pt-3">
                                  <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">In Stock</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn("text-2xl font-black tabular-nums", isLowStock ? "text-destructive" : "text-green-600")}>
                                      {item.stockLevel}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-mono uppercase translate-y-1">
                                      {item.unitOfMeasurement}
                                    </span>
                                  </div>
                               </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full text-green-600" onClick={(e) => handleAdjustStock(e, item, "In")} title="Add Stock">
                              <PlusCircle className="h-5 w-5" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full text-destructive" onClick={(e) => handleAdjustStock(e, item, "Out")} title="Use Stock">
                              <MinusCircle className="h-5 w-5" />
                            </Button>
                          </div>
                       </div>
                       {isLowStock && (
                          <div className="mt-3 bg-destructive/10 text-destructive text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3" /> LOW STOCK ALERT
                          </div>
                        )}
                    </CardContent>
                 </Card>
               );
             })}
           </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-6">
           <Card className="shadow-lg border-primary/10 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Registry Management</CardTitle>
                <CardDescription className="hidden sm:block">Add, update, or remove supply item definitions.</CardDescription>
              </div>
              <Button onClick={() => setIsItemFormOpen(true)} variant="outline" className="hidden sm:flex border-dashed shadow-sm h-10">
                 <Plus className="mr-2 h-4 w-4" /> Register New Supply
              </Button>
            </CardHeader>
            <CardContent className="p-0">
               <div className="p-4 sm:hidden border-b bg-primary/5">
                 <Button onClick={() => setIsItemFormOpen(true)} variant="outline" className="w-full border-dashed shadow-sm h-11">
                    <Plus className="mr-2 h-4 w-4" /> Register New Supply
                 </Button>
               </div>

               <div className="md:hidden grid grid-cols-1 gap-0 divide-y">
                  {filteredItems.map(item => (
                    <div key={item.id} className="p-4 flex items-center gap-4">
                      <div className={cn("flex items-center justify-center h-16 w-16 rounded-xl shadow-sm shrink-0", getCategoryColor(item.category))}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm truncate">{item.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[9px] h-4 py-0">{item.category}</Badge>
                          <span className="text-[10px] font-bold text-muted-foreground">ETB {item.currentPrice?.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={(e) => handleEditItem(e, item)}><Edit2 className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={(e) => e.stopPropagation()}><Trash2 className="h-4 w-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="max-w-[90vw] rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Item?</AlertDialogTitle>
                              <AlertDialogDescription>Remove {item.name} from registry?</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={(e) => handleDeleteItem(e, item.id)} className="bg-destructive hover:bg-destructive/90 rounded-xl">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
               </div>

               <div className="hidden md:block">
                <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6">Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Price (ETB)</TableHead>
                        <TableHead className="text-center">Limit</TableHead>
                        <TableHead className="text-right pr-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map(item => (
                        <TableRow key={item.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell className="font-bold pl-6">{item.name}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px]">{item.category}</Badge></TableCell>
                          <TableCell className="text-right font-mono font-bold text-xs">ETB {item.currentPrice?.toFixed(2) || "0.00"}</TableCell>
                          <TableCell className="text-center text-xs font-semibold">{item.lowStockThreshold || 5}</TableCell>
                          <TableCell className="text-right pr-6">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => handleEditItem(e, item)}><Edit2 className="h-4 w-4" /></Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => e.stopPropagation()}><Trash2 className="h-4 w-4" /></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                                        <AlertDialogDescription>This will remove the item from your registry. Historical movements will remain, but the item definition will be gone.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={(e) => handleDeleteItem(e, item.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                              </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                </Table>
               </div>
            </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card className="shadow-lg border-primary/10 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle className="text-xl">Movement History</CardTitle>
              <CardDescription className="hidden sm:block">Full audit trail of all quantity changes.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <div className="md:hidden divide-y">
                  {adjustments && adjustments.length > 0 ? (
                    adjustments.map((adj) => (
                      <div key={adj.id} className="p-4 space-y-2 hover:bg-muted/10 transition-colors">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" /> {adj.adjustmentDate ? format(new Date(adj.adjustmentDate), "MMM d, HH:mm") : "—"}
                          </span>
                          <div className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                              adj.type === "In" ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive"
                          )}>
                            {adj.type === "In" ? "Restock" : "Used"}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm">{adj.itemName}</span>
                            {adj.orderUniqueName && (
                              <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase mt-0.5">
                                <ShoppingBag className="h-2 w-2" /> {adj.orderUniqueName}
                              </div>
                            )}
                          </div>
                          <span className={cn("text-lg font-black tabular-nums", adj.type === "In" ? "text-green-600" : "text-destructive")}>
                             {adj.type === "In" ? "+" : "-"}{Math.abs(adj.adjustmentQuantity)}
                          </span>
                        </div>
                        {adj.reason && (
                          <div className="text-[11px] text-muted-foreground italic bg-muted/30 p-2 rounded-lg border border-dashed flex items-start gap-2">
                             <History className="h-3 w-3 mt-0.5 shrink-0" /> {adj.reason}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center text-muted-foreground text-sm">No activity recorded.</div>
                  )}
               </div>

               <div className="hidden md:block">
                <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6">Date</TableHead>
                        <TableHead>Supplies</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="pr-6">Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments && adjustments.length > 0 ? (
                        adjustments.map((adj) => (
                          <TableRow key={adj.id} className="hover:bg-muted/10 transition-colors">
                            <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap pl-6 py-4">
                              {adj.adjustmentDate ? format(new Date(adj.adjustmentDate), "MMM d, HH:mm") : "N/A"}
                            </TableCell>
                            <TableCell>
                               <div className="flex flex-col">
                                  <span className="font-semibold">{adj.itemName || "Unknown Item"}</span>
                                  {adj.orderUniqueName && (
                                    <span className="text-[9px] text-primary font-black uppercase tracking-tight flex items-center gap-1">
                                      <ShoppingBag className="h-2 w-2" /> Order: {adj.orderUniqueName}
                                    </span>
                                  )}
                               </div>
                            </TableCell>
                            <TableCell>
                              <div className={cn(
                                  "flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                  adj.type === "In" ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive"
                              )}>
                                {adj.type === "In" ? "Restock" : "Used"}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-black">
                              <span className={adj.type === "In" ? "text-green-600" : "text-destructive"}>
                                {adj.type === "In" ? "+" : "-"}{Math.abs(adj.adjustmentQuantity)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate pr-6">
                              {adj.reason}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow><TableCell colSpan={5} className="h-40 text-center text-muted-foreground">No records.</TableCell></TableRow>
                      )}
                    </TableBody>
                </Table>
               </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-6">
           <Card className="shadow-lg border-primary/10 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle className="text-xl">Purchase Costs</CardTitle>
              <CardDescription className="hidden sm:block">Financial record of supply restocking expenses.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <div className="md:hidden divide-y">
                  {purchaseHistory.length > 0 ? (
                    purchaseHistory.map((buy) => (
                      <div key={buy.id} className="p-4 space-y-3 hover:bg-muted/10 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground font-semibold block">{buy.adjustmentDate ? format(new Date(buy.adjustmentDate), "MMM d, yyyy") : "—"}</span>
                            <h4 className="font-bold text-sm">{buy.itemName}</h4>
                          </div>
                          <Badge 
                            variant={buy.paymentStatus === 'Paid' ? 'outline' : 'destructive'} 
                            className={cn("text-[9px] uppercase font-bold", buy.paymentStatus === 'Paid' && "bg-green-50 text-green-700 border-green-200")}
                          >
                            {buy.paymentStatus || 'Paid'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-muted/30 p-2 rounded-lg">
                          <div><span className="text-muted-foreground">Supplier:</span> <span className="font-bold">{buy.supplier || "—"}</span></div>
                          <div><span className="text-muted-foreground">Qty:</span> <span className="font-bold">{buy.adjustmentQuantity}</span></div>
                          <div><span className="text-muted-foreground">Unit Price:</span> <span className="font-bold">ETB {buy.unitPrice?.toFixed(2)}</span></div>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-dashed">
                           <span className="text-xs font-semibold text-muted-foreground">Total Paid:</span>
                           <span className="text-lg font-black text-primary">ETB {buy.totalPrice?.toFixed(2)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center text-muted-foreground text-sm">No expenses recorded.</div>
                  )}
               </div>

               <div className="hidden md:block overflow-x-auto">
                 <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6">Date</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total Price</TableHead>
                        <TableHead className="text-center pr-6">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseHistory.length > 0 ? (
                        purchaseHistory.map((buy) => (
                          <TableRow key={buy.id} className="hover:bg-muted/10 transition-colors">
                            <TableCell className="text-[11px] text-muted-foreground pl-6">
                              {buy.adjustmentDate ? format(new Date(buy.adjustmentDate), "MMM d, yyyy") : "—"}
                            </TableCell>
                            <TableCell className="font-bold">
                               <div className="flex flex-col">
                                  <span>{buy.itemName}</span>
                                  <span className="text-[10px] text-muted-foreground font-normal">Qty: {buy.adjustmentQuantity}</span>
                               </div>
                            </TableCell>
                            <TableCell className="text-xs font-medium">{buy.supplier || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs font-bold">ETB {buy.unitPrice?.toFixed(2) || "0.00"}</TableCell>
                            <TableCell className="text-right tabular-nums font-black text-primary">ETB {buy.totalPrice?.toFixed(2) || "0.00"}</TableCell>
                            <TableCell className="text-center pr-6">
                               <Badge 
                                  variant={buy.paymentStatus === 'Paid' ? 'outline' : 'destructive'} 
                                  className={cn("text-[9px] uppercase font-bold", buy.paymentStatus === 'Paid' && "bg-green-50 text-green-700 border-green-200")}
                                >
                                 {buy.paymentStatus || 'Paid'}
                               </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground">No records.</TableCell></TableRow>
                      )}
                    </TableBody>
                 </Table>
               </div>
            </CardContent>
           </Card>
           
           <div className="flex justify-end pr-4">
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 w-full max-w-sm text-center shadow-md">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">Total Stock Spending (Last 100)</p>
                  <p className="text-3xl sm:text-4xl font-black text-primary">
                    ETB {purchaseHistory.reduce((acc, curr) => acc + (curr.totalPrice || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 mt-3">
                     <div className="h-1 w-8 bg-primary/20 rounded-full" />
                     <Wallet className="h-4 w-4 text-primary opacity-40" />
                     <div className="h-1 w-8 bg-primary/20 rounded-full" />
                  </div>
              </div>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
