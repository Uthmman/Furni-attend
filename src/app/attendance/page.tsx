"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttendanceRecord, Employee, AttendanceStatus } from "@/lib/types";
import { format, isValid, getDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useCollection, useFirestore, useMemoFirebase, errorEmitter, FirestorePermissionError, useUser } from "@/firebase";
import { collection, doc, writeBatch, type CollectionReference, type Query } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { HorizontalDatePicker } from "@/components/ui/horizontal-date-picker";
import { Plus, Sunrise, Sun, CheckCircle2, XCircle, Clock, Square, CheckSquare, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";

type DailyAttendance = {
  employeeId: string;
  employeeName: string;
  morningStatus: AttendanceStatus;
  afternoonStatus: AttendanceStatus;
  morningEntry?: string;
  afternoonEntry?: string;
  overtimeHours?: number;
};

const StatusBadge = ({ status, session }: { status: AttendanceStatus, session?: string }) => {
  const getColors = (s: AttendanceStatus) => {
    switch (s) {
      case "Permission":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "Present":
        return "bg-secondary text-secondary-foreground border-transparent";
      case "Late":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "Absent":
        return "bg-destructive text-destructive-foreground border-transparent";
      default:
        return "bg-muted text-muted-foreground border-transparent";
    }
  };

  const getInitial = (s: AttendanceStatus) => {
    if (s === "Permission") return "PR";
    return s.charAt(0);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {session && <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter leading-none">{session}</span>}
      <Badge 
        variant="outline" 
        className={cn(
          "h-6 px-1.5 sm:px-2.5 min-w-[24px] justify-center text-[10px] sm:text-xs font-bold transition-all",
          getColors(status)
        )}
      >
        <span className="hidden sm:inline">{status}</span>
        <span className="inline sm:hidden">{getInitial(status)}</span>
      </Badge>
    </div>
  );
};

const getStatusBadge = (status: AttendanceStatus) => {
  switch (status) {
    case "Permission":
        return <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">Permission</Badge>;
    case "Present":
        return <Badge variant="secondary">Present</Badge>;
    case "Late":
      return <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">Late</Badge>;
    case "Absent":
      return <Badge variant="destructive">Absent</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  if (!isValid(date)) return "Invalid Date";
  try {
      return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
  } catch (e) {
      console.error("Error formatting Ethiopian date:", e);
      return "Invalid Date";
  }
};

export default function AttendancePage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  
  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: allEmployees, loading: employeesLoading } = useCollection(employeesCollectionRef as CollectionReference<Employee>);
  
  const employees = useMemo(() => allEmployees?.filter(e => e.status !== 'Inactive') || [], [allEmployees]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const formattedDate = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);
  
  const attendanceCollectionRef: Query<AttendanceRecord> | null = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance', formattedDate, 'records') as Query<AttendanceRecord>;
  }, [firestore, user, formattedDate]);

  const { data: attendanceRecords, loading: attendanceLoading } = useCollection(attendanceCollectionRef);

  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
  const [isLateDialogOpen, setIsLateDialogOpen] = useState(false);
  const [isBulkLateDialogOpen, setIsBulkLateDialogOpen] = useState(false);
  const [isOvertimeDialogOpen, setIsOvertimeDialogOpen] = useState(false);
  
  const [selectedEmployeeAttendance, setSelectedEmployeeAttendance] = useState<DailyAttendance | null>(null);
  const [lateDialogData, setLateDialogData] = useState<{ session: 'morning' | 'afternoon', time: string } | null>(null);
  const [bulkLateData, setBulkLateData] = useState<{ session: 'morning' | 'afternoon' | 'both', time: string } | null>(null);

  useEffect(() => {
    setTitle("Log Attendance");
  }, [setTitle]);

  useEffect(() => {
    if (employees) {
        const dailyAttendance: DailyAttendance[] = employees.map((emp) => {
            const record = attendanceRecords?.find((r) => r.employeeId === emp.id);
            
            let morningStatus: AttendanceStatus = record?.morningStatus || "Absent";
            let afternoonStatus: AttendanceStatus = record?.afternoonStatus || "Absent";
            let morningEntry = record?.morningEntry || "";
            let afternoonEntry = record?.afternoonEntry || "";

            return {
                employeeId: emp.id,
                employeeName: emp.name,
                morningStatus: morningStatus,
                afternoonStatus: afternoonStatus,
                morningEntry: morningEntry,
                afternoonEntry: afternoonEntry,
                overtimeHours: record?.overtimeHours || 0,
            };
        });
        setAttendance(dailyAttendance);
    }
  }, [employees, attendanceRecords, selectedDate]);

  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedIds(new Set()); // Reset selection on date change
  }, []);

  const saveAttendanceBatch = async (attendanceDataList: DailyAttendance[]) => {
    if (!firestore) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const batch = writeBatch(firestore);

    attendanceDataList.forEach((att) => {
      const recordRef = doc(firestore, 'attendance', dateStr, 'records', att.employeeId);
      const employeeAttendanceRef = doc(firestore, 'employees', att.employeeId, 'attendance', dateStr);
      
      const record: Partial<AttendanceRecord> = {
          employeeId: att.employeeId,
          date: selectedDate.toISOString(),
          morningStatus: att.morningStatus,
          afternoonStatus: att.afternoonStatus,
          morningEntry: att.morningEntry || "",
          afternoonEntry: att.afternoonEntry || "",
          overtimeHours: att.overtimeHours || 0,
      };
      
      batch.set(recordRef, record, { merge: true });
      batch.set(employeeAttendanceRef, record, { merge: true });
    });

    try {
        await batch.commit();
        toast({ title: attendanceDataList.length > 1 ? `${attendanceDataList.length} records updated!` : "Attendance saved!" });
        setAttendance((prev) =>
          prev.map((a) => {
            const updated = attendanceDataList.find(u => u.employeeId === a.employeeId);
            return updated ? updated : a;
          })
        );
      } catch(e) {
        toast({ variant: 'destructive', title: "Save failed", description: "You don't have permission to perform this action." });
      };
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)));
    }
  };

  const handleBulkStatusUpdate = async (session: 'morning' | 'afternoon' | 'both', status: AttendanceStatus, lateTime?: string) => {
    if (selectedIds.size === 0 || !firestore) return;

    if (status === 'Late' && !lateTime) {
      setBulkLateData({ session, time: session === 'afternoon' ? '13:30' : '08:00' });
      setIsBulkLateDialogOpen(true);
      return;
    }

    const isSunday = getDay(selectedDate) === 0;
    const toUpdate: DailyAttendance[] = [];

    attendance.forEach(att => {
      if (selectedIds.has(att.employeeId)) {
        const employee = employees.find(e => e.id === att.employeeId);
        const isMonthly = employee?.paymentMethod === 'Monthly';

        // Skip monthly employees on Sunday
        if (isSunday && isMonthly) return;

        const updated = { ...att };
        
        if (session === 'morning' || session === 'both') {
          updated.morningStatus = status;
          updated.morningEntry = status === 'Late' ? (lateTime || "08:30") : ((status === 'Present' || status === 'Permission') ? "08:00" : "");
        }
        
        if (session === 'afternoon' || session === 'both') {
          updated.afternoonStatus = status;
          updated.afternoonEntry = status === 'Late' ? (lateTime || "14:00") : ((status === 'Present' || status === 'Permission') ? "13:30" : "");
        }

        if (updated.morningStatus === 'Absent' && updated.afternoonStatus === 'Absent') {
          updated.overtimeHours = 0;
        }

        toUpdate.push(updated);
      }
    });

    if (toUpdate.length === 0) {
      toast({ variant: 'destructive', title: "No records updated", description: "Selected employees couldn't be updated (e.g. Monthly employees on Sunday)." });
      return;
    }

    await saveAttendanceBatch(toUpdate);
    setSelectedIds(new Set());
    setIsBulkLateDialogOpen(false);
    setBulkLateData(null);
  };

  const openAttendanceDialog = (employeeId: string) => {
    const employeeData = attendance.find((att) => att.employeeId === employeeId);
    if (employeeData) {
      setSelectedEmployeeAttendance({ ...employeeData });
      setIsAttendanceDialogOpen(true);
    }
  };

  const openOvertimeDialog = (employeeId: string) => {
    const employeeData = attendance.find((att) => att.employeeId === employeeId);
    if (employeeData) {
      setSelectedEmployeeAttendance({ ...employeeData });
      setIsOvertimeDialogOpen(true);
    }
  };

  const handleStatusClick = async (session: 'morning' | 'afternoon', status: AttendanceStatus) => {
      if (!selectedEmployeeAttendance || !firestore) return;

      const employee = employees?.find(e => e.id === selectedEmployeeAttendance.employeeId);
      const isMonthly = employee?.paymentMethod === 'Monthly';
      const isSunday = getDay(selectedDate) === 0;

      if (isSunday && isMonthly) {
          toast({ variant: 'destructive', title: "Cannot Change", description: "Attendance for monthly employees on Sundays cannot be changed."});
          return;
      }

      if (status === 'Late') {
          setLateDialogData({ session, time: session === 'morning' ? '08:00' : '13:30' });
          setIsLateDialogOpen(true);
          return;
      }

      const updatedAttendance = { ...selectedEmployeeAttendance };
      let entryTime = "";
      if (status === 'Present' || status === 'Permission') {
          entryTime = session === 'morning' ? '08:00' : '13:30';
      }

      if (session === 'morning') {
          updatedAttendance.morningStatus = status;
          updatedAttendance.morningEntry = entryTime;
      } else {
          updatedAttendance.afternoonStatus = status;
          updatedAttendance.afternoonEntry = entryTime;
      }

      if (updatedAttendance.morningStatus === 'Absent' && updatedAttendance.afternoonStatus === 'Absent') {
          updatedAttendance.overtimeHours = 0;
      }

      await saveAttendanceBatch([updatedAttendance]);
      setSelectedEmployeeAttendance(updatedAttendance);
      setIsAttendanceDialogOpen(false);
  };

  const handleSaveLateTime = async () => {
    if (!selectedEmployeeAttendance || !lateDialogData || !firestore) return;

    const updatedAttendance = { ...selectedEmployeeAttendance };
    if (lateDialogData.session === 'morning') {
        updatedAttendance.morningStatus = 'Late';
        updatedAttendance.morningEntry = lateDialogData.time;
    } else {
        updatedAttendance.afternoonStatus = 'Late';
        updatedAttendance.afternoonEntry = lateDialogData.time;
    }
    
    await saveAttendanceBatch([updatedAttendance]);
    
    setIsLateDialogOpen(false);
    setIsAttendanceDialogOpen(false);
    setLateDialogData(null);
    setSelectedEmployeeAttendance(null);
  };
  
  const handleOvertimeInputChange = (value: number) => {
      if(selectedEmployeeAttendance) {
          setSelectedEmployeeAttendance({ ...selectedEmployeeAttendance, overtimeHours: value });
      }
  };

  const handleSaveOvertime = async () => {
    if (!selectedEmployeeAttendance || !firestore) return;
    await saveAttendanceBatch([selectedEmployeeAttendance]);
    setIsOvertimeDialogOpen(false);
    setSelectedEmployeeAttendance(null);
  };

  const selectedEmployeeDetails: Employee | undefined = useMemo(() => {
      if (!isUserLoading && employees) {
        return employees.find(e => e.id === selectedEmployeeAttendance?.employeeId);
      }
      return undefined;
  }, [selectedEmployeeAttendance, employees, isUserLoading]);

  const isSundayAndShouldBeDisabled = getDay(selectedDate) === 0 && selectedEmployeeDetails?.paymentMethod === 'Monthly';

  if (employeesLoading || isUserLoading) {
      return <div>Loading...</div>
  }
  
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="flex justify-center">
              <HorizontalDatePicker 
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
              />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card className="relative overflow-hidden">
            {selectedIds.size > 0 && (
              <div className="absolute top-0 left-0 right-0 z-20 bg-primary text-primary-foreground p-3 flex items-center justify-between animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-3">
                  <Checkbox 
                    checked={selectedIds.size === employees.length} 
                    onCheckedChange={toggleSelectAll} 
                    className="border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
                  />
                  <span className="text-sm font-bold">{selectedIds.size} Selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="sm" className="h-8 font-bold">
                        Actions <MoreHorizontal className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Log Status for Selection</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      
                      {/* AM Submenu */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Sunrise className="mr-2 h-4 w-4 text-orange-500" />
                          <span>Morning (AM)</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('morning', 'Present')}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Mark Present
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('morning', 'Late')}>
                              <Clock className="mr-2 h-4 w-4 text-amber-500" /> Mark Late
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('morning', 'Absent')}>
                              <XCircle className="mr-2 h-4 w-4 text-destructive" /> Mark Absent
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>

                      {/* PM Submenu */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Sun className="mr-2 h-4 w-4 text-amber-500" />
                          <span>Afternoon (PM)</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('afternoon', 'Present')}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Mark Present
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('afternoon', 'Late')}>
                              <Clock className="mr-2 h-4 w-4 text-amber-500" /> Mark Late
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('afternoon', 'Absent')}>
                              <XCircle className="mr-2 h-4 w-4 text-destructive" /> Mark Absent
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>

                      <DropdownMenuSeparator />
                      
                      {/* Both Submenu */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="font-bold">
                          <span>Full Day</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('both', 'Present')}>
                               <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Mark Both Present
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('both', 'Late')}>
                               <Clock className="mr-2 h-4 w-4 text-amber-500" /> Mark Both Late
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusUpdate('both', 'Absent')}>
                               <XCircle className="mr-2 h-4 w-4 text-destructive" /> Mark Both Absent
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedIds(new Set())}
                    className="h-8 text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <CardHeader className={cn(selectedIds.size > 0 && "opacity-0 transition-opacity")}>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    Employee Attendance for {format(selectedDate, "PPP")}
                  </CardTitle>
                  <CardDescription>
                    {ethiopianDateFormatter(selectedDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="gap-2 font-bold text-xs uppercase text-muted-foreground">
                   {selectedIds.size === employees.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                   {selectedIds.size === employees.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
                {attendanceLoading && <p>Loading attendance...</p>}
                {!attendanceLoading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                      {attendance.length > 0 ? (
                        attendance.map((att) => {
                            const isSelected = selectedIds.has(att.employeeId);
                            return (
                                <div key={att.employeeId} className="flex items-center gap-3">
                                    <Checkbox 
                                      checked={isSelected} 
                                      onCheckedChange={() => toggleSelect(att.employeeId)}
                                      className="shrink-0"
                                    />
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <button onClick={() => openAttendanceDialog(att.employeeId)} className="text-left flex-1 min-w-0">
                                            <Card className={cn(
                                              "hover:bg-accent transition-all duration-200",
                                              isSelected && "border-primary bg-primary/5 shadow-sm"
                                            )}>
                                                <CardContent className="flex items-center justify-between p-3 sm:p-4 gap-2">
                                                    <p className="font-bold text-sm sm:text-base truncate">{att.employeeName}</p>
                                                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                                        <StatusBadge status={att.morningStatus} session="AM" />
                                                        <StatusBadge status={att.afternoonStatus} session="PM" />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </button>
                                        <Button variant="outline" size="icon" className="shrink-0 h-10 w-10 sm:h-12 sm:w-12" onClick={() => openOvertimeDialog(att.employeeId)} aria-label="Log Overtime">
                                            <Plus className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                </div>
                            )
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground col-span-2">No active employees found.</p>
                      )}
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <div className="bg-primary/5 p-6 border-b">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {selectedEmployeeAttendance?.employeeName}
              </DialogTitle>
              <DialogDescription>
                Log attendance for {format(selectedDate, "PPPP")}
              </DialogDescription>
            </DialogHeader>
          </div>
          {selectedEmployeeAttendance && (
            <div className="p-6 space-y-8">
              {/* Morning Session */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    <Sunrise className="h-4 w-4 text-orange-500" />
                    Morning Session
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedEmployeeAttendance.morningStatus)}
                    {selectedEmployeeAttendance.morningEntry && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {selectedEmployeeAttendance.morningEntry}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedEmployeeAttendance.morningStatus === 'Present' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('morning', 'Present')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Present' ? "bg-primary-foreground" : "bg-green-500")} />
                    Present
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.morningStatus === 'Late' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('morning', 'Late')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Late' ? "bg-primary-foreground" : "bg-amber-500")} />
                    Late
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.morningStatus === 'Absent' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('morning', 'Absent')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Absent' ? "bg-primary-foreground" : "bg-destructive")} />
                    Absent
                  </Button>
                  {selectedEmployeeDetails?.paymentMethod === 'Monthly' && (
                    <Button 
                      variant={selectedEmployeeAttendance.morningStatus === 'Permission' ? 'default' : 'outline'} 
                      className="h-12 justify-start gap-3"
                      onClick={() => handleStatusClick('morning', 'Permission')}
                      disabled={isSundayAndShouldBeDisabled}
                    >
                      <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.morningStatus === 'Permission' ? "bg-primary-foreground" : "bg-blue-500")} />
                      Permission
                    </Button>
                  )}
                </div>
              </div>

              {/* Afternoon Session */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    <Sun className="h-4 w-4 text-amber-500" />
                    Afternoon Session
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedEmployeeAttendance.afternoonStatus)}
                    {selectedEmployeeAttendance.afternoonEntry && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {selectedEmployeeAttendance.afternoonEntry}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedEmployeeAttendance.afternoonStatus === 'Present' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('afternoon', 'Present')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Present' ? "bg-primary-foreground" : "bg-green-500")} />
                    Present
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.afternoonStatus === 'Late' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('afternoon', 'Late')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Late' ? "bg-primary-foreground" : "bg-amber-500")} />
                    Late
                  </Button>
                  <Button 
                    variant={selectedEmployeeAttendance.afternoonStatus === 'Absent' ? 'default' : 'outline'} 
                    className="h-12 justify-start gap-3"
                    onClick={() => handleStatusClick('afternoon', 'Absent')}
                    disabled={isSundayAndShouldBeDisabled}
                  >
                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Absent' ? "bg-primary-foreground" : "bg-destructive")} />
                    Absent
                  </Button>
                  {selectedEmployeeDetails?.paymentMethod === 'Monthly' && (
                    <Button 
                      variant={selectedEmployeeAttendance.afternoonStatus === 'Permission' ? 'default' : 'outline'} 
                      className="h-12 justify-start gap-3"
                      onClick={() => handleStatusClick('afternoon', 'Permission')}
                      disabled={isSundayAndShouldBeDisabled}
                    >
                      <div className={cn("w-2 h-2 rounded-full", selectedEmployeeAttendance.afternoonStatus === 'Permission' ? "bg-primary-foreground" : "bg-blue-500")} />
                      Permission
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      <Dialog open={isLateDialogOpen} onOpenChange={setIsLateDialogOpen}>
          <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                  <DialogTitle>Enter Late Entry Time</DialogTitle>
              </DialogHeader>
              <Input 
                  id="lateTime"
                  type="time"
                  value={lateDialogData?.time}
                  onChange={(e) => setLateDialogData(prev => prev ? {...prev, time: e.target.value} : null)}
              />
              <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={handleSaveLateTime}>Save Time</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={isBulkLateDialogOpen} onOpenChange={setIsBulkLateDialogOpen}>
          <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                  <DialogTitle>Enter Bulk Late Time</DialogTitle>
                  <DialogDescription>Marking {selectedIds.size} employees late for {bulkLateData?.session === 'both' ? 'full day' : bulkLateData?.session === 'morning' ? 'morning' : 'afternoon'}.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <Label htmlFor="bulkLateTime">Common Entry Time</Label>
                  <Input 
                      id="bulkLateTime"
                      type="time"
                      value={bulkLateData?.time}
                      onChange={(e) => setBulkLateData(prev => prev ? {...prev, time: e.target.value} : null)}
                  />
              </div>
              <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={() => bulkLateData && handleBulkStatusUpdate(bulkLateData.session, 'Late', bulkLateData.time)}>Apply to Selected</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={isOvertimeDialogOpen} onOpenChange={setIsOvertimeDialogOpen}>
          <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                  <DialogTitle>Log Overtime</DialogTitle>
                  <DialogDescription>For {selectedEmployeeAttendance?.employeeName}</DialogDescription>
              </DialogHeader>
               <div className="grid gap-4 py-4">
                  <Label htmlFor="overtime">Overtime Hours</Label>
                  <Input 
                      id="overtime"
                      type="number"
                      min="0"
                      value={selectedEmployeeAttendance?.overtimeHours || 0}
                      onChange={(e) => handleOvertimeInputChange(Number(e.target.value))}
                  />
              </div>
              <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={handleSaveOvertime}>Save Overtime</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
