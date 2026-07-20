
"use client";

import { useState } from "react";
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
import { Edit2, Trash2, Plus, Loader2, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categoriesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "categories"), orderBy("name"));
  }, [firestore, user]);

  const { data: categories, isLoading } = useCollection<Category>(categoriesQuery);

  const handleAddCategory = async () => {
    if (!firestore || !newCategoryName.trim()) return;
    setIsSubmitting(true);
    
    const colRef = collection(firestore, "categories");
    const data = { name: newCategoryName.trim() };

    addDoc(colRef, data)
      .then(() => {
        toast({ title: "Category Added", description: `${newCategoryName} is now available.` });
        setNewCategoryName("");
      })
      .catch((e) => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: "categories", operation: 'create', requestResourceData: data }));
      })
      .finally(() => setIsSubmitting(false));
  };

  const handleUpdateCategory = async () => {
    if (!firestore || !editingCategory || !newCategoryName.trim()) return;
    setIsSubmitting(true);

    const catRef = doc(firestore, "categories", editingCategory.id);
    const data = { name: newCategoryName.trim() };

    setDoc(catRef, data, { merge: true })
      .then(() => {
        toast({ title: "Category Updated" });
        setEditingCategory(null);
        setNewCategoryName("");
      })
      .catch((e) => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: catRef.path, operation: 'update', requestResourceData: data }));
      })
      .finally(() => setIsSubmitting(false));
  };

  const handleDeleteCategory = async (id: string) => {
    if (!firestore) return;
    try {
        await deleteDoc(doc(firestore, "categories", id));
        toast({ title: "Category Deleted" });
    } catch (e) {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `categories/${id}`, operation: 'delete' }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
              <Button 
                onClick={editingCategory ? handleUpdateCategory() : handleAddCategory}
                disabled={isSubmitting || !newCategoryName.trim()}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingCategory ? "Save" : <Plus className="h-4 w-4" />)}
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
                categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium">{cat.name}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCategory(cat); setNewCategoryName(cat.name); }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteCategory(cat.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
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
