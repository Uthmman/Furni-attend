"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, addDoc, doc, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import type { Category } from "@/lib/types";
import { Edit2, Trash2, Plus, Tag, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CategoryManagerProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function CategoryManager({ isOpen, setIsOpen }: CategoryManagerProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Countdown Deletion State
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

  const categoriesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "categories"), orderBy("name"));
  }, [firestore, user]);

  const { data: categories, isLoading } = useCollection<Category>(categoriesQuery);

  const handleAddCategory = () => {
    if (!firestore || !newCategoryName.trim()) return;
    
    const name = newCategoryName.trim();
    setNewCategoryName("");
    toast({ title: "Adding Category", description: `${name} is being added.` });

    addDoc(collection(firestore, "categories"), { name }).catch(e => {
      errorEmitter.emit("permission-error", new FirestorePermissionError({ path: "categories", operation: 'create', requestResourceData: { name } }));
      toast({ variant: "destructive", title: "Add Failed" });
    });
  };

  const handleUpdateCategory = () => {
    if (!firestore || !editingCategory || !newCategoryName.trim()) return;

    const name = newCategoryName.trim();
    const id = editingCategory.id;
    setEditingCategory(null);
    setNewCategoryName("");
    toast({ title: "Updating Category" });

    setDoc(doc(firestore, "categories", id), { name }, { merge: true }).catch(e => {
      errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `categories/${id}`, operation: 'update', requestResourceData: { name } }));
      toast({ variant: "destructive", title: "Update Failed" });
    });
  };

  const handleStartDeleteCountdown = (id: string) => {
    setCategoryToDelete(id);
    setDeleteCountdown(3);
    
    const timer = setInterval(() => {
      setDeleteCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          executeDeleteCategory(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    deleteTimerRef.current = timer;
  };

  const handleCancelDelete = () => {
    if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    setCategoryToDelete(null);
    setDeleteCountdown(0);
    toast({ title: "Deletion Cancelled" });
  };

  const executeDeleteCategory = (id: string) => {
    if (!firestore) return;
    setCategoryToDelete(null);
    setDeleteCountdown(0);

    toast({ title: "Category Deleted" });

    deleteDoc(doc(firestore, "categories", id)).catch(e => {
      errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `categories/${id}`, operation: 'delete' }));
      toast({ variant: "destructive", title: "Delete Failed" });
    });
  };

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    };
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if(!open) handleCancelDelete();
        setIsOpen(open);
    }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" /> Manage Categories
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex flex-col gap-3">
            <Label htmlFor="catName">{editingCategory ? "Edit Category" : "Add Category"}</Label>
            <div className="flex gap-2">
              <Input 
                id="catName"
                placeholder="e.g. Laminates, Fabric"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (editingCategory ? handleUpdateCategory() : handleAddCategory())}
              />
              <Button onClick={editingCategory ? handleUpdateCategory() : handleAddCategory} disabled={!newCategoryName.trim()}>
                {editingCategory ? "Save" : <Plus className="h-4 w-4" />}
              </Button>
              {editingCategory && (
                <Button variant="ghost" onClick={() => { setEditingCategory(null); setNewCategoryName(""); }}>Cancel</Button>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Existing Categories</Label>
            <div className="max-h-[250px] overflow-y-auto pr-1 flex flex-col gap-1">
              {isLoading ? (
                <p className="text-xs text-center py-4">Loading categories...</p>
              ) : categories && categories.length > 0 ? (
                categories.map((cat) => {
                  const isThisDeleting = categoryToDelete === cat.id;
                  return (
                    <div key={cat.id} className={cn(
                      "flex items-center justify-between p-2 rounded-lg transition-all",
                      isThisDeleting ? "bg-destructive/10 border border-destructive/20 animate-pulse" : "bg-muted/30 hover:bg-muted/50"
                    )}>
                      <span className={cn("text-sm font-medium", isThisDeleting && "text-destructive")}>
                        {cat.name} {isThisDeleting && `(${deleteCountdown}s)`}
                      </span>
                      <div className="flex gap-1">
                        {!isThisDeleting ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCategory(cat); setNewCategoryName(cat.name); }}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleStartDeleteCountdown(cat.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleCancelDelete}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-center py-4 text-muted-foreground">No custom categories found.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
