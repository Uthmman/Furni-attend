"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Item, Order, Employee, StockAdjustment } from "@/lib/types";
import { useFirestore, errorEmitter, FirestorePermissionError, useCollection, useMemoFirebase, useUser } from "@/firebase";
import { secondaryDb } from "@/firebase/secondary";
import { doc, writeBatch, collection, arrayUnion, query, orderBy, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  User, 
  Check, 
  ChevronsUpDown, 
  Search, 
  Package,
  Wrench,
  Paintbrush,
  Trees,
  Hammer,
  Zap,
  Droplets,
  Layers,
  Tag,
  Store,
  ShoppingBag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyLowStock } from "@/app/payroll/actions";
import { getCategoryColor } from "./page";

const adjustmentSchema = z.object({
  itemId: z.string().min(1, { message: "Please select an item" }),
  type: z.enum(["In", "Out"]),
  quantity: z.coerce.number().min(1, { message: "Quantity must be at least 1" }),
  reason: z.string().min(2, { message: "Please provide a reason." }),
  unitPrice: z.coerce.number().optional(),
  supplier: z.string().optional(),
  paymentStatus: z.enum(["Paid", "Unpaid"]).optional(),
  orderId: z.string().optional(),
  employeeId: z.string().optional(),
});

type AdjustmentValues = z.infer<typeof adjustmentSchema>;

interface AdjustmentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  items: Item[];
  preSelectedItem: Item | null;
  forcedType?: "In" | "Out" | null;
  onClose: () => void;
}

const getSmallCategoryIcon = (category: string) => {
  const iconClass = "h-4 w-4 opacity-70";
  switch (category) {
    case "Hardware": return <Wrench className={iconClass} />;
    case "Paint": return <Paintbrush className={iconClass} />;
    case "Timber": return <Trees className={iconClass} />;
    case "Tools": return <Hammer className={iconClass} />;
    case "Consumables": return <Zap className={iconClass} />;
    case "Finishes": return <Droplets className={iconClass} />;
    case "Upholstery": return <Layers className={iconClass} />;
    default: return <Tag className={iconClass} />;
  }
};

export function AdjustmentDialog({ isOpen, setIsOpen, items, preSelectedItem, forcedType, onClose }: AdjustmentDialogProps) {
  const firestore = useFirestore();
  const { user: authUser } = useUser();
  const { toast } = useToast();

  const ordersCollectionRef = useMemoFirebase(() => {
    if (!secondaryDb || !authUser) return null;
    return collection(secondaryDb, "orders");
  }, [authUser]);
  const { data: allOrders, isLoading: ordersLoading } = useCollection<Order>(ordersCollectionRef);

  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return collection(firestore, "employees");
  }, [firestore, authUser]);
  const { data: allEmployees, isLoading: employeesLoading } = useCollection<Employee>(employeesCollectionRef);

  const adjQuery = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return query(collection(firestore, "stockAdjustments"), orderBy("adjustmentDate", "desc"), limit(100));
  }, [firestore, authUser]);
  const { data: recentAdjustments } = useCollection<StockAdjustment>(adjQuery);

  const uniqueSuppliers = useMemo(() => {
    if (!recentAdjustments) return [];
    const suppliers = recentAdjustments
        .filter(a => a.type === 'In' && a.supplier)
        .map(a => a.supplier as string);
    return Array.from(new Set(suppliers)).sort((a, b) => a.localeCompare(b));
  }, [recentAdjustments]);

  const activeOrders = useMemo(() => allOrders?.filter(o => (o.status || "").toLowerCase() !== 'shipped').sort((a, b) => (a.uniqueName || "").localeCompare(b.uniqueName || "")) || [], [allOrders]);
  const activeEmployees = useMemo(() => allEmployees?.filter(e => e.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)) || [], [allEmployees]);

  const [isItemPopoverOpen, setIsItemPopoverOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [isSupplierPopoverOpen, setIsSupplierPopoverOpen] = useState(false);

  const form = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      itemId: preSelectedItem?.id || "",
      type: forcedType || "Out",
      quantity: 1,
      reason: "",
      unitPrice: 0,
      supplier: "",
      paymentStatus: "Paid",
      orderId: "none",
      employeeId: "none",
    },
  });

  const watchedItemId = form.watch("itemId");
  const selectedItem = items.find(i => i.id === watchedItemId);
  const currentType = form.watch("type");
  const watchedSupplier = form.watch("supplier");

  const filteredItemsForSearch = useMemo(() => {
    return items.filter(item => 
      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(itemSearchQuery.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, itemSearchQuery]);

  const filteredSuppliers = useMemo(() => {
    if (!watchedSupplier) return uniqueSuppliers;
    return uniqueSuppliers.filter(s => s.toLowerCase().includes(watchedSupplier.toLowerCase()));
  }, [uniqueSuppliers, watchedSupplier]);

  useEffect(() => {
    if (selectedItem && currentType === 'In') {
        form.setValue("unitPrice", selectedItem.currentPrice || 0);
    }
  }, [selectedItem?.id, currentType, form]);

  useEffect(() => {
    if (isOpen) {
      form.reset({
        itemId: preSelectedItem?.id || "",
        type: forcedType || "Out",
        quantity: 1,
        reason: "",
        unitPrice: preSelectedItem?.currentPrice || 0,
        supplier: "",
        paymentStatus: "Paid",
        orderId: "none",
        employeeId: "none",
      });
      setItemSearchQuery("");
    }
  }, [isOpen, preSelectedItem, forcedType, form]);

  const onSubmit = (data: AdjustmentValues) => {
    if (!firestore || !selectedItem) return;

    const adjustmentQuantity = data.type === "In" ? data.quantity : -data.quantity;
    const newStockLevel = Math.max(0, selectedItem.stockLevel + adjustmentQuantity);

    const batch = writeBatch(firestore);
    const linkedOrder = activeOrders.find(o => o.id === data.orderId);
    const linkedEmployee = activeEmployees.find(e => e.id === data.employeeId);

    const adjRef = doc(collection(firestore, "stockAdjustments"));
    const adjData: any = {
      id: adjRef.id,
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      adjustmentDate: new Date().toISOString(),
      adjustmentQuantity: adjustmentQuantity,
      type: data.type,
      reason: data.reason,
    };

    if (data.type === "In") {
      adjData.unitPrice = data.unitPrice || 0;
      adjData.totalPrice = (data.unitPrice || 0) * data.quantity;
      adjData.supplier = data.supplier || "";
      adjData.paymentStatus = data.paymentStatus || "Paid";
    }

    if (data.type === "Out") {
      if (data.orderId && data.orderId !== "none") {
        adjData.orderId = data.orderId;
        adjData.orderUniqueName = linkedOrder?.uniqueName || "Unknown Order";
      }
      if (data.employeeId && data.employeeId !== "none") {
        adjData.employeeId = data.employeeId;
        adjData.employeeName = linkedEmployee?.name || "Unknown Employee";
      }
    }

    batch.set(adjRef, adjData);
    const itemRef = doc(firestore, "items", selectedItem.id);
    const itemUpdate: any = { stockLevel: newStockLevel };
    
    if (data.type === 'In' && data.unitPrice !== undefined) {
        itemUpdate.currentPrice = data.unitPrice;
        itemUpdate.priceHistory = arrayUnion({ price: data.unitPrice, date: new Date().toISOString() });
    }

    batch.update(itemRef, itemUpdate);

    setIsOpen(false);
    onClose();
    toast({ 
      title: data.type === 'In' ? "Logging Restock" : "Logging Usage", 
      description: `Syncing ${selectedItem.name} balance to ${newStockLevel}.` 
    });

    batch.commit()
      .then(() => {
        const threshold = selectedItem.lowStockThreshold ?? 5;
        if (data.type === 'Out' && selectedItem.lowStockThreshold !== 0 && newStockLevel <= threshold) {
          notifyLowStock(selectedItem.name, newStockLevel, threshold, selectedItem.unitOfMeasurement);
        }
      })
      .catch(e => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: "stockAdjustments", operation: 'write', requestResourceData: adjData }));
        toast({ variant: 'destructive', title: "Stock Sync Failed" });
      });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) onClose(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            {currentType === "In" ? <ArrowUpRight className="h-5 w-5 text-green-600" /> : <ArrowDownRight className="h-5 w-5 text-destructive" />}
            <DialogTitle className="text-xl">
               {currentType === "In" ? "Log Purchase / Restock" : "Log Production Usage"}
            </DialogTitle>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            
            <FormField
              control={form.control}
              name="itemId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Select Item</FormLabel>
                  <Popover open={isItemPopoverOpen} onOpenChange={setIsItemPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={isItemPopoverOpen}
                          className={cn(
                            "w-full justify-between h-11 bg-background font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={!!preSelectedItem}
                        >
                          {field.value
                            ? items.find((item) => item.id === field.value)?.name
                            : "Search workshop supplies..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <div className="flex flex-col">
                        <div className="flex items-center border-b px-3 h-11">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <input
                            placeholder="Type item name or category..."
                            className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                            value={itemSearchQuery}
                            onChange={(e) => setItemSearchQuery(e.target.value)}
                          />
                        </div>
                        <ScrollArea className="h-72">
                          <div className="p-1">
                            {filteredItemsForSearch.length > 0 ? (
                              filteredItemsForSearch.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={cn(
                                    "relative flex w-full cursor-default select-none items-center rounded-sm py-2 px-3 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                    field.value === item.id && "bg-accent/50 text-accent-foreground"
                                  )}
                                  onClick={() => {
                                    form.setValue("itemId", item.id);
                                    setIsItemPopoverOpen(false);
                                    setItemSearchQuery("");
                                  }}
                                >
                                  <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg shrink-0 mr-3", getCategoryColor(item.category))}>
                                    {getSmallCategoryIcon(item.category)}
                                  </div>
                                  <div className="flex flex-col items-start gap-0.5 flex-1 text-left">
                                    <span className="font-bold">{item.name}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{item.category} • {item.stockLevel} {item.unitOfMeasurement} in stock</span>
                                  </div>
                                  <Check
                                    className={cn(
                                      "ml-auto h-4 w-4",
                                      field.value === item.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </button>
                              ))
                            ) : (
                              <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                                <Package className="h-8 w-8 opacity-20" />
                                No matching supplies found.
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {currentType === "Out" && (
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2 mb-1.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <FormLabel className="m-0">Which Employee?</FormLabel>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder={employeesLoading ? "Loading staff..." : "Select employee..."} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">General Usage</SelectItem>
                          {activeEmployees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="orderId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2 mb-1.5">
                        <ShoppingBag className="h-3 w-3 text-muted-foreground" />
                        <FormLabel className="m-0">Link to Order</FormLabel>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-primary/5 border-primary/20">
                            <SelectValue placeholder={ordersLoading ? "Loading..." : "Select active order (optional)"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No specific order</SelectItem>
                          {activeOrders.map(order => <SelectItem key={order.id} value={order.id}>{order.uniqueName || order.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity {selectedItem && <span className="text-muted-foreground font-normal lowercase">({selectedItem.unitOfMeasurement})</span>}</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" className="h-11" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
               <div className="flex flex-col justify-end pb-2">
                 <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">New Balance</p>
                 <p className={cn("font-bold text-lg", currentType === 'In' ? "text-green-600" : "text-destructive")}>
                    {selectedItem ? (currentType === "In" ? selectedItem.stockLevel + (Number(form.watch("quantity")) || 0) : Math.max(0, selectedItem.stockLevel - (Number(form.watch("quantity")) || 0))) : "—"}
                 </p>
               </div>
            </div>

            {currentType === "In" && (
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="unitPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Unit Price (ETB)</FormLabel>
                          <FormControl><Input type="number" step="0.01" className="h-10 bg-background" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="flex flex-col justify-end pb-4">
                       <p className="text-[10px] text-muted-foreground font-semibold uppercase">Total Cost</p>
                       <p className="font-bold text-lg text-primary">ETB {((Number(form.watch("quantity")) || 0) * (Number(form.watch("unitPrice")) || 0)).toFixed(2)}</p>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="supplier"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-xs">Supplier</FormLabel>
                          <Popover open={isSupplierPopoverOpen} onOpenChange={setIsSupplierPopoverOpen}>
                             <PopoverTrigger asChild>
                                <FormControl>
                                    <Input 
                                        placeholder="Supplier name" 
                                        className="h-10 bg-background" 
                                        {...field} 
                                        onFocus={() => setIsSupplierPopoverOpen(true)}
                                    />
                                </FormControl>
                             </PopoverTrigger>
                             {filteredSuppliers.length > 0 && (
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <ScrollArea className="h-40">
                                        <div className="flex flex-col gap-0.5">
                                            {filteredSuppliers.map(s => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent rounded-md text-left transition-colors"
                                                    onClick={() => {
                                                        form.setValue("supplier", s);
                                                        setIsSupplierPopoverOpen(false);
                                                    }}
                                                >
                                                    <Store className="h-3 w-3 opacity-50" />
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </PopoverContent>
                             )}
                          </Popover>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="paymentStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Payment</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Status" /></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="Paid">Fully Paid</SelectItem><SelectItem value="Unpaid">Unpaid</SelectItem></SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                 </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note / Purpose</FormLabel>
                  <FormControl><Textarea placeholder="Note..." className="resize-none min-h-[80px]" {...field} /></FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" className={cn("h-11 shadow-lg", currentType === "In" ? "bg-green-600 hover:bg-green-700" : "bg-destructive hover:bg-destructive/90")}>Confirm Log</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
