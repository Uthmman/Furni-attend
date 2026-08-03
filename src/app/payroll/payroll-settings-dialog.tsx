
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useUser, useDoc, useMemoFirebase } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Clock, CalendarDays, Loader2 } from "lucide-react";
import type { PayrollSettings } from "@/lib/types";

interface PayrollSettingsDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function PayrollSettingsDialog({ isOpen, setIsOpen }: PayrollSettingsDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isSaving, setIsSubmitting] = useState(false);

  const settingsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "metadata", "payroll_settings");
  }, [firestore, user]);

  const { data: settings } = useDoc<PayrollSettings>(settingsRef);

  const [formState, setFormState] = useState({
    normalOvertimeRate: 1.5,
    sundayOvertimeRate: 2.0,
  });

  useEffect(() => {
    if (settings) {
      setFormState({
        normalOvertimeRate: settings.normalOvertimeRate || 1.5,
        sundayOvertimeRate: settings.sundayOvertimeRate || 2.0,
      });
    }
  }, [settings, isOpen]);

  const handleSave = async () => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    try {
      await setDoc(doc(firestore, "metadata", "payroll_settings"), formState, { merge: true });
      toast({ title: "Settings Saved", description: "Payroll calculations have been updated." });
      setIsOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Save Failed", description: "Could not update settings." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" /> Payroll Settings
          </DialogTitle>
          <DialogDescription>Adjust multipliers used for overtime calculations.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="normalRate">Normal Overtime Multiplier</Label>
              </div>
              <Input
                id="normalRate"
                type="number"
                step="0.1"
                min="1"
                value={formState.normalOvertimeRate}
                onChange={(e) => setFormState(prev => ({ ...prev, normalOvertimeRate: parseFloat(e.target.value) || 0 }))}
              />
              <p className="text-[10px] text-muted-foreground italic">Applied to extra hours logged during weekdays/Saturdays.</p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <Label htmlFor="sundayRate">Sunday Multiplier (Monthly)</Label>
              </div>
              <Input
                id="sundayRate"
                type="number"
                step="0.1"
                min="1"
                value={formState.sundayOvertimeRate}
                onChange={(e) => setFormState(prev => ({ ...prev, sundayOvertimeRate: parseFloat(e.target.value) || 0 }))}
              />
              <p className="text-[10px] text-muted-foreground italic">Applied when a monthly employee works on Sunday (Double-pay = 2.0).</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
