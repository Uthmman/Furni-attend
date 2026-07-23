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
import type { Item, Category } from "@/lib/types";
import { useFirestore, errorEmitter, FirestorePermissionError, useCollection, useMemoFirebase, useUser } from "@/firebase";
import { collection, doc, setDoc, query, orderBy } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import { Loader2, Upload, X, Image as ImageIcon, Camera } from "lucide-react";
import Image from "next/image";

const itemSchema = z.object({
  name: z.string().min(2, { message: "Item name is required." }),
  category: z.string().min(1, { message: "Category is required." }),
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

export function ItemForm({ isOpen, setIsOpen, item, onClose }: ItemFormProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const isEditMode = !!item;
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const categoriesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "categories"), orderBy("name"));
  }, [firestore, user]);

  const { data: categoriesData } = useCollection<Category>(categoriesQuery);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      category: "",
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
        category: item.category || "",
        unitOfMeasurement: item.unitOfMeasurement || "piece",
        stockLevel: item.stockLevel || 0,
        lowStockThreshold: item.lowStockThreshold || 5,
        currentPrice: item.currentPrice || 0,
        imageUrl: item.imageUrl || "",
      });
    } else {
      form.reset({
        name: "",
        category: "",
        unitOfMeasurement: "piece",
        stockLevel: 0,
        lowStockThreshold: 5,
        currentPrice: 0,
        imageUrl: "",
      });
    }
  }, [item, form, isOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" }, 
        audio: false 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Could not access camera. Check permissions."
      });
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      form.setValue("imageUrl", canvas.toDataURL("image/jpeg", 0.8));
      stopCamera();
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { 
        toast({ variant: "destructive", title: "Image too large" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => form.setValue("imageUrl", reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (data: ItemFormValues) => {
    if (!firestore) return;

    // Optimistic UI: Close immediately
    setIsOpen(false);
    onClose?.();
    toast({
      title: `Item ${isEditMode ? 'Updated' : 'Added'}`,
      description: `${data.name} is being saved to the registry.`,
    });

    const itemRef = isEditMode && item?.id ? doc(firestore, "items", item.id) : doc(collection(firestore, "items"));
    const updateData: any = { ...data, id: itemRef.id };
    
    if (isEditMode) {
      delete updateData.stockLevel;
      if (data.currentPrice !== item?.currentPrice) {
        updateData.priceHistory = [...(item?.priceHistory || []), { price: data.currentPrice || 0, date: new Date().toISOString() }];
      }
    } else {
      updateData.priceHistory = [{ price: data.currentPrice || 0, date: new Date().toISOString() }];
    }

    setDoc(itemRef, updateData, { merge: true }).catch(error => {
      errorEmitter.emit("permission-error", new FirestorePermissionError({
        path: itemRef.path,
        operation: isEditMode ? 'update' : 'create',
        requestResourceData: updateData
      }));
      toast({
        variant: 'destructive',
        title: "Sync Failed",
        description: "Could not save item details.",
      });
    });
  };

  const imageUrl = form.watch("imageUrl");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { 
        if(!open) {
            stopCamera();
            onClose?.(); 
        }
        setIsOpen(open); 
    }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{isEditMode ? "Edit Item Details" : "Add Store Item"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-4">
            
            <div className="flex flex-col items-center gap-4 py-4 bg-muted/20 rounded-2xl border-2 border-dashed border-primary/20 overflow-hidden">
              {isCameraActive ? (
                <div className="relative w-full aspect-video bg-black flex items-center justify-center rounded-lg">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover rounded-lg" />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                    <Button type="button" size="sm" onClick={capturePhoto} className="rounded-full shadow-lg h-12 w-12 p-0">
                      <Camera className="h-6 w-6" />
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={stopCamera} className="rounded-full shadow-lg h-12 w-12 p-0">
                      <X className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              ) : imageUrl ? (
                <div className="relative group">
                  <div className="h-32 w-32 rounded-xl overflow-hidden border shadow-inner relative bg-background">
                    <Image src={imageUrl} alt="Item Preview" fill className="object-cover" unoptimized />
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
              
              {!isCameraActive && (
                <div className="flex flex-wrap justify-center gap-2">
                  <div className="relative">
                    <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 opacity-0 cursor-pointer" id="image-upload" />
                    <Button type="button" variant="outline" size="sm" className="h-9 px-4 flex items-center gap-2 pointer-events-none">
                      <Upload className="h-4 w-4" />
                      {imageUrl ? "Change" : "Upload"}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-9 px-4 flex items-center gap-2" onClick={startCamera}>
                    <Camera className="h-4 w-4" />
                    Take Photo
                  </Button>
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Oak Wood Stain" className="h-10" {...field} />
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
                        {categoriesData?.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
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
                      <Input type="number" {...field} disabled={isEditMode} className="h-10 bg-background" />
                    </FormControl>
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
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">
                {isEditMode ? "Save Changes" : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
