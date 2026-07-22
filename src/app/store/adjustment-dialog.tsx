
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
import { Textarea } from "@/components/ui/textarea";
import type { Item, Order, Employee } from "@/lib/types";
import { useFirestore, errorEmitter, FirestorePermissionError, useCollection, useMemoFirebase, useUser } from "@/firebase";
import { secondaryDb } from "@/firebase/secondary";
import { doc, writeBatch, collection, arrayUnion } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Loader2, ArrowUpRight, ArrowDownRight, ShoppingCart, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyLowStock } from "@/app/payroll/actions";

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

export function AdjustmentDialog({ isOpen, setIsOpen, items, preSelectedItem, forcedType, onClose }: AdjustmentDialogProps) {
  const firestore = useFirestore();
  const { user: authUser } = useUser();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ordersCollectionRef = useMemoFirebase(() => {
    return collection(secondaryDb, "orders");
  }, []);
  const { data: allOrders, isLoading: ordersLoading } = useCollection<Order>(ordersCollectionRef);

  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return collection(firestore, "employees");
  }, [firestore, authUser]);
  const { data: allEmployees, isLoading: employeesLoading } = useCollection<Employee>(employeesCollectionRef);

  const activeOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders.filter(o => {
      const s = (o.status || "").toLowerCase();
      return s !== 'shipped';
    }).sort((a, b) => (a.uniqueName || "").localeCompare(b.uniqueName || ""));
  }, [allOrders]);

  const activeEmployees = useMemo(() => {
    if (!allEmployees) return [];
    return allEmployees.filter(e => e.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees]);

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
    }
  }, [isOpen, preSelectedItem, forcedType, form]);

  const onSubmit = async (data: AdjustmentValues) => {
    if (!firestore || !selectedItem) return;
    setIsSubmitting(true);

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
        const historyEntry = { price: data.unitPrice, date: new Date().toISOString() };
        itemUpdate.priceHistory = arrayUnion(historyEntry);
    }

    batch.update(itemRef, itemUpdate);

    try {
      await batch.commit();
      
      toast({ 
        title: data.type === 'In' ? "Stock Restocked" : "Stock Used", 
        description: `${selectedItem.name} is now at ${newStockLevel} ${selectedItem.unitOfMeasurement}.` 
      });

      // Send low stock notification if applicable
      if (data.type === 'Out' && newStockLevel <= (selectedItem.lowStockThreshold || 5)) {
        notifyLowStock(selectedItem.name, newStockLevel, selectedItem.lowStockThreshold || 5, selectedItem.unitOfMeasurement);
      }

      setIsSubmitting(false);
      setIsOpen(false);
      form.reset();
      onClose();
    } catch (e) {
      errorEmitter.emit("permission-error", new FirestorePermissionError({ path: "stockAdjustments", operation: 'write', requestResourceData: adjData }));
      setIsSubmitting(false);
    }
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
                <FormItem>
                  <FormLabel>Select Item</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!!preSelectedItem}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Choose item..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {items.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({item.stockLevel} {item.unitOfMeasurement})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                            <SelectValue placeholder={employeesLoading ? "Loading employees..." : "Select employee..."} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">General Usage (No Employee)</SelectItem>
                          {activeEmployees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
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
                        <FormLabel className="m-0">Link to Active Order</FormLabel>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-primary/5 border-primary/20">
                            <SelectValue placeholder={ordersLoading ? "Loading orders..." : "Select active order (optional)"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No specific order (general usage)</SelectItem>
                          {activeOrders.map(order => (
                            <SelectItem key={order.id} value={order.id}>
                              {order.uniqueName || order.name || `Order ${order.id.slice(0, 5)}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
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
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" min="1" className="h-11" {...field} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground uppercase font-bold">
                          {selectedItem?.unitOfMeasurement || "unit"}
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
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
                 <div className="flex items-center gap-2 text-xs font-bold uppercase text-primary mb-2">
                    <ShoppingCart className="h-3 w-3" /> Purchase Details
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="unitPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Unit Price (ETB)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" className="h-10 bg-background" {...field} />
                          </FormControl>
                          <p className="text-[9px] text-muted-foreground mt-1">Updates cost history</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex flex-col justify-end pb-4">
                       <p className="text-[10px] text-muted-foreground font-semibold uppercase">Total Cost</p>
                       <p className="font-bold text-lg text-primary">
                          ETB {((Number(form.watch("quantity")) || 0) * (Number(form.watch("unitPrice")) || 0)).toFixed(2)}
                       </p>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="supplier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Bought From</FormLabel>
                          <FormControl>
                            <Input placeholder="Supplier name" className="h-10 bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
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
                            <FormControl>
                              <SelectTrigger className="h-10 bg-background">
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Paid">Fully Paid</SelectItem>
                              <SelectItem value="Unpaid">Credit (Unpaid)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
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
                  <FormControl>
                    <Textarea 
                      placeholder={currentType === 'In' ? "Specific details about this purchase..." : "Which piece of furniture is this for?"} 
                      className="resize-none min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="h-11">Cancel</Button>
              </DialogClose>
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className={cn(
                  "h-11 shadow-lg",
                  currentType === "In" ? "bg-green-600 hover:bg-green-700" : "bg-destructive hover:bg-destructive/90"
                )}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Log
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
