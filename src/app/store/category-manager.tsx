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
import { Edit2, Trash2, Plus, Tag } from "lucide-react";
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

  const handleDeleteCategory = (id: string) => {
    if (!firestore) return;
    toast({ title: "Deleting Category" });

    deleteDoc(doc(firestore, "categories", id)).catch(e => {
      errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `categories/${id}`, operation: 'delete' }));
      toast({ variant: "destructive", title: "Delete Failed" });
    });
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
