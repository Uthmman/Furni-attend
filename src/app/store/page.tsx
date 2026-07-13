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
  ArrowUpRight, 
  ArrowDownRight, 
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
  Clock
} from "lucide-react";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import type { Item, StockAdjustment } from "@/lib/types";
import { ItemForm } from "./item-form";
import { AdjustmentDialog } from "./adjustment-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const getCategoryIcon = (category: string) => {
  const iconClass = "h-6 w-6"; // Enlarged icons
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

const getCategoryColor = (category: string) => {
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
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"In" | "Out" | null>(null);

  useEffect(() => {
    setTitle("Store Management");
  }, [setTitle]);

  const itemsCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, "items");
  }, [firestore, user]);

  const { data: items, loading: itemsLoading } = useCollection<Item>(itemsCollectionRef);

  const adjustmentsCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "stockAdjustments"), orderBy("adjustmentDate", "desc"), limit(50));
  }, [firestore, user]);

  const { data: adjustments, loading: adjustmentsLoading } = useCollection<StockAdjustment>(adjustmentsCollectionRef);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchQuery]);

  const handleEditItem = (item: Item) => {
    setSelectedItem(item);
    setIsItemFormOpen(true);
  };

  const handleAdjustStock = (item: Item | null, type: "In" | "Out" | null) => {
    setSelectedItem(item);
    setAdjustmentType(type);
    setIsAdjustmentOpen(true);
  };

  if (itemsLoading && !items) return <div className="p-8 text-center">Loading Store Inventory...</div>;

  return (
    <div className="flex flex-col gap-6 relative min-h-[calc(100vh-200px)] pb-24">
      {/* Floating Action Buttons */}
      <div className="fixed bottom-24 right-6 flex flex-col gap-3 z-50 md:bottom-12 md:right-12">
        <Button 
          size="lg" 
          className="rounded-full shadow-2xl bg-green-600 hover:bg-green-700 h-16 w-16 p-0 group flex items-center justify-center transition-all duration-300 hover:scale-110"
          onClick={() => handleAdjustStock(null, "In")}
          title="Stock In (Restock/Buy)"
        >
          <PlusCircle className="h-8 w-8" />
          <span className="absolute right-full mr-3 bg-card border px-3 py-1.5 rounded-lg text-sm font-bold shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Stock In (Bought)
          </span>
        </Button>
        <Button 
          size="lg" 
          className="rounded-full shadow-2xl bg-destructive hover:bg-destructive/90 h-16 w-16 p-0 group flex items-center justify-center transition-all duration-300 hover:scale-110"
          onClick={() => handleAdjustStock(null, "Out")}
          title="Stock Out (Use/Sold)"
        >
          <MinusCircle className="h-8 w-8" />
          <span className="absolute right-full mr-3 bg-card border px-3 py-1.5 rounded-lg text-sm font-bold shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Stock Out (Used)
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
            placeholder="Search items or categories..." 
            className="pl-10 h-11 bg-background border-primary/20 shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsItemFormOpen(true)} className="h-11 shadow-sm border-dashed w-full sm:w-auto" variant="outline">
          <Plus className="mr-2 h-4 w-4" /> Register New Item
        </Button>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="mb-6 h-12 p-1 bg-muted/50 w-full sm:w-auto">
          <TabsTrigger value="inventory" className="flex items-center gap-2 flex-1 sm:flex-none px-6">
            <Package className="h-4 w-4" /> Inventory
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2 flex-1 sm:flex-none px-6">
            <History className="h-4 w-4" /> Activity Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6">
          {/* Desktop Table View */}
          <Card className="hidden md:block shadow-lg border-primary/10 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle>Current Inventory</CardTitle>
              <CardDescription>Track and manage your hardware, wood, and production materials.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-[80px] pl-6"></TableHead>
                      <TableHead className="font-bold">Item Name</TableHead>
                      <TableHead className="font-bold">Category</TableHead>
                      <TableHead className="text-center font-bold">Stock Level</TableHead>
                      <TableHead className="font-bold">Unit</TableHead>
                      <TableHead className="text-right pr-6 font-bold">Quick Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length > 0 ? (
                      filteredItems.map((item) => {
                        const isLowStock = item.stockLevel <= (item.lowStockThreshold || 5);
                        return (
                          <TableRow key={item.id} className="hover:bg-primary/[0.02] transition-colors border-b last:border-0">
                            <TableCell className="pl-6 py-4">
                              <div className={cn("flex items-center justify-center h-12 w-12 rounded-xl shadow-sm", getCategoryColor(item.category || ""))}>
                                {getCategoryIcon(item.category || "")}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold py-4">
                              <div className="flex items-center gap-2">
                                {item.name}
                                {isLowStock && (
                                  <div className="flex items-center gap-1 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                    <AlertTriangle className="h-3 w-3" /> Low Stock
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize text-[10px] font-bold h-6 px-3 bg-primary/5 text-primary border-none shadow-sm">
                                {item.category || "General"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                variant={isLowStock ? "destructive" : "outline"}
                                className={cn(
                                  "w-20 justify-center font-black text-base h-9 shadow-sm",
                                  !isLowStock && "border-green-200 text-green-700 bg-green-50"
                                )}
                              >
                                {item.stockLevel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono text-xs uppercase tracking-tighter">
                              {item.unitOfMeasurement}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <div className="flex justify-end items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleAdjustStock(item, "In")}
                                  className="h-9 w-9 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-full"
                                  title="Stock In"
                                >
                                  <PlusCircle className="h-5 w-5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleAdjustStock(item, "Out")}
                                  className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                                  title="Stock Out"
                                >
                                  <MinusCircle className="h-5 w-5" />
                                </Button>
                                <div className="w-[1px] h-6 bg-border mx-2" />
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleEditItem(item)}
                                  className="h-9 w-9 rounded-full"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="h-40 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                             <Package className="h-10 w-10 opacity-20" />
                             <p>{searchQuery ? "No items match your search." : "Your store inventory is empty."}</p>
                             <Button variant="link" onClick={() => setIsItemFormOpen(true)}>Add your first item</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Card View */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredItems.length > 0 ? (
               filteredItems.map((item) => {
                 const isLowStock = item.stockLevel <= (item.lowStockThreshold || 5);
                 return (
                   <Card key={item.id} className="relative overflow-hidden shadow-md">
                     {isLowStock && <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />}
                     <CardContent className="p-4">
                       <div className="flex items-start gap-4">
                         <div className={cn("flex items-center justify-center h-16 w-16 rounded-2xl shadow-sm shrink-0", getCategoryColor(item.category || ""))}>
                            {getCategoryIcon(item.category || "")}
                         </div>
                         <div className="flex-1 space-y-1">
                            <div className="flex justify-between items-start">
                              <h3 className="font-bold text-lg leading-none">{item.name}</h3>
                              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-2" onClick={() => handleEditItem(item)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <Badge variant="outline" className="text-[10px] h-5 py-0 px-2 uppercase font-bold tracking-tight">
                              {item.category || "General"}
                            </Badge>
                            
                            <div className="flex items-center justify-between pt-3">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Balance</span>
                                <div className="flex items-center gap-1.5">
                                  <span className={cn("text-2xl font-black", isLowStock ? "text-destructive" : "text-green-600")}>
                                    {item.stockLevel}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-mono uppercase translate-y-1">
                                    {item.unitOfMeasurement}
                                  </span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-10 px-4 text-green-600 border-green-600/20 bg-green-50/50 hover:bg-green-100"
                                  onClick={() => handleAdjustStock(item, "In")}
                                >
                                  <PlusCircle className="h-5 w-5 mr-1.5" /> In
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-10 px-4 text-destructive border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                                  onClick={() => handleAdjustStock(item, "Out")}
                                >
                                  <MinusCircle className="h-5 w-5 mr-1.5" /> Out
                                </Button>
                              </div>
                            </div>
                         </div>
                       </div>
                       {isLowStock && (
                          <div className="mt-3 bg-destructive/10 text-destructive text-[10px] font-bold py-1 px-3 rounded-lg flex items-center gap-2 animate-pulse">
                            <AlertTriangle className="h-3 w-3" /> LOW STOCK ALERT: BELOW {item.lowStockThreshold}
                          </div>
                        )}
                     </CardContent>
                   </Card>
                 );
               })
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-center gap-4 bg-muted/20 rounded-2xl border-2 border-dashed">
                <Package className="h-12 w-12 opacity-20" />
                <p>{searchQuery ? "No results found." : "Empty store."}</p>
                <Button variant="outline" onClick={() => setIsItemFormOpen(true)}>Add New Item</Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          {/* Desktop Activity Table */}
          <Card className="hidden md:block shadow-lg border-primary/10 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Full audit trail of all store movements.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Timestamp</TableHead>
                      <TableHead>Supplies</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead className="text-center">Quantity</TableHead>
                      <TableHead className="pr-6">Note / Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustments && adjustments.length > 0 ? (
                      adjustments.map((adj) => (
                        <TableRow key={adj.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap pl-6 py-4">
                            <div className="flex flex-col">
                               <span className="font-bold text-foreground">{adj.adjustmentDate ? format(new Date(adj.adjustmentDate), "MMM d") : "N/A"}</span>
                               <span>{adj.adjustmentDate ? format(new Date(adj.adjustmentDate), "HH:mm") : "N/A"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">{adj.itemName || "Unknown Item"}</TableCell>
                          <TableCell>
                            <div className={cn(
                                "flex items-center gap-1.5 w-fit px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                adj.type === "In" ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive"
                            )}>
                              {adj.type === "In" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {adj.type === "In" ? "Bought" : "Used"}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("font-black text-lg", adj.type === "In" ? "text-green-600" : "text-destructive")}>
                              {adj.type === "In" ? "+" : "-"}{Math.abs(adj.adjustmentQuantity)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm italic text-muted-foreground max-w-[300px] truncate pr-6">
                            {adj.reason}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                          No stock movements recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Activity Card List */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {adjustments && adjustments.length > 0 ? (
              adjustments.map((adj) => (
                <Card key={adj.id} className="shadow-sm border-l-4 overflow-hidden" style={{ borderLeftColor: adj.type === 'In' ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)' }}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-base leading-tight">{adj.itemName || "Unknown Item"}</h4>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground uppercase font-semibold">
                          <Clock className="h-3 w-3" />
                          {adj.adjustmentDate ? format(new Date(adj.adjustmentDate), "MMM d, HH:mm") : "N/A"}
                        </div>
                      </div>
                      <div className={cn(
                        "flex items-center gap-1 font-black text-lg",
                        adj.type === "In" ? "text-green-600" : "text-destructive"
                      )}>
                        {adj.type === "In" ? "+" : "-"}{Math.abs(adj.adjustmentQuantity)}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <div className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                          adj.type === "In" ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive"
                      )}>
                        {adj.type === "In" ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                        {adj.type === "In" ? "Bought" : "Used"}
                      </div>
                    </div>

                    <div className="bg-muted/30 p-2.5 rounded-lg border border-dashed">
                      <p className="text-xs italic text-muted-foreground leading-relaxed">
                        {adj.reason || "No reason provided."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-center gap-4 bg-muted/20 rounded-2xl border-2 border-dashed">
                <History className="h-12 w-12 opacity-20" />
                <p>No activity recorded yet.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
