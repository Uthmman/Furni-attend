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
  RadioGroup,
  RadioGroupItem
} from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Item } from "@/lib/types";
import { useFirestore, errorEmitter, FirestorePermissionError } from "@/firebase";
import { doc, writeBatch, collection } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";

const adjustmentSchema = z.object({
  type: z.enum(["In", "Out"]),
  quantity: z.coerce.number().min(1, { message: "Quantity must be at least 1" }),
  reason: z.string().min(5, { message: "Please provide a valid reason (min 5 chars)." }),
});

type AdjustmentValues = z.infer<typeof adjustmentSchema>;

interface AdjustmentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  item: Item | null;
  onClose: () => void;
}

export function AdjustmentDialog({ isOpen, setIsOpen, item, onClose }: AdjustmentDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      type: "Out",
      quantity: 1,
      reason: "",
    },
  });

  const onSubmit = async (data: AdjustmentValues) => {
    if (!firestore || !item) return;
    setIsSubmitting(true);

    const adjustmentQuantity = data.type === "In" ? data.quantity : -data.quantity;
    const newStockLevel = Math.max(0, item.stockLevel + adjustmentQuantity);

    const batch = writeBatch(firestore);
    
    // 1. Log the adjustment
    const adjRef = doc(collection(firestore, "stockAdjustments"));
    const adjData = {
      id: adjRef.id,
      itemId: item.id,
      itemName: item.name,
      adjustmentDate: new Date().toISOString(),
      adjustmentQuantity: adjustmentQuantity,
      type: data.type,
      reason: data.reason,
    };
    batch.set(adjRef, adjData);

    // 2. Update item stock level
    const itemRef = doc(firestore, "items", item.id);
    batch.update(itemRef, { stockLevel: newStockLevel });

    try {
      await batch.commit();
      toast({ 
        title: "Stock Adjusted", 
        description: `${item.name} is now at ${newStockLevel} ${item.unitOfMeasurement}.` 
      });
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Stock Movement: {item?.name}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Movement Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex gap-4"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="In" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-1 text-green-600">
                          <ArrowUpRight className="h-4 w-4" /> Stock In (Restock)
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="Out" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-1 text-destructive">
                          <ArrowDownRight className="h-4 w-4" /> Stock Out (Usage)
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity ({item?.unitOfMeasurement})</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason / Note</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="e.g. Used for Order #102, Weekly restock from hardware store..." 
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Log Movement
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}