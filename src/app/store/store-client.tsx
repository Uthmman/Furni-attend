"use client";

import { useState } from "react";
import type { StoreItem } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdjustmentType = 'add' | 'use';

export function StoreClient({ initialItems }: { initialItems: StoreItem[] }) {
  const [items, setItems] = useState<StoreItem[]>(initialItems);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('add');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [adjustmentValue, setAdjustmentValue] = useState(0);

  const handleOpenDialog = (item: StoreItem, type: AdjustmentType) => {
    setSelectedItem(item);
    setAdjustmentType(type);
    setAdjustmentValue(0);
    setIsDialogOpen(true);
  };

  const handleAdjustStock = () => {
    if (!selectedItem || adjustmentValue <= 0) return;

    setItems(prevItems =>
      prevItems.map(item => {
        if (item.id === selectedItem.id) {
          const newStock = adjustmentType === 'add'
            ? item.stock + adjustmentValue
            : item.stock - adjustmentValue;
          return { ...item, stock: Math.max(0, newStock) };
        }
        return item;
      })
    );
    setIsDialogOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>All Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>In Stock</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.stock}</TableCell>
                  <TableCell className="capitalize">{item.unit}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(item, 'add')}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Add
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(item, 'use')}>
                      <MinusCircle className="mr-2 h-4 w-4" /> Use
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {adjustmentType === 'add' ? 'Add Stock to' : 'Use Stock from'} {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">
                Quantity
              </Label>
              <Input
                id="quantity"
                type="number"
                value={adjustmentValue}
                onChange={(e) => setAdjustmentValue(Number(e.target.value))}
                className="col-span-3"
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleAdjustStock}>Confirm Adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
