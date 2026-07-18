
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
import type { Item } from "@/lib/types";
import { useFirestore, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import Image from "next/image";

const itemSchema = z.object({
  name: z.string().min(2, { message: "Item name is required." }),
  category: z.string().min(2, { message: "Category is required." }),
  unitOfMeasurement: z.string().min(1, { message: "Unit is required." }),
  stockLevel: z.coerce.number().min(0),
  lowStockThreshold: z.coerce.number().min(0),
  currentPrice: z.coerce.number().min(0).optional(),
  imageUrl: z.string().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

interface ItemFormProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  item?: Item | null;
  onClose?: () => void;
}

const CATEGORIES = [
  "Hardware",
  "Paint",
  "Timber",
  "Upholstery",
  "Tools",
  "Consumables",
  "Finishes",
  "Other"
];

export function ItemForm({ isOpen, setIsOpen, item, onClose }: ItemFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isEditMode = !!item;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      category: "Hardware",
      unitOfMeasurement: "piece",
      stockLevel: 0,
      lowStockThreshold: 5,
      currentPrice: 0,
      imageUrl: "",
    },
  });

  useEffect(() => {
    if (item) {
      form.reset({
        name: item.name || "",
        category: item.category || "Hardware",
        unitOfMeasurement: item.unitOfMeasurement || "piece",
        stockLevel: item.stockLevel || 0,
        lowStockThreshold: item.lowStockThreshold || 5,
        currentPrice: item.currentPrice || 0,
        imageUrl: item.imageUrl || "",
      });
    } else {
      form.reset({
        name: "",
        category: "Hardware",
        unitOfMeasurement: "piece",
        stockLevel: 0,
        lowStockThreshold: 5,
        currentPrice: 0,
        imageUrl: "",
      });
    }
  }, [item, form, isOpen]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for Firestore doc size safety
        toast({
          variant: "destructive",
          title: "Image too large",
          description: "Please select an image smaller than 1MB."
        });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        form.setValue("imageUrl", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: ItemFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    const handleSuccess = (action: string) => {
      toast({ title: `Item ${action} Successfully`, description: `${data.name} has been saved.` });
      setIsSubmitting(false);
      setIsOpen(false);
      onClose?.();
    };

    if (isEditMode && item?.id) {
      const itemRef = doc(firestore, "items", item.id);
      const updateData: any = { ...data };
      delete updateData.stockLevel; // Protect stock level from manual edits

      // If price changed manually in form, log it in history too
      if (data.currentPrice !== item.currentPrice) {
        const historyEntry = { price: data.currentPrice || 0, date: new Date().toISOString() };
        updateData.priceHistory = [...(item.priceHistory || []), historyEntry];
      }

      setDoc(itemRef, updateData, { merge: true })
        .then(() => handleSuccess("Updated"))
        .catch(async (e) => {
          errorEmitter.emit("permission-error", new FirestorePermissionError({ path: itemRef.path, operation: 'update', requestResourceData: updateData }));
          setIsSubmitting(false);
        });
    } else {
      const colRef = collection(firestore, "items");
      const newItemRef = doc(colRef);
      const newItemData: any = { 
        ...data, 
        id: newItemRef.id,
        priceHistory: [{ price: data.currentPrice || 0, date: new Date().toISOString() }]
      };
      
      setDoc(newItemRef, newItemData)
        .then(() => handleSuccess("Added"))
        .catch(async (e) => {
          errorEmitter.emit("permission-error", new FirestorePermissionError({ path: colRef.path, operation: 'create', requestResourceData: newItemData }));
          setIsSubmitting(false);
        });
    }
  };

  const imageUrl = form.watch("imageUrl");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) onClose?.(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{isEditMode ? "Edit Item Details" : "Add Store Item"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-4">
            
            <div className="flex flex-col items-center gap-4 py-4 bg-muted/20 rounded-2xl border-2 border-dashed border-primary/20">
              {imageUrl ? (
                <div className="relative group">
                  <div className="h-32 w-32 rounded-xl overflow-hidden border shadow-inner relative bg-background">
                    <Image src={imageUrl} alt="Item Preview" fill className="object-cover" />
                  </div>
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="icon" 
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg"
                    onClick={() => form.setValue("imageUrl", "")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <div className="h-20 w-20 rounded-full bg-primary/5 flex items-center justify-center">
                    <ImageIcon className="h-10 w-10 opacity-20" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest">No Image Attached</p>
                </div>
              )}
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  id="image-upload"
                />
                <Button type="button" variant="outline" size="sm" className="h-9 px-4 flex items-center gap-2 pointer-events-none">
                  <Upload className="h-4 w-4" />
                  {imageUrl ? "Change Image" : "Upload Image"}
                </Button>
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Oak Wood Stain, 4x4 Hinges" className="h-10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitOfMeasurement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="piece">Piece (pc)</SelectItem>
                        <SelectItem value="liter">Liter (L)</SelectItem>
                        <SelectItem value="set">Set</SelectItem>
                        <SelectItem value="kg">Kilogram (kg)</SelectItem>
                        <SelectItem value="meter">Meter (m)</SelectItem>
                        <SelectItem value="box">Box</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4 bg-muted/20 p-4 rounded-xl border border-dashed">
              <FormField
                control={form.control}
                name="stockLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Current Stock</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        disabled={isEditMode} 
                        className="h-10 bg-background"
                      />
                    </FormControl>
                    {isEditMode && <p className="text-[9px] text-muted-foreground mt-1">Adjust via Log</p>}
                    {!isEditMode && <FormMessage />}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Alert Limit</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="h-10 bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="currentPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Base Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} className="h-10 bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="h-10">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting} className="h-10">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? "Save Changes" : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
