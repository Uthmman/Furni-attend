
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
import { doc, writeBatch, collection, arrayUnion, query, orderBy, limit, increment, getDocs, where } from "firebase/firestore";
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
  ShoppingBag,
  Edit2,
  Calendar,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyLowStock } from "@/app/payroll/actions";
import { getCategoryColor } from "./page";
import { format } from "date-fns";

const adjustmentSchema = z.object({
  itemId: z.string().min(1, { message: "Please select an item" }),
  type: z.enum(["In", "Out"]),
  quantity: z.coerce.number().min(0.001, { message: "Quantity must be greater than 0" }),
  reason: z.string().min(2, { message: "Please provide a reason." }),
  unitPrice: z.coerce.number().optional(),
  supplier: z.string().optional(),
  paymentStatus: z.enum(["Paid", "Unpaid"]).optional(),
  orderId: z.string().optional(),
  employeeId: z.string().optional(),
  adjustmentDate: z.string().optional(),
});

type AdjustmentValues = z.infer<typeof adjustmentSchema>;

interface AdjustmentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  items: Item[];
  preSelectedItem: Item | null;
  forcedType?: "In" | "Out" | null;
  onClose: () => void;
  editingAdjustment?: StockAdjustment | null;
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

export function AdjustmentDialog({ isOpen, setIsOpen, items, preSelectedItem, forcedType, onClose, editingAdjustment }: AdjustmentDialogProps) {
  const firestore = useFirestore();
  const { user: authUser } = useUser();
  const { toast } = useToast();
  const isEditMode = !!editingAdjustment;
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const form = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      itemId: "",
      type: "Out",
      quantity: 1,
      reason: "",
      unitPrice: 0,
      supplier: "",
      paymentStatus: "Paid",
      orderId: "none",
      employeeId: "none",
      adjustmentDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    },
  });

  const watchedItemId = form.watch("itemId");
  const selectedItem = items.find(i => i.id === watchedItemId);
  const currentType = form.watch("type");
  const unitPriceValue = form.watch("unitPrice");

  useEffect(() => {
    if (!isEditMode && currentType === "In") {
       if (unitPriceValue === 0) {
           form.setValue("paymentStatus", "Unpaid");
       } else {
           form.setValue("paymentStatus", "Paid");
       }
    }
  }, [unitPriceValue, currentType, isEditMode, form]);

  const filteredItemsForSearch = useMemo(() => {
    return items.filter(item => 
      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(itemSearchQuery.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, itemSearchQuery]);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      if (editingAdjustment) {
        form.reset({
          itemId: editingAdjustment.itemId,
          type: editingAdjustment.type,
          quantity: Math.abs(editingAdjustment.adjustmentQuantity),
          reason: editingAdjustment.reason,
          unitPrice: editingAdjustment.unitPrice || 0,
          supplier: editingAdjustment.supplier || "",
          paymentStatus: editingAdjustment.paymentStatus || "Paid",
          orderId: editingAdjustment.orderId || "none",
          employeeId: editingAdjustment.employeeId || "none",
          adjustmentDate: editingAdjustment.adjustmentDate ? format(new Date(editingAdjustment.adjustmentDate), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        });
      } else {
        form.reset({
          itemId: preSelectedItem?.id || "",
          type: forcedType || "Out",
          quantity: 1,
          reason: "",
          unitPrice: preSelectedItem?.currentPrice || 0,
          supplier: "",
          paymentStatus: (preSelectedItem?.currentPrice || 0) === 0 ? "Unpaid" : "Paid",
          orderId: "none",
          employeeId: "none",
          adjustmentDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        });
      }
      setItemSearchQuery("");
    }
  }, [isOpen, preSelectedItem, forcedType, editingAdjustment, form]);

  const onSubmit = async (data: AdjustmentValues) => {
    if (!firestore || !selectedItem || isSubmitting) return;
    setIsSubmitting(true);

    const batch = writeBatch(firestore);
    const linkedOrder = activeOrders.find(o => o.id === data.orderId);
    const linkedEmployee = activeEmployees.find(e => e.id === data.employeeId);

    const adjustmentQuantity = data.type === "In" ? data.quantity : -data.quantity;
    
    let stockDiff = adjustmentQuantity;
    if (isEditMode && editingAdjustment) {
      stockDiff = adjustmentQuantity - editingAdjustment.adjustmentQuantity;
    }

    const newStockLevel = Math.max(0, selectedItem.stockLevel + stockDiff);
    const timestamp = data.adjustmentDate ? new Date(data.adjustmentDate).toISOString() : new Date().toISOString();
    
    const adjRef = isEditMode && editingAdjustment ? doc(firestore, "stockAdjustments", editingAdjustment.id) : doc(collection(firestore, "stockAdjustments"));
    
    const adjData: any = {
      id: adjRef.id,
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      adjustmentDate: timestamp,
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

        const usageRef = doc(firestore, "orderUsage", data.orderId, "materials", adjRef.id);
        batch.set(usageRef, {
            id: adjRef.id,
            itemId: selectedItem.id,
            itemName: selectedItem.name,
            quantity: data.quantity,
            unit: selectedItem.unitOfMeasurement,
            date: timestamp,
            reason: data.reason,
            adjustmentId: adjRef.id,
            unitPrice: selectedItem.currentPrice || 0,
            employeeName: linkedEmployee?.name || "General Usage"
        });
      } else {
        adjData.orderId = null;
        adjData.orderUniqueName = null;
        if (isEditMode && editingAdjustment?.orderId) {
            const oldUsageRef = doc(firestore, "orderUsage", editingAdjustment.orderId, "materials", adjRef.id);
            batch.delete(oldUsageRef);
        }
      }

      if (data.employeeId && data.employeeId !== "none") {
        adjData.employeeId = data.employeeId;
        adjData.employeeName = linkedEmployee?.name || "Unknown Employee";
      } else {
        adjData.employeeId = null;
        adjData.employeeName = null;
      }
    }

    batch.set(adjRef, adjData, { merge: true });
    
    const itemRef = doc(firestore, "items", selectedItem.id);
    const itemUpdate: any = { 
      stockLevel: increment(stockDiff),
      lastUpdated: new Date().toISOString()
    };
    
    if (data.type === 'In' && data.unitPrice !== undefined) {
        itemUpdate.currentPrice = data.unitPrice;
        itemUpdate.priceHistory = arrayUnion({ price: data.unitPrice, date: timestamp });
    }
    batch.update(itemRef, itemUpdate);

    if (data.type === "In") {
      try {
        const expensesRef = collection(firestore, "expenses");
        const q = query(expensesRef, where("adjustmentId", "==", adjRef.id));
        const expenseSnap = await getDocs(q);
        
        const expenseDocRef = !expenseSnap.empty ? expenseSnap.docs[0].ref : doc(collection(firestore, "expenses"));
        
        batch.set(expenseDocRef, {
          id: expenseDocRef.id,
          amount: adjData.totalPrice,
          category: "Stock Purchase",
          description: `${isEditMode ? 'Updated' : 'Purchase'}: ${data.quantity} ${selectedItem.unitOfMeasurement} of ${selectedItem.name}`,
          recordedAt: timestamp,
          paymentStatus: adjData.paymentStatus,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          quantity: data.quantity,
          unitOfMeasurement: selectedItem.unitOfMeasurement,
          unitPrice: data.unitPrice,
          supplier: adjData.supplier,
          adjustmentId: adjRef.id
        }, { merge: true });
      } catch (err) {
        console.error("Expense sync error", err);
      }
    }

    setIsOpen(false);
    onClose();
    toast({ 
      title: isEditMode ? "Log Updated" : (data.type === 'In' ? "Logging Restock" : "Logging Usage"), 
      description: `Synchronizing records for ${selectedItem.name}.` 
    });

    batch.commit()
      .then(() => {
        if (!isEditMode && data.type === 'Out') {
            const threshold = selectedItem.lowStockThreshold ?? 5;
            if (selectedItem.lowStockThreshold !== 0 && newStockLevel <= threshold) {
                notifyLowStock(selectedItem.name, newStockLevel, threshold, selectedItem.unitOfMeasurement);
            }
        }
      })
      .catch(e => {
        setIsSubmitting(false);
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: "stockAdjustments", operation: 'write', requestResourceData: adjData }));
        toast({ variant: 'destructive', title: "Sync Failed" });
      });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) onClose(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            {isEditMode ? <Edit2 className="h-5 w-5 text-primary" /> : (currentType === "In" ? <ArrowUpRight className="h-5 w-5 text-green-600" /> : <ArrowDownRight className="h-5 w-5 text-destructive" />)}
            <DialogTitle className="text-xl">
               {isEditMode ? "Edit Movement Log" : (currentType === "In" ? "Log Purchase / Restock" : "Log Production Usage")}
            </DialogTitle>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            
            <FormField
                control={form.control}
                name="adjustmentDate"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <FormLabel className="m-0">Logging Date & Time</FormLabel>
                    </div>
                    <FormControl>
                        <Input type="datetime-local" className="h-11 font-bold" {...field} />
                    </FormControl>
                  </FormItem>
                )}
            />

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
                          disabled={!!preSelectedItem || isEditMode}
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
                      <Input type="number" min="0.01" step="0.01" className="h-11" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
               <div className="flex flex-col justify-end pb-2">
                 <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Estimated Stock</p>
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
                       <p className="font-bold text-lg text-primary">ETB {((Number(form.watch("quantity")) || 0) * (Number(form.getValues().unitPrice) || 0)).toFixed(2)}</p>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="supplier"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-xs">Supplier</FormLabel>
                          <FormControl>
                            <Input 
                                placeholder="Type supplier name..." 
                                className="h-10 bg-background" 
                                list="suppliers-list"
                                {...field} 
                            />
                          </FormControl>
                          <datalist id="suppliers-list">
                              {uniqueSuppliers.map(s => <option key={s} value={s} />)}
                          </datalist>
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
              <Button type="submit" disabled={isSubmitting} className={cn("h-11 shadow-lg", currentType === "In" ? "bg-green-600 hover:bg-green-700" : "bg-destructive hover:bg-destructive/90")}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? "Save Changes" : "Confirm Log"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
