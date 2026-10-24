
"use client";

import { useEffect, useState, useMemo } from "react";
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
import { useFirestore, useUser, useDoc, useMemoFirebase, useCollection } from "@/firebase";
import { doc, setDoc, collection, query, orderBy, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Clock, CalendarDays, Loader2, Users, CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import type { PayrollSettings, AppUser } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PayrollSettingsDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function PayrollSettingsDialog({ isOpen, setIsOpen }: PayrollSettingsDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isSaving, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("multipliers");

  const isSuperAdmin = user?.email === 'zenbabafurniture@gmail.com';

  const settingsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "metadata", "payroll_settings");
  }, [firestore, user]);

  const { data: settings } = useDoc<PayrollSettings>(settingsRef);

  // Users collection for approval (Only for Super Admin)
  const usersColRef = useMemoFirebase(() => {
    if (!firestore || !user || !isSuperAdmin) return null;
    return query(collection(firestore, "users"), orderBy("createdAt", "desc"));
  }, [firestore, user, isSuperAdmin]);

  const { data: appUsers, isLoading: usersLoading } = useCollection<AppUser>(usersColRef);

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

  const handleUpdateUserStatus = async (userId: string, status: 'Approved' | 'Rejected') => {
    if (!firestore || !isSuperAdmin) return;
    try {
        await setDoc(doc(firestore, "users", userId), { status }, { merge: true });
        toast({ title: `User ${status}`, description: `Access status has been updated.` });
    } catch (e) {
        toast({ variant: 'destructive', title: "Update Failed" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden rounded-[2rem]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <DialogHeader className="p-6 bg-muted/20 border-b">
                <div className="flex items-center justify-between">
                    <div>
                        <DialogTitle className="flex items-center gap-2 text-xl font-black">
                            Workshop Control
                        </DialogTitle>
                        <DialogDescription>System-wide settings and access control.</DialogDescription>
                    </div>
                </div>
                <TabsList className="grid grid-cols-2 mt-4 bg-muted h-11 p-1 rounded-xl">
                    <TabsTrigger value="multipliers" className="rounded-lg font-bold text-xs uppercase tracking-wider">Payroll</TabsTrigger>
                    <TabsTrigger value="users" className="rounded-lg font-bold text-xs uppercase tracking-wider disabled:opacity-50" disabled={!isSuperAdmin}>
                        Access {isSuperAdmin && appUsers && appUsers.filter(u => u.status === 'Pending').length > 0 && (
                            <span className="ml-2 bg-primary text-white text-[8px] px-1.5 py-0.5 rounded-full">{appUsers.filter(u => u.status === 'Pending').length}</span>
                        )}
                    </TabsTrigger>
                </TabsList>
            </DialogHeader>

            <div className="p-6">
                <TabsContent value="multipliers" className="mt-0 space-y-6">
                    <div className="space-y-6">
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <Label htmlFor="normalRate" className="font-bold">Normal Overtime Multiplier</Label>
                        </div>
                        <Input
                            id="normalRate"
                            type="number"
                            step="0.1"
                            min="1"
                            className="h-12 bg-muted/30 border-none rounded-xl font-bold"
                            value={formState.normalOvertimeRate}
                            onChange={(e) => setFormState(prev => ({ ...prev, normalOvertimeRate: parseFloat(e.target.value) || 0 }))}
                        />
                        <p className="text-[10px] text-muted-foreground italic pl-1">Applied to extra hours logged during weekdays/Saturdays.</p>
                        </div>

                        <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-primary" />
                            <Label htmlFor="sundayRate" className="font-bold">Sunday Multiplier (Monthly)</Label>
                        </div>
                        <Input
                            id="sundayRate"
                            type="number"
                            step="0.1"
                            min="1"
                            className="h-12 bg-muted/30 border-none rounded-xl font-bold"
                            value={formState.sundayOvertimeRate}
                            onChange={(e) => setFormState(prev => ({ ...prev, sundayOvertimeRate: parseFloat(e.target.value) || 0 }))}
                        />
                        <p className="text-[10px] text-muted-foreground italic pl-1">Applied when a monthly employee works on Sunday (Double-pay = 2.0).</p>
                        </div>
                    </div>
                    </div>
                </TabsContent>

                <TabsContent value="users" className="mt-0">
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                        {usersLoading ? (
                            <div className="py-20 flex flex-col items-center gap-3 opacity-40">
                                <Loader2 className="h-8 w-8 animate-spin" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Syncing Users...</p>
                            </div>
                        ) : appUsers && appUsers.length > 0 ? (
                            appUsers.map(u => (
                                <div key={u.uid} className={cn(
                                    "p-4 rounded-2xl border transition-all flex items-center justify-between gap-4",
                                    u.status === 'Pending' ? "bg-amber-50 border-amber-100 ring-1 ring-amber-200" : "bg-white border-slate-100"
                                )}>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm truncate">{u.email}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className={cn(
                                                "text-[8px] font-black px-1.5 h-4 uppercase tracking-tighter border-none",
                                                u.status === 'Approved' ? "bg-green-100 text-green-700" : 
                                                u.status === 'Pending' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                            )}>
                                                {u.status}
                                            </Badge>
                                            <span className="text-[9px] text-slate-400 font-bold uppercase">{u.role}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        {u.status !== 'Approved' && u.email !== 'zenbabafurniture@gmail.com' && (
                                            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full bg-green-50 text-green-600 hover:bg-green-100 border-none" onClick={() => handleUpdateUserStatus(u.uid, 'Approved')}>
                                                <CheckCircle className="h-5 w-5" />
                                            </Button>
                                        )}
                                        {u.status !== 'Rejected' && u.email !== 'zenbabafurniture@gmail.com' && (
                                            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full bg-red-50 text-red-600 hover:bg-red-100 border-none" onClick={() => handleUpdateUserStatus(u.uid, 'Rejected')}>
                                                <XCircle className="h-5 w-5" />
                                            </Button>
                                        )}
                                        {u.email === 'zenbabafurniture@gmail.com' && (
                                            <ShieldCheck className="h-6 w-6 text-primary opacity-40 mr-1" />
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-slate-400 text-xs py-10 italic">No users found.</p>
                        )}
                    </div>
                </TabsContent>
            </div>

            <DialogFooter className="p-6 bg-muted/10 border-t gap-2">
                <DialogClose asChild>
                    <Button variant="ghost" className="rounded-xl font-bold">Close</Button>
                </DialogClose>
                {activeTab === 'multipliers' && (
                    <Button onClick={handleSave} disabled={isSaving} className="rounded-xl font-bold bg-primary px-8">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Multipliers"}
                    </Button>
                )}
            </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
