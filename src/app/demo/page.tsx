
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { employees, attendanceRecords } from '@/lib/data';
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
import { Users, UserCheck, Wallet, UserX, Clock, Hand, LayoutDashboard, CalendarCheck } from "lucide-react";
import { PayrollHistoryChart } from '../payroll/payroll-history-chart';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { StatCard } from '@/components/stat-card';
import { PayrollList } from '../payroll/payroll-list';


// --- MOCK DATA & HELPERS ---
const MOCK_TODAY = subDays(new Date(), 1);

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

const StatusListItem = ({ employee, status, detail }: { employee: Employee, status: AttendanceStatus, detail?: string }) => (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
        <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9"><AvatarFallback>{getInitials(employee.name)}</AvatarFallback></Avatar>
            <div><p className="font-medium">{employee.name}</p><p className="text-sm text-muted-foreground">{employee.position}</p></div>
        </div>
        <div className="text-sm text-right">
            <Badge variant={status === 'Late' || status === 'Absent' ? 'destructive' : status === 'Permission' ? 'default' : 'secondary'} className="capitalize">{status}</Badge>
            {detail && <p className="text-muted-foreground mt-1">{detail}</p>}
        </div>
    </div>
);

const AttendanceContent = ({ status }: { status: any }) => (
    <Card>
        <CardHeader>
            <CardTitle>Today's Status</CardTitle>
            <CardDescription>Based on mock data for {format(MOCK_TODAY, 'PPP')}</CardDescription>
        </CardHeader>
        <CardContent>
             <Tabs defaultValue="absent">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="absent"><UserX className="mr-2 h-4 w-4" /> Absent ({status.absent.length})</TabsTrigger>
                    <TabsTrigger value="late"><Clock className="mr-2 h-4 w-4" /> Late ({status.late.length})</TabsTrigger>
                    <TabsTrigger value="permission"><Hand className="mr-2 h-4 w-4" /> Permission ({status.permission.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="absent" className="mt-4">
                    {status.absent.length > 0 ? status.absent.map((item: any) => <StatusListItem key={item.employee.id} employee={item.employee} status="Absent" detail={item.period} />) : <p className="text-muted-foreground text-center py-8 text-sm">No one is absent today.</p>}
                </TabsContent>
                <TabsContent value="late" className="mt-4">
                    {status.late.length > 0 ? status.late.map((item: any) => <StatusListItem key={item.employee.id} employee={item.employee} status="Late" detail={item.time} />) : <p className="text-muted-foreground text-center py-8 text-sm">No one is late today.</p>}
                </TabsContent>
                <TabsContent value="permission" className="mt-4">
                    {status.permission.length > 0 ? status.permission.map((item: any) => <StatusListItem key={item.employee.id} employee={item.employee} status="Permission" detail={item.period} />) : <p className="text-muted-foreground text-center py-8 text-sm">No one is on leave today.</p>}
                </TabsContent>
            </Tabs>
        </CardContent>
    </Card>
);

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
    
    const todayStatus = useMemo(() => {
        if (!todayAttendance || !employees) return { absent: [], late: [], permission: [] };
        const absent: { employee: Employee, period: string }[] = [];
        const late: { employee: Employee; time: string }[] = [];
        const permission: { employee: Employee, period: string }[] = [];
        employees.forEach(emp => {
            const record = todayAttendance.find(r => r.employeeId === emp.id);
            if (!record || (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent')) {
                absent.push({ employee: emp, period: 'Full Day' });
            } else if (record.morningStatus === 'Late' || record.afternoonStatus === 'Late') {
                const lateTimes: string[] = [];
                if (record.morningStatus === 'Late' && record.morningEntry) lateTimes.push(record.morningEntry);
                if (record.afternoonStatus === 'Late' && record.afternoonEntry) lateTimes.push(record.afternoonEntry);
                late.push({ employee: emp, time: lateTimes.join(' & ') });
            } else if (record.morningStatus === 'Permission' || record.afternoonStatus === 'Permission') {
                let period = record.morningStatus === 'Permission' && record.afternoonStatus === 'Permission' ? 'Full Day' : record.morningStatus === 'Permission' ? 'Morning' : 'Afternoon';
                permission.push({ employee: emp, period });
            }
        });
        return { absent, late, permission };
    }, [todayAttendance, employees]);

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
            case 'attendance': return <AttendanceContent status={todayStatus} />;
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
