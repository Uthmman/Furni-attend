
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Employee, AttendanceRecord, AttendanceStatus, PayrollEntry } from "@/lib/types";

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { format, subDays, startOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, subMonths, isSameDay, endOfWeek, isValid } from "date-fns";
import { Users, UserCheck, Wallet, UserX, Clock, Hand, LayoutDashboard, CalendarCheck, Plus } from "lucide-react";
import { PayrollHistoryChart } from '../payroll/payroll-history-chart';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { StatCard } from '@/components/stat-card';
import { PayrollList } from '../payroll/payroll-list';
import { HorizontalDatePicker } from '@/components/ui/horizontal-date-picker';
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


// --- MOCK DATA & HELPERS ---
const MOCK_TODAY = subDays(new Date(), 1);

const employees: Employee[] = [
  {
    id: "EMP001",
    name: "Abebe Bekele",
    position: "Lead Carpenter",
    phone: "0911223344",
    paymentMethod: "Monthly",
    accountNumber: "1000123456789",
    monthlyRate: 15000,
    attendanceStartDate: subDays(MOCK_TODAY, 90).toISOString(),
  },
  {
    id: "EMP002",
    name: "Genet Tesfaye",
    position: "Upholstery Specialist",
    phone: "0922334455",
    paymentMethod: "Weekly",
    accountNumber: "1000987654321",
    dailyRate: 700,
    attendanceStartDate: subDays(MOCK_TODAY, 60).toISOString(),
  },
  {
    id: "EMP003",
    name: "Fikre Selam",
    position: "Finisher",
    phone: "0933445566",
    paymentMethod: "Weekly",
    accountNumber: "1000555555555",
    dailyRate: 650,
    attendanceStartDate: subDays(MOCK_TODAY, 120).toISOString(),
  },
];

const attendanceRecords: AttendanceRecord[] = [
  { id: 'ATT001', employeeId: "EMP001", date: MOCK_TODAY.toISOString(), morningEntry: "08:05", afternoonEntry: "13:35", morningStatus: "Present", afternoonStatus: "Present", overtimeHours: 1 },
  { id: 'ATT002', employeeId: "EMP002", date: MOCK_TODAY.toISOString(), morningEntry: "08:45", afternoonEntry: "13:30", morningStatus: "Late", afternoonStatus: "Present" },
  { id: 'ATT003', employeeId: "EMP003", date: MOCK_TODAY.toISOString(), morningStatus: "Absent", afternoonStatus: "Absent" },
  { id: 'ATT004', employeeId: "EMP001", date: subDays(MOCK_TODAY, 1).toISOString(), morningEntry: "08:00", afternoonEntry: "13:30", morningStatus: "Present", afternoonStatus: "Present" },
  { id: 'ATT005', employeeId: "EMP002", date: subDays(MOCK_TODAY, 1).toISOString(), morningEntry: "08:02", afternoonEntry: "13:31", morningStatus: "Present", afternoonStatus: "Present", overtimeHours: 2 },
  { id: 'ATT006', employeeId: "EMP003", date: subDays(MOCK_TODAY, 1).toISOString(), morningEntry: "07:58", afternoonEntry: "13:29", morningStatus: "Present", afternoonStatus: "Present" },
  { id: 'ATT007', employeeId: "EMP001", date: subDays(MOCK_TODAY, 2).toISOString(), morningStatus: "Permission", afternoonStatus: "Permission" },
  { id: 'ATT008', employeeId: "EMP002", date: subDays(MOCK_TODAY, 2).toISOString(), morningEntry: "08:05", afternoonEntry: "13:40", morningStatus: "Present", afternoonStatus: "Present" },
  { id: 'ATT009', employeeId: "EMP003", date: subDays(MOCK_TODAY, 2).toISOString(), morningEntry: "08:20", afternoonEntry: "13:35", morningStatus: "Late", afternoonStatus: "Present" },
];


const getDateFromRecord = (date: string | any): Date => {
  if (date?.toDate) return date.toDate();
  if (!date) return new Date();
  return new Date(date);
}

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  if (!isValid(date)) return "Invalid Date";
  try {
      return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
  } catch (e) {
      console.error("Error formatting Ethiopian date:", e);
      return "Invalid Date";
  }
};

const toEthiopian = (date: Date) => {
    const ethiopicDate = new Intl.DateTimeFormat('en-US-u-ca-ethiopic', { year: 'numeric', month: 'numeric', day: 'numeric' });
    const parts = ethiopicDate.formatToParts(date);
    let day = '1', month = '1', year = '1970';
    for (const part of parts) {
        if (part.type === 'day') day = part.value;
        if (part.type === 'month') month = part.value;
        if (part.type === 'year') year = part.value;
    }
    return {
        day: parseInt(day),
        month: parseInt(month),
        year: parseInt(year),
    };
};

const getEthiopianMonthDays = (year: number, month: number): number => {
    if (month < 1 || month > 13) return 0;
    if (month <= 12) return 30;
    const isLeap = (year + 1) % 4 === 0;
    return isLeap ? 6 : 5;
};

const toGregorian = (ethYear: number, ethMonth: number, ethDay: number): Date => {
    const today = new Date();
    const ethToday = toEthiopian(today);
    const dayDiff = ((ethYear - ethToday.year) * 365.25) + ((ethMonth - ethToday.month) * 30) + (ethDay - ethToday.day);
    return addDays(today, Math.round(dayDiff));
};

const calculateHoursWorked = (record: AttendanceRecord): number => {
    if (!record) return 0;
    const recordDate = getDateFromRecord(record.date);
    if (getDay(recordDate) === 0) return record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent' ? 8 : 0;
    if (getDay(recordDate) === 6) return record.afternoonStatus !== 'Absent' ? 4.5 : 0;
    if (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent') return 0;
    
    let totalHours = 0;
    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());
    
    if (record.morningStatus !== 'Absent' && record.morningEntry) {
        const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
        if(isValid(morningEntryTime) && morningEntryTime < morningEndTime)
            totalHours += (morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime())) / 3600000;
    }
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
        if(isValid(afternoonEntryTime) && afternoonEntryTime < afternoonEndTime)
            totalHours += (afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime())) / 3600000;
    }
    return Math.max(0, totalHours);
};

const calculateMinutesLate = (record: AttendanceRecord): number => {
    if (!record) return 0;
    let minutesLate = 0;
    if (record.morningStatus === 'Late' && record.morningEntry) {
        const morningStartTime = parse("08:00", "HH:mm", new Date());
        const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
        if (isValid(morningEntryTime) && morningEntryTime > morningStartTime) minutesLate += (morningEntryTime.getTime() - morningStartTime.getTime()) / 60000;
    }
    if (record.afternoonStatus === 'Late' && record.afternoonEntry) {
        const afternoonStartTime = parse("13:30", "HH:mm", new Date());
        const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
        if (isValid(afternoonEntryTime) && afternoonEntryTime > afternoonStartTime) minutesLate += (afternoonEntryTime.getTime() - afternoonStartTime.getTime()) / 60000;
    }
    return Math.round(minutesLate);
};

const getInitials = (name: string) => {
    if (!name) return "";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
};

const mockNavLinks = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "employees", label: "Employees", icon: Users },
    { id: "attendance", label: "Attendance", icon: CalendarCheck },
    { id: "payroll", label: "Payroll", icon: Wallet },
];

// --- Attendance Demo Types & Helpers ---
type DailyAttendance = {
  employeeId: string;
  employeeName: string;
  morningStatus: AttendanceStatus;
  afternoonStatus: AttendanceStatus;
  morningEntry?: string;
  afternoonEntry?: string;
  overtimeHours?: number;
};

const getStatusVariant = (status: AttendanceStatus) => {
  switch (status) {
    case "Permission": return "default";
    case "Present":
    case "Late": return "secondary";
    case "Absent": return "destructive";
    default: return "outline";
  }
};

const getOverallStatus = (morning: AttendanceStatus, afternoon: AttendanceStatus): AttendanceStatus => {
    if (morning === 'Permission' || afternoon === 'Permission') return 'Permission';
    if (morning === 'Absent' && afternoon === 'Absent') return 'Absent';
    if (morning === 'Late' || afternoon === 'Late') return 'Late';
    if (morning === 'Present' || afternoon === 'Present') return 'Present';
    return 'Absent';
}


// --- CONTENT COMPONENTS ---

const DashboardContent = ({ stats, history }: { stats: any, history: any[] }) => (
    <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatCard title="Total Employees" value={stats.totalEmployees} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard title="On-site Today" value={`${stats.onSiteToday} / ${stats.totalEmployees}`} icon={<UserCheck className="h-5 w-5 text-muted-foreground" />} />
            <StatCard title="This Week's Payroll" value={`ETB ${stats.actualWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<Wallet className="h-5 w-5 text-muted-foreground" />} description={`Est: ETB ${stats.estWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <StatCard title="This Month's Payroll" value={`ETB ${stats.actualMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<Wallet className="h-5 w-5 text-muted-foreground" />} description={`Est: ETB ${stats.estMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Payroll History</CardTitle>
                <CardDescription>Total payroll expenses for the last 6 months.</CardDescription>
            </CardHeader>
            <CardContent>
                <PayrollHistoryChart data={history} />
            </CardContent>
        </Card>
    </div>
);

const EmployeesContent = ({ employees }: { employees: Employee[] }) => (
    <Card>
        <CardHeader>
            <CardTitle>Employees</CardTitle>
            <CardDescription>A list of sample employees.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow><TableHead>Employee</TableHead><TableHead>Payment Method</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                    {employees.map((employee) => (
                        <TableRow key={employee.id}>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <Avatar className="hidden h-9 w-9 sm:flex"><AvatarFallback>{getInitials(employee.name)}</AvatarFallback></Avatar>
                                    <div>
                                        <p className="font-medium leading-none">{employee.name}</p>
                                        <p className="text-xs text-muted-foreground">{employee.position}</p>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell><Badge variant="outline">{employee.paymentMethod}</Badge></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
);

const DemoAttendanceContent = () => {
    const [demoAttendance, setDemoAttendance] = useState<DailyAttendance[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date>(MOCK_TODAY);
    const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
    const [isLateDialogOpen, setIsLateDialogOpen] = useState(false);
    const [isOvertimeDialogOpen, setIsOvertimeDialogOpen] = useState(false);
    const [selectedEmployeeAttendance, setSelectedEmployeeAttendance] = useState<DailyAttendance | null>(null);
    const [lateDialogData, setLateDialogData] = useState<{ session: 'morning' | 'afternoon', time: string } | null>(null);

    useEffect(() => {
        const dailyAttendance: DailyAttendance[] = employees.map((emp) => {
            const record = attendanceRecords?.find((r) => r.employeeId === emp.id && isSameDay(getDateFromRecord(r.date), selectedDate));
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
        setDemoAttendance(dailyAttendance);
    }, [selectedDate]);

    const handleDateSelect = useCallback((date: Date | undefined) => {
        if (!date) return;
        setSelectedDate(date);
    }, []);

    const saveDemoAttendance = async (attendanceData: DailyAttendance) => {
        setDemoAttendance((prev) =>
          prev.map((a) => (a.employeeId === attendanceData.employeeId ? attendanceData : a))
        );
    };

    const openAttendanceDialog = (employeeId: string) => {
        const employeeData = demoAttendance.find((att) => att.employeeId === employeeId);
        if (employeeData) {
            setSelectedEmployeeAttendance({ ...employeeData });
            setIsAttendanceDialogOpen(true);
        }
    };
    
    const openOvertimeDialog = (employeeId: string) => {
        const employeeData = demoAttendance.find((att) => att.employeeId === employeeId);
        if (employeeData) {
            setSelectedEmployeeAttendance({ ...employeeData });
            setIsOvertimeDialogOpen(true);
        }
    };

    const handleStatusClick = async (session: 'morning' | 'afternoon', status: AttendanceStatus) => {
        if (!selectedEmployeeAttendance) return;
        if (status === 'Late') {
            setLateDialogData({ session, time: session === 'morning' ? '08:00' : '13:30' });
            setIsLateDialogOpen(true);
            return;
        }

        const updatedAttendance = { ...selectedEmployeeAttendance };
        let entryTime = "";
        if (status === 'Present') entryTime = session === 'morning' ? '08:00' : '13:30';
        if (session === 'morning') {
            updatedAttendance.morningStatus = status;
            updatedAttendance.morningEntry = entryTime;
        } else {
            updatedAttendance.afternoonStatus = status;
            updatedAttendance.afternoonEntry = entryTime;
        }
        await saveDemoAttendance(updatedAttendance);
        setSelectedEmployeeAttendance(updatedAttendance);
        setIsAttendanceDialogOpen(false);
    };
    
    const handleSaveLateTime = async () => {
        if (!selectedEmployeeAttendance || !lateDialogData) return;
        const updatedAttendance = { ...selectedEmployeeAttendance };
        if (lateDialogData.session === 'morning') {
            updatedAttendance.morningStatus = 'Late';
            updatedAttendance.morningEntry = lateDialogData.time;
        } else {
            updatedAttendance.afternoonStatus = 'Late';
            updatedAttendance.afternoonEntry = lateDialogData.time;
        }
        await saveDemoAttendance(updatedAttendance);
        setIsLateDialogOpen(false);
        setIsAttendanceDialogOpen(false);
    };
    
    const handleSaveOvertime = async () => {
        if (!selectedEmployeeAttendance) return;
        await saveDemoAttendance(selectedEmployeeAttendance);
        setIsOvertimeDialogOpen(false);
    };
    
    const selectedEmployeeDetails = useMemo(() => {
        return employees.find(e => e.id === selectedEmployeeAttendance?.employeeId);
    }, [selectedEmployeeAttendance]);

    return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card><CardContent className="flex justify-center"><HorizontalDatePicker selectedDate={selectedDate} onDateSelect={handleDateSelect} /></CardContent></Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Employee Attendance for {format(selectedDate, "PPP")}</CardTitle>
              <CardDescription>{ethiopianDateFormatter(selectedDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                    {demoAttendance.map((att) => {
                        const overallStatus = getOverallStatus(att.morningStatus, att.afternoonStatus);
                        return (
                            <div key={att.employeeId} className="flex items-center gap-2">
                                <button onClick={() => openAttendanceDialog(att.employeeId)} className="text-left flex-1">
                                    <Card className="hover:bg-accent transition-colors">
                                        <CardContent className="flex items-center justify-between p-4">
                                            <p className="font-medium">{att.employeeName}</p>
                                            <Badge variant={getStatusVariant(overallStatus)} className="capitalize">{overallStatus}</Badge>
                                        </CardContent>
                                    </Card>
                                </button>
                                <Button variant="outline" size="icon" onClick={() => openOvertimeDialog(att.employeeId)} aria-label="Log Overtime"><Plus className="h-4 w-4"/></Button>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Log Attendance for {selectedEmployeeAttendance?.employeeName}</DialogTitle></DialogHeader>
          {selectedEmployeeAttendance && (
            <div className="grid gap-6 py-4">
              <div className="grid gap-2">
                  <Label>Morning</Label>
                  <div className="text-sm text-muted-foreground">Status: <Badge variant={getStatusVariant(selectedEmployeeAttendance.morningStatus)}>{selectedEmployeeAttendance.morningStatus}</Badge>{selectedEmployeeAttendance.morningEntry && ` at ${selectedEmployeeAttendance.morningEntry}`}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Present')}>Present</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Late')}>Late</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Absent')}>Absent</Button>
                      {selectedEmployeeDetails?.paymentMethod === 'Monthly' && <Button variant="outline" size="sm" onClick={() => handleStatusClick('morning', 'Permission')}>Permission</Button>}
                  </div>
              </div>
              <div className="grid gap-2">
                  <Label>Afternoon</Label>
                   <div className="text-sm text-muted-foreground">Status: <Badge variant={getStatusVariant(selectedEmployeeAttendance.afternoonStatus)}>{selectedEmployeeAttendance.afternoonStatus}</Badge>{selectedEmployeeAttendance.afternoonEntry && ` at ${selectedEmployeeAttendance.afternoonEntry}`}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Present')}>Present</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Late')}>Late</Button>
                      <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Absent')}>Absent</Button>
                      {selectedEmployeeDetails?.paymentMethod === 'Monthly' && <Button variant="outline" size="sm" onClick={() => handleStatusClick('afternoon', 'Permission')}>Permission</Button>}
                  </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      <Dialog open={isLateDialogOpen} onOpenChange={setIsLateDialogOpen}>
          <DialogContent className="sm:max-w-xs">
              <DialogHeader><DialogTitle>Enter Late Entry Time</DialogTitle></DialogHeader>
              <Input id="lateTime" type="time" value={lateDialogData?.time} onChange={(e) => setLateDialogData(prev => prev ? {...prev, time: e.target.value} : null)} />
              <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={handleSaveLateTime}>Save Time</Button>
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
                  <Input id="overtime" type="number" min="0" value={selectedEmployeeAttendance?.overtimeHours || 0} onChange={(e) => setSelectedEmployeeAttendance(prev => prev ? {...prev, overtimeHours: Number(e.target.value)} : null)} />
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


const PayrollContent = ({ weeklyPayroll, monthlyPayroll }: { weeklyPayroll: PayrollEntry[], monthlyPayroll: PayrollEntry[] }) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <PayrollList 
            title="Weekly Payout" 
            payrollData={weeklyPayroll}
            periodOptions={[]}
            selectedPeriod={undefined}
            onPeriodChange={() => {}}
        />
        <PayrollList 
            title="Monthly Payout" 
            payrollData={monthlyPayroll} 
            periodOptions={[]}
            selectedPeriod={undefined}
            onPeriodChange={() => {}}
        />
    </div>
);

// --- MAIN DEMO PAGE COMPONENT ---
export default function DemoPage() {
    const [activePage, setActivePage] = useState('dashboard');
    const hasMounted = useHasMounted();
    const isMobile = useIsMobile();
    const allAttendance = attendanceRecords;
    
    // Calculations from the previous demo page
    const todayAttendance = useMemo(() => allAttendance.filter(r => isSameDay(getDateFromRecord(r.date), MOCK_TODAY)), [allAttendance]);

    const dashboardStats = useMemo(() => {
        const totalEmployees = employees.length;
        const onSiteToday = todayAttendance.filter(r => r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent").length || 0;
        const ethToday = toEthiopian(MOCK_TODAY);
        const weekStart = startOfWeek(MOCK_TODAY, { weekStartsOn: 0 });
        const estWeekly = employees.reduce((acc, emp) => acc + (emp.paymentMethod === 'Weekly' && emp.dailyRate ? emp.dailyRate * 7 : 0), 0);
        const actualWeekly = employees.reduce((acc, emp) => {
            if (emp.paymentMethod !== 'Weekly') return acc;
            const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            if (!hourlyRate) return acc;
            const recordsInWeek = allAttendance.filter(r => r.employeeId === emp.id && isValid(new Date(r.date as string)) && isWithinInterval(new Date(r.date as string), { start: weekStart, end: MOCK_TODAY }));
            let hoursWorked = recordsInWeek.reduce((sum, r) => sum + calculateHoursWorked(r) + (r.overtimeHours || 0), 0);
            return acc + (hoursWorked * hourlyRate);
        }, 0);
        const monthStart = toGregorian(ethToday.year, ethToday.month, 1);
        const estMonthly = employees.reduce((acc, emp) => acc + (emp.paymentMethod === 'Monthly' && emp.monthlyRate ? emp.monthlyRate : 0), 0);
        const actualMonthly = employees.reduce((acc, emp) => {
            if (emp.paymentMethod !== 'Monthly') return acc;
            const baseSalary = emp.monthlyRate || 0;
            if (baseSalary === 0) return acc;
            const dailyRate = baseSalary / 23.625;
            const hourlyRate = dailyRate / 8;
            const minuteRate = hourlyRate / 60;
            const recordsInMonth = allAttendance.filter(r => r.employeeId === emp.id && isValid(getDateFromRecord(r.date)) && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: MOCK_TODAY }));
            let totalHoursAbsent = 0;
            const minutesLate = recordsInMonth.reduce((sum, r) => sum + calculateMinutesLate(r), 0);
            const recordedDates = new Set(recordsInMonth.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
            eachDayOfInterval({ start: monthStart, end: MOCK_TODAY }).forEach(day => {
                if (getDay(day) !== 0 && !recordedDates.has(format(day, 'yyyy-MM-dd'))) totalHoursAbsent += (getDay(day) === 6) ? 4.5 : 8;
            });
            const absenceDeduction = totalHoursAbsent * hourlyRate;
            const lateDeduction = minutesLate * minuteRate;
            return acc + (baseSalary - absenceDeduction - lateDeduction);
        }, 0);
        return { totalEmployees, onSiteToday, estWeekly, actualWeekly, estMonthly, actualMonthly };
    }, [employees, allAttendance, todayAttendance]);
    
    const payrollHistory = useMemo(() => {
        if (!employees || allAttendance.length === 0) return [];
        const history = [];
        for (let i = 5; i >= 0; i--) {
            const monthDate = subMonths(new Date(), i);
            const ethDateForMonth = toEthiopian(monthDate);
            const monthStart = toGregorian(ethDateForMonth.year, ethDateForMonth.month, 1);
            const monthEnd = addDays(monthStart, getEthiopianMonthDays(ethDateForMonth.year, ethDateForMonth.month) - 1);
            let totalPayrollForMonth = 0;
            employees.forEach(employee => {
                const employeeAttendance = allAttendance.filter(r => r.employeeId === employee.id && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd }));
                if (employee.paymentMethod === 'Monthly') {
                    totalPayrollForMonth += employee.monthlyRate || 0;
                } else {
                    const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
                    if (!hourlyRate) return;
                    const totalHours = employeeAttendance.reduce((acc, r) => acc + calculateHoursWorked(r) + (r.overtimeHours || 0), 0);
                    totalPayrollForMonth += totalHours * hourlyRate;
                }
            });
            history.push({ month: format(monthStart, 'MMM'), total: totalPayrollForMonth });
        }
        return history;
    }, [employees, allAttendance]);

     const weeklyPayroll = useMemo(() => {
        const weekly: PayrollEntry[] = [];
        const weekStart = startOfWeek(MOCK_TODAY, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
        employees.filter(e => e.paymentMethod === 'Weekly').forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
            if (!hourlyRate) return;
            const records = allAttendance.filter(r => r.employeeId === employee.id && isWithinInterval(getDateFromRecord(r.date), { start: weekStart, end: weekEnd }));
            const totalHours = records.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
            const overtimeHours = records.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
            weekly.push({
                employeeId: employee.id, employeeName: employee.name, paymentMethod: "Weekly", period: "", amount: (totalHours + overtimeHours) * hourlyRate, status: 'Unpaid',
            });
        });
        return weekly;
    }, [employees, allAttendance]);
  
    const monthlyPayroll = useMemo(() => {
        const monthly: PayrollEntry[] = [];
        const ethDate = toEthiopian(MOCK_TODAY);
        const monthStart = toGregorian(ethDate.year, ethDate.month, 1);
        const monthEnd = addDays(monthStart, getEthiopianMonthDays(ethDate.year, ethDate.month) - 1);
        employees.filter(e => e.paymentMethod === 'Monthly').forEach(employee => {
            const baseSalary = employee.monthlyRate || 0;
            if (!baseSalary) return;
            const records = allAttendance.filter(r => r.employeeId === employee.id && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd }));
            monthly.push({
                employeeId: employee.id, employeeName: employee.name, paymentMethod: "Monthly", period: "", amount: baseSalary, status: 'Unpaid',
            });
        });
        return monthly;
    }, [employees, allAttendance]);


    const renderContent = () => {
        switch(activePage) {
            case 'dashboard': return <DashboardContent stats={dashboardStats} history={payrollHistory} />;
            case 'employees': return <EmployeesContent employees={employees} />;
            case 'attendance': return <DemoAttendanceContent />;
            case 'payroll': return <PayrollContent weeklyPayroll={weeklyPayroll} monthlyPayroll={monthlyPayroll} />;
            default: return <DashboardContent stats={dashboardStats} history={payrollHistory} />;
        }
    };
    
    if (!hasMounted) {
        return (
             <div className="flex h-screen w-full items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" role="status">
                    <span className="sr-only">Loading...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen w-full bg-background">
            {/* Mock Desktop Sidebar */}
            {!isMobile && (
                <aside className="flex flex-col w-64 border-r">
                    <div className="flex items-center gap-3 p-4 border-b h-16">
                        <Logo className="w-8 h-8 text-primary" />
                        <p className="font-headline text-lg font-bold">FurnishWise</p>
                    </div>
                    <div className="p-2 flex-1">
                        {mockNavLinks.map(link => (
                            <Button 
                                key={link.id} 
                                variant={activePage === link.id ? 'secondary' : 'ghost'} 
                                onClick={() => setActivePage(link.id)}
                                className="w-full justify-start gap-2"
                            >
                                <link.icon className="h-5 w-5" />
                                <span>{link.label}</span>
                            </Button>
                        ))}
                    </div>
                </aside>
            )}
            
            <div className="flex flex-col w-full">
                {/* Mock Header */}
                <header className="flex h-16 shrink-0 items-center gap-4 px-4 md:px-6 border-b">
                    <h1 className="flex-1 text-2xl font-bold tracking-tight">
                        {mockNavLinks.find(l => l.id === activePage)?.label} (Demo)
                    </h1>
                    <Avatar className="h-10 w-10">
                        <AvatarFallback>AD</AvatarFallback>
                    </Avatar>
                </header>

                <main className="flex-1 p-4 md:p-6 pb-24 md:pb-8">
                    {renderContent()}
                </main>
            </div>

            {/* Mock Mobile Nav */}
            {isMobile && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
                    <div className="bg-background border-t">
                        <nav className="flex justify-around items-center p-2">
                        {mockNavLinks.map((link) => (
                            <button
                                key={link.id}
                                onClick={() => setActivePage(link.id)}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-colors duration-200",
                                    activePage === link.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                                )}
                                style={{ minWidth: '64px' }}
                            >
                                <link.icon className="h-6 w-6" />
                                <span className={cn("text-xs font-medium", activePage === link.id ? "block" : "hidden")}>
                                    {link.label}
                                </span>
                            </button>
                        ))}
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
}

// Custom hook to ensure we're on the client before using client-side hooks like useIsMobile
function useHasMounted() {
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => {
        setHasMounted(true);
    }, []);
    return hasMounted;
}
// Local Tabs implementation to avoid dependency on real routing
const Tabs = ({ defaultValue, children }: { defaultValue: string, children: React.ReactNode[] }) => {
    const [activeTab, setActiveTab] = useState(defaultValue);
    const list = children.find((c: any) => c.type === TabsList);
    const content = children.filter((c: any) => c.type === TabsContent);
    return (
        <div>
            {React.cloneElement(list as React.ReactElement, { activeTab, setActiveTab })}
            {content.find((c: any) => c.props.value === activeTab)}
        </div>
    );
};
const TabsList = ({ children, activeTab, setActiveTab }: { children: React.ReactNode[], activeTab: string, setActiveTab: (v: string) => void }) => (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
        {React.Children.map(children, (child: any) => React.cloneElement(child, { activeTab, setActiveTab }))}
    </div>
);
const TabsTrigger = ({ children, value, activeTab, setActiveTab }: { children: React.ReactNode, value: string, activeTab: string, setActiveTab: (v: string) => void }) => (
    <button
        onClick={() => setActiveTab(value)}
        className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
            activeTab === value ? "bg-background text-foreground shadow-sm" : ""
        )}
    >{children}</button>
);
const TabsContent = ({ children, value }: { children: React.ReactNode, value: string }) => (
    <div className="mt-2">{children}</div>
);


    