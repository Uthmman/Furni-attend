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
  Trash2,
  AlertTriangle
} from "lucide-react";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import type { Item, StockAdjustment } from "@/lib/types";
import { ItemForm } from "./item-form";
import { AdjustmentDialog } from "./adjustment-dialog";
import { format } from "date-fns";

export default function StorePage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

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
      item.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  const handleEditItem = (item: Item) => {
    setSelectedItem(item);
    setIsItemFormOpen(true);
  };

  const handleAdjustStock = (item: Item) => {
    setSelectedItem(item);
    setIsAdjustmentOpen(true);
  };

  if (itemsLoading && !items) return <div className="p-8 text-center">Loading Store Inventory...</div>;

  return (
    <div className="flex flex-col gap-6">
      <ItemForm 
        isOpen={isItemFormOpen} 
        setIsOpen={setIsItemFormOpen} 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)} 
      />
      <AdjustmentDialog 
        isOpen={isAdjustmentOpen} 
        setIsOpen={setIsAdjustmentOpen} 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)} 
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search items or categories..." 
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsItemFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add New Item
        </Button>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Inventory
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" /> Recent Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Current Stock Levels</CardTitle>
              <CardDescription>Monitor your hardware, paints, and workshop supplies.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-center">Stock Level</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length > 0 ? (
                      filteredItems.map((item) => {
                        const isLowStock = item.stockLevel <= (item.lowStockThreshold || 5);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {item.name}
                                {isLowStock && (
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {item.category || "Uncategorized"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                variant={isLowStock ? "destructive" : "secondary"}
                                className="w-16 justify-center font-bold text-sm"
                              >
                                {item.stockLevel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.unitOfMeasurement}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleAdjustStock(item)}
                                >
                                  Movement
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleEditItem(item)}
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
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No items found in your store.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Stock Movement Log</CardTitle>
              <CardDescription>Track every addition and removal from your inventory.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Quantity</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustments && adjustments.length > 0 ? (
                      adjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {adj.adjustmentDate ? format(new Date(adj.adjustmentDate), "MMM d, HH:mm") : "N/A"}
                          </TableCell>
                          <TableCell className="font-medium">{adj.itemName || "Deleted Item"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {adj.type === "In" ? (
                                <ArrowUpRight className="h-4 w-4 text-green-500" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-destructive" />
                              )}
                              <span className={adj.type === "In" ? "text-green-600" : "text-destructive"}>
                                {adj.type === "In" ? "Stock In" : "Stock Out"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-bold">
                            {Math.abs(adj.adjustmentQuantity)}
                          </TableCell>
                          <TableCell className="text-sm italic text-muted-foreground max-w-[200px] truncate">
                            {adj.reason}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No stock movements recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}