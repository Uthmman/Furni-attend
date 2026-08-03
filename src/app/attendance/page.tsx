
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttendanceRecord, Employee, AttendanceStatus, PayrollSettings } from "@/lib/types";
import { format, isValid } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useCollection, useFirestore, useMemoFirebase, useUser, useDoc } from "@/firebase";
import { collection, doc, writeBatch, type CollectionReference, type Query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { HorizontalDatePicker } from "@/components/ui/horizontal-date-picker";
import { Plus, Wallet, Sunrise, Sun, CheckSquare, Square, Check, Clock, UserCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

type DailyAttendance = {
  employeeId: string;
  employeeName: string;
  morningStatus: AttendanceStatus;
  afternoonStatus: AttendanceStatus;
  morningEntry?: string;
  afternoonEntry?: string;
  overtimeHours?: number;
};

const getStatusInitial = (s: AttendanceStatus) => {
  switch (s) {
    case "Present": return "P";
    case "Absent": return "A";
    case "Late": return "L";
    case "Permission": return "PR";
    default: return "-";
  }
};

const StatusBadge = ({ status, session }: { status: AttendanceStatus, session?: string }) => {
  const getColors = (s: AttendanceStatus) => {
    switch (s) {
      case "Permission": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Present": return "bg-secondary text-secondary-foreground border-transparent";
      case "Late": return "bg-amber-100 text-amber-700 border-amber-200";
      case "Absent": return "bg-destructive text-destructive-foreground border-transparent";
      default: return "bg-muted text-muted-foreground border-transparent";
    }
  };
  return (
    <div className="flex flex-col items-center gap-1">
      {session && <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter leading-none">{session}</span>}
      <Badge variant="outline" className={cn("h-6 w-6 p-0 justify-center text-[10px] font-black transition-all", getColors(status))}>
        {getStatusInitial(status)}
      </Badge>
    </div>
  );
};

export default function AttendancePage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  
  const employeesColRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: allEmployees, loading: employeesLoading } = useCollection(employeesColRef as CollectionReference<Employee>);
  const employees = useMemo(() => allEmployees?.filter(e => e.status !== 'Inactive') || [], [allEmployees]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const formattedDate = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);
  
  const attendanceColRef: Query<AttendanceRecord> | null = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance', formattedDate, 'records') as Query<AttendanceRecord>;
  }, [firestore, user, formattedDate]);
  const { data: attendanceRecords } = useCollection(attendanceColRef);

  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
  const [isOvertimeDialogOpen, setIsOvertimeDialogOpen] = useState(false);
  const [selectedEmployeeAttendance, setSelectedEmployeeAttendance] = useState<DailyAttendance | null>(null);
  
  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTime, setBulkTime] = useState("08:00");

  const settingsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'metadata', 'payroll_settings');
  }, [firestore, user]);
  const { data: settings } = useDoc<PayrollSettings>(settingsRef);

  useEffect(() => { setTitle("Log Attendance"); }, [setTitle]);

  useEffect(() => {
    if (employees) {
        const daily = employees.map((emp) => {
            const record = attendanceRecords?.find((r) => r.employeeId === emp.id);
            return {
                employeeId: emp.id,
                employeeName: emp.name,
                morningStatus: record?.morningStatus || "Absent",
                afternoonStatus: record?.afternoonStatus || "Absent",
                morningEntry: record?.morningEntry || "",
                afternoonEntry: record?.afternoonEntry || "",
                overtimeHours: record?.overtimeHours || 0,
            };
        });
        setAttendance(daily);
    }
  }, [employees, attendanceRecords]);

  const saveAttendanceBatch = async (data: DailyAttendance[]) => {
    if (!firestore) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const batch = writeBatch(firestore);
    data.forEach((att) => {
      const recordRef = doc(firestore, 'attendance', dateStr, 'records', att.employeeId);
      const empAttRef = doc(firestore, 'employees', att.employeeId, 'attendance', dateStr);
      const record = { ...att, date: selectedDate.toISOString() };
      batch.set(recordRef, record, { merge: true });
      batch.set(empAttRef, record, { merge: true });
    });
    
    try {
        await batch.commit();
    } catch (e) {
        toast({ variant: 'destructive', title: "Save failed" });
    }
  };

  const handleStatusClick = async (session: 'morning' | 'afternoon', status: AttendanceStatus) => {
      if (!selectedEmployeeAttendance || !firestore) return;
      const updated = { ...selectedEmployeeAttendance };
      const time = session === 'morning' ? "08:00" : "13:30";
      
      if (session === 'morning') { 
          updated.morningStatus = status; 
          updated.morningEntry = (status === 'Present' || status === 'Late') ? time : ""; 
      } else { 
          updated.afternoonStatus = status; 
          updated.afternoonEntry = (status === 'Present' || status === 'Late') ? time : ""; 
      }
      
      setSelectedEmployeeAttendance(updated);
      saveAttendanceBatch([updated]);
  };

  const handleBulkStatus = async (session: 'morning' | 'afternoon', status: AttendanceStatus) => {
    if (selectedIds.size === 0 || !firestore) return;
    
    const time = session === 'morning' ? (status === 'Late' ? bulkTime : "08:00") : (status === 'Late' ? bulkTime : "13:30");
    
    const updates: DailyAttendance[] = attendance.map(att => {
        if (!selectedIds.has(att.employeeId)) return att;
        
        const updated = { ...att };
        if (session === 'morning') {
            updated.morningStatus = status;
            updated.morningEntry = (status === 'Present' || status === 'Late') ? time : "";
        } else {
            updated.afternoonStatus = status;
            updated.afternoonEntry = (status === 'Present' || status === 'Late') ? time : "";
        }
        return updated;
    }).filter(att => selectedIds.has(att.employeeId));

    await saveAttendanceBatch(updates);
    setSelectedIds(new Set());
    toast({ title: "Bulk update complete", description: `Updated ${updates.length} employees.` });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === attendance.length) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(attendance.map(a => a.employeeId)));
    }
  };

  const selectedEmployeeDetails = useMemo(() => employees.find(e => e.id === selectedEmployeeAttendance?.employeeId), [selectedEmployeeAttendance, employees]);

  const calculatedHourlyRate = useMemo(() => {
    if (!selectedEmployeeDetails) return 0;
    if (selectedEmployeeDetails.hourlyRate) return selectedEmployeeDetails.hourlyRate;
    if (selectedEmployeeDetails.paymentMethod === 'Weekly') return (selectedEmployeeDetails.dailyRate || 0) / 8;
    return (selectedEmployeeDetails.monthlyRate || 0) / (23.625 * 8);
  }, [selectedEmployeeDetails]);

  const otMultiplier = settings?.normalOvertimeRate || 1.5;
  const liveOTAmount = (selectedEmployeeAttendance?.overtimeHours || 0) * calculatedHourlyRate * otMultiplier;

  if (employeesLoading || isUserLoading) return <div>Loading...</div>;

  return (
    <div className="flex flex-col gap-6 pb-32">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><HorizontalDatePicker selectedDate={selectedDate} onDateSelect={setSelectedDate} /></CardContent></Card>
        </div>
        <div className="lg:col-span-2">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
                <CardTitle className="text-lg">Attendance for {format(selectedDate, "PPP")}</CardTitle>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="text-[10px] font-black uppercase tracking-widest h-8 px-3">
                        {selectedIds.size === attendance.length ? "Deselect All" : "Select All"}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {attendance.map((att) => (
                        <div key={att.employeeId} className="flex items-center gap-3">
                            <Checkbox 
                                checked={selectedIds.has(att.employeeId)} 
                                onCheckedChange={() => toggleSelect(att.employeeId)}
                                className="h-5 w-5 rounded-md"
                            />
                            <button onClick={() => { setSelectedEmployeeAttendance(att); setIsAttendanceDialogOpen(true); }} className="flex-1 text-left group">
                                <Card className={cn(
                                    "transition-all duration-200 border-primary/5 group-hover:border-primary/20",
                                    selectedIds.has(att.employeeId) ? "bg-primary/5 border-primary/40 ring-1 ring-primary/40 shadow-inner" : "hover:bg-accent/50"
                                )}>
                                    <CardContent className="flex items-center justify-between p-3">
                                        <p className="font-bold text-sm truncate">{att.employeeName}</p>
                                        <div className="flex gap-2.5">
                                            <StatusBadge status={att.morningStatus} session="AM" />
                                            <StatusBadge status={att.afternoonStatus} session="PM" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </button>
                            <Button variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-2xl border-2" onClick={() => { setSelectedEmployeeAttendance(att); setIsOvertimeDialogOpen(true); }}>
                                <Plus className="h-4 w-4"/>
                            </Button>
                        </div>
                    ))}
                </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl animate-in slide-in-from-bottom-10 duration-300">
            <Card className="bg-[#1e293b] text-white border-none shadow-2xl rounded-3xl overflow-hidden p-6">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Badge className="bg-blue-600 text-white font-black">{selectedIds.size}</Badge>
                            <span className="text-sm font-bold text-slate-300">Employees Selected</span>
                        </div>
                        <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-3 py-1.5 border border-slate-700">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <Input 
                                type="time" 
                                value={bulkTime} 
                                onChange={(e) => setBulkTime(e.target.value)} 
                                className="bg-transparent border-none text-white h-7 w-20 p-0 text-sm focus-visible:ring-0"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Morning Bulk */}
                        <div className="space-y-3">
                             <div className="flex items-center gap-2 text-slate-400">
                                <Sunrise className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Bulk Morning</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                <BulkButton label="P" onClick={() => handleBulkStatus('morning', 'Present')} color="hover:bg-blue-600" />
                                <BulkButton label="L" onClick={() => handleBulkStatus('morning', 'Late')} color="hover:bg-amber-500" />
                                <BulkButton label="A" onClick={() => handleBulkStatus('morning', 'Absent')} color="hover:bg-red-500" />
                                <BulkButton label="PR" onClick={() => handleBulkStatus('morning', 'Permission')} color="hover:bg-blue-400" />
                            </div>
                        </div>

                         {/* Afternoon Bulk */}
                         <div className="space-y-3">
                             <div className="flex items-center gap-2 text-slate-400">
                                <Sun className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Bulk Afternoon</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                <BulkButton label="P" onClick={() => handleBulkStatus('afternoon', 'Present')} color="hover:bg-blue-600" />
                                <BulkButton label="L" onClick={() => handleBulkStatus('afternoon', 'Late')} color="hover:bg-amber-500" />
                                <BulkButton label="A" onClick={() => handleBulkStatus('afternoon', 'Absent')} color="hover:bg-red-500" />
                                <BulkButton label="PR" onClick={() => handleBulkStatus('afternoon', 'Permission')} color="hover:bg-blue-400" />
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
      )}

      <Dialog open={isOvertimeDialogOpen} onOpenChange={setIsOvertimeDialogOpen}>
          <DialogContent className="sm:max-w-xs">
              <DialogHeader><DialogTitle>Log Overtime</DialogTitle><DialogDescription>For {selectedEmployeeAttendance?.employeeName}</DialogDescription></DialogHeader>
               <div className="grid gap-4 py-4">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="overtime">Overtime Hours</Label>
                    {liveOTAmount > 0 && <div className="flex items-center gap-1 text-[11px] font-black text-primary"><Wallet className="h-3 w-3" /> + ETB {liveOTAmount.toFixed(2)}</div>}
                  </div>
                  <Input type="number" min="0" step="0.5" value={selectedEmployeeAttendance?.overtimeHours || 0} onChange={(e) => setSelectedEmployeeAttendance(prev => prev ? {...prev, overtimeHours: Number(e.target.value)} : null)} />
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-60">Rate: ETB {calculatedHourlyRate.toFixed(2)} / hour (x{otMultiplier})</p>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsOvertimeDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => { if(selectedEmployeeAttendance) saveAttendanceBatch([selectedEmployeeAttendance]); setIsOvertimeDialogOpen(false); }}>Save Overtime</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      
      <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
            <DialogHeader className="p-0">
                <div className="bg-[#f8faff] p-6 text-center border-b border-blue-50">
                   <DialogTitle className="text-2xl font-black text-[#1e293b] tracking-tight">{selectedEmployeeAttendance?.employeeName}</DialogTitle>
                   <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Log attendance for {format(selectedDate, "eeee, MMMM do")}</DialogDescription>
                </div>
            </DialogHeader>
            
            {selectedEmployeeAttendance && (
                <div className="p-6 space-y-8 bg-white">
                    {/* Morning Session */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[#64748b]">
                                <Sunrise className="h-4 w-4 text-orange-400" />
                                <span className="text-[11px] font-black uppercase tracking-widest">Morning Session</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-[#f1f5f9] text-[#1e293b] font-bold h-6 px-3">{selectedEmployeeAttendance.morningStatus}</Badge>
                                {selectedEmployeeAttendance.morningEntry && <span className="text-[10px] font-bold text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">{selectedEmployeeAttendance.morningEntry}</span>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <AttendanceMarkButton 
                                status="Present" 
                                color="bg-blue-600" 
                                active={selectedEmployeeAttendance.morningStatus === 'Present'} 
                                onClick={() => handleStatusClick('morning', 'Present')} 
                            />
                            <AttendanceMarkButton 
                                status="Late" 
                                color="bg-amber-500" 
                                active={selectedEmployeeAttendance.morningStatus === 'Late'} 
                                onClick={() => handleStatusClick('morning', 'Late')} 
                            />
                            <AttendanceMarkButton 
                                status="Absent" 
                                color="bg-red-500" 
                                active={selectedEmployeeAttendance.morningStatus === 'Absent'} 
                                onClick={() => handleStatusClick('morning', 'Absent')} 
                            />
                            <AttendanceMarkButton 
                                status="Permission" 
                                color="bg-blue-400" 
                                active={selectedEmployeeAttendance.morningStatus === 'Permission'} 
                                onClick={() => handleStatusClick('morning', 'Permission')} 
                            />
                        </div>
                    </div>

                    {/* Afternoon Session */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[#64748b]">
                                <Sun className="h-4 w-4 text-yellow-500" />
                                <span className="text-[11px] font-black uppercase tracking-widest">Afternoon Session</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-[#f1f5f9] text-[#1e293b] font-bold h-6 px-3">{selectedEmployeeAttendance.afternoonStatus}</Badge>
                                {selectedEmployeeAttendance.afternoonEntry && <span className="text-[10px] font-bold text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">{selectedEmployeeAttendance.afternoonEntry}</span>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <AttendanceMarkButton 
                                status="Present" 
                                color="bg-blue-600" 
                                active={selectedEmployeeAttendance.afternoonStatus === 'Present'} 
                                onClick={() => handleStatusClick('afternoon', 'Present')} 
                            />
                            <AttendanceMarkButton 
                                status="Late" 
                                color="bg-amber-500" 
                                active={selectedEmployeeAttendance.afternoonStatus === 'Late'} 
                                onClick={() => handleStatusClick('afternoon', 'Late')} 
                            />
                            <AttendanceMarkButton 
                                status="Absent" 
                                color="bg-red-500" 
                                active={selectedEmployeeAttendance.afternoonStatus === 'Absent'} 
                                onClick={() => handleStatusClick('afternoon', 'Absent')} 
                            />
                            <AttendanceMarkButton 
                                status="Permission" 
                                color="bg-blue-400" 
                                active={selectedEmployeeAttendance.afternoonStatus === 'Permission'} 
                                onClick={() => handleStatusClick('afternoon', 'Permission')} 
                            />
                        </div>
                    </div>
                </div>
            )}
            <div className="p-4 bg-[#f8faff] flex justify-end">
                <Button onClick={() => setIsAttendanceDialogOpen(false)} className="bg-[#1e293b] hover:bg-[#0f172a] font-bold px-8">Close</Button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttendanceMarkButton({ status, color, active, onClick }: { status: AttendanceStatus, color: string, active: boolean, onClick: () => void }) {
    return (
        <Button 
            variant="outline" 
            className={cn(
                "h-14 justify-start px-4 rounded-2xl border-2 transition-all duration-200 group",
                active ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700" : "bg-white border-[#f1f5f9] text-[#475569] hover:bg-[#f8faff] hover:border-blue-200"
            )}
            onClick={onClick}
        >
            <div className={cn("h-2 w-2 rounded-full mr-3 shrink-0", active ? "bg-white" : color)} />
            <span className="font-bold text-[14px]">{status}</span>
        </Button>
    );
}

function BulkButton({ label, onClick, color }: { label: string, onClick: () => void, color: string }) {
    return (
        <Button 
            variant="outline" 
            onClick={onClick}
            className={cn(
                "h-10 bg-slate-800 border-slate-700 text-white font-black transition-all duration-200 rounded-xl",
                color
            )}
        >
            {label}
        </Button>
    );
}
