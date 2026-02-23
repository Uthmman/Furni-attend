
'use client';

import { useMemo, useEffect } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, UserX, Clock, Hand } from "lucide-react";
import type { Employee, AttendanceRecord, AttendanceStatus } from "@/lib/types";
import { 
    format, 
    isValid, 
    startOfWeek, 
    isWithinInterval, 
    addDays, 
    parse, 
    getDay, 
    eachDayOfInterval, 
    subMonths, 
    subDays,
    isSameDay
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PayrollHistoryChart } from '../payroll/payroll-history-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Image from 'next/image';

// Import mock data
import { employees, orders, items, stockAdjustments, attendanceRecords } from '@/lib/data';

// --- Helper functions copied from live pages for consistent calculations ---

const MOCK_TODAY = subDays(new Date(), 1);

const getDateFromRecord = (date: string | any): Date => {
  if (date?.toDate) {
    return date.toDate();
  }
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

    if (getDay(recordDate) === 0) {
        if (record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent') {
             return 8; 
        }
        return 0;
    }

    if (getDay(recordDate) === 6) {
        if(record.afternoonStatus !== 'Absent') {
             return 4.5;
        }
    }

    if (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent') return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());
    let totalHours = 0;
    if (record.morningStatus !== 'Absent' && record.morningEntry) {
        try {
            const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
            if(isValid(morningEntryTime) && morningEntryTime < morningEndTime) {
                const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
                totalHours += morningWorkMs / (1000 * 60 * 60);
            }
        } catch(e){}
    }
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        try {
            const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
             if(isValid(afternoonEntryTime) && afternoonEntryTime < afternoonEndTime) {
                const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
                totalHours += afternoonWorkMs / (1000 * 60 * 60);
            }
        } catch(e){}
    }
    return Math.max(0, totalHours);
};

const calculateMinutesLate = (record: AttendanceRecord): number => {
    if (!record) return 0;
    let minutesLate = 0;
    if (record.morningStatus === 'Late' && record.morningEntry) {
        const morningStartTime = parse("08:00", "HH:mm", new Date());
        try {
            const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
            if (isValid(morningEntryTime) && morningEntryTime > morningStartTime) {
                minutesLate += (morningEntryTime.getTime() - morningStartTime.getTime()) / (1000 * 60);
            }
        } catch(e) {}
    }
    if (record.afternoonStatus === 'Late' && record.afternoonEntry) {
        const afternoonStartTime = parse("13:30", "HH:mm", new Date());
        try {
            const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
            if (isValid(afternoonEntryTime) && afternoonEntryTime > afternoonStartTime) {
                minutesLate += (afternoonEntryTime.getTime() - afternoonStartTime.getTime()) / (1000 * 60);
            }
        } catch(e) {}
    }
    return Math.round(minutesLate);
};

const StatusListItem = ({ employee, status, detail }: { employee: Employee, status: AttendanceStatus, detail?: string }) => (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
        <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9">
                <AvatarFallback>{employee.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
            </Avatar>
            <div>
                <p className="font-medium">{employee.name}</p>
                <p className="text-sm text-muted-foreground">{employee.position}</p>
            </div>
        </div>
        <div className="text-sm text-right">
            <Badge variant={status === 'Late' || status === 'Absent' ? 'destructive' : status === 'Permission' ? 'default' : 'secondary'} className="capitalize">{status}</Badge>
            {detail && <p className="text-muted-foreground mt-1">{detail}</p>}
        </div>
    </div>
);


export default function DemoPage() {
  const { setTitle } = usePageTitle();
  const allAttendance = attendanceRecords;
  const todayAttendance = useMemo(() => allAttendance.filter(r => isSameDay(getDateFromRecord(r.date), MOCK_TODAY)), [allAttendance]);

  useEffect(() => {
    setTitle("App Demo");
  }, [setTitle]);

  const dashboardStats = useMemo(() => {
    const totalEmployees = employees.length;
    const onSiteToday = todayAttendance.filter(r => r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent").length || 0;
    
    const ethToday = toEthiopian(MOCK_TODAY);
    const weekStart = startOfWeek(MOCK_TODAY, { weekStartsOn: 0 });
    
    const estWeekly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod === 'Weekly' && emp.dailyRate) {
            return acc + (emp.dailyRate * 7);
        }
        return acc;
    }, 0);

    const actualWeekly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Weekly') return acc;
        const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
        if (!hourlyRate) return acc;
        const period = { start: weekStart, end: MOCK_TODAY };
        const recordsInWeek = allAttendance.filter(r => r.employeeId === emp.id && isValid(new Date(r.date as string)) && isWithinInterval(new Date(r.date as string), period));
        let hoursWorked = recordsInWeek.reduce((sum, r) => sum + calculateHoursWorked(r) + (r.overtimeHours || 0), 0);
        return acc + (hoursWorked * hourlyRate);
    }, 0);

    const monthStart = toGregorian(ethToday.year, ethToday.month, 1);
    
    const estMonthly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod === 'Monthly' && emp.monthlyRate) return acc + emp.monthlyRate;
        return acc;
    }, 0);

    const actualMonthly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Monthly') return acc;
        const baseSalary = emp.monthlyRate || 0;
        if (baseSalary === 0) return acc;
        const dailyRate = baseSalary / 23.625;
        const hourlyRate = dailyRate / 8;
        const minuteRate = hourlyRate / 60;
        const period = { start: monthStart, end: MOCK_TODAY };
        const recordsInMonth = allAttendance.filter(r => r.employeeId === emp.id && isValid(getDateFromRecord(r.date)) && isWithinInterval(getDateFromRecord(r.date), period));
        let totalHoursAbsent = 0;
        const minutesLate = recordsInMonth.reduce((sum, r) => sum + calculateMinutesLate(r), 0);
        const periodDays = eachDayOfInterval(period);
        const recordedDates = new Set(recordsInMonth.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
        periodDays.forEach(day => {
            if (getDay(day) !== 0 && day <= MOCK_TODAY) {
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    totalHoursAbsent += (getDay(day) === 6) ? 4.5 : 8;
                }
            }
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
            let period = '';
            if (record.morningStatus === 'Permission' && record.afternoonStatus === 'Permission') period = 'Full Day';
            else if (record.morningStatus === 'Permission') period = 'Morning';
            else period = 'Afternoon';
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
        const daysInMonth = getEthiopianMonthDays(ethDateForMonth.year, ethDateForMonth.month);
        const monthEnd = addDays(monthStart, daysInMonth - 1);
        const interval = { start: monthStart, end: monthEnd };
        let totalPayrollForMonth = 0;
        employees.forEach(employee => {
            const employeeAttendance = allAttendance.filter(r => r.employeeId === employee.id && isWithinInterval(getDateFromRecord(r.date), interval));
            if (employee.paymentMethod === 'Monthly') {
                const baseSalary = employee.monthlyRate || 0;
                totalPayrollForMonth += baseSalary; // Simplified for demo
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

  const getInitials = (name: string) => {
    if (!name) return "";
    const names = name.split(" ");
    return names.map((n) => n[0]).join("").toUpperCase();
  };

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Demo Showcase</CardTitle>
          <CardDescription>
            This page demonstrates the various features of the application using mock data.
            The actual application uses live data from Firebase.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title="Total Employees" value={dashboardStats.totalEmployees} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
        <StatCard title="On-site Today" value={`${dashboardStats.onSiteToday} / ${dashboardStats.totalEmployees}`} icon={<UserCheck className="h-5 w-s text-muted-foreground" />} />
        <StatCard title="This Week's Payroll" value={`ETB ${dashboardStats.actualWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<Wallet className="h-5 w-5 text-muted-foreground" />} description={`Est: ETB ${dashboardStats.estWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard title="This Month's Payroll" value={`ETB ${dashboardStats.actualMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<Wallet className="h-5 w-5 text-muted-foreground" />} description={`Est: ETB ${dashboardStats.estMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
                <CardTitle>Today's Status</CardTitle>
                <CardDescription>Based on mock data for {format(MOCK_TODAY, 'PPP')}</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="absent">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="absent"><UserX className="mr-2 h-4 w-4" /> Absent ({todayStatus.absent.length})</TabsTrigger>
                        <TabsTrigger value="late"><Clock className="mr-2 h-4 w-4" /> Late ({todayStatus.late.length})</TabsTrigger>
                        <TabsTrigger value="permission"><Hand className="mr-2 h-4 w-4" /> Permission ({todayStatus.permission.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="absent" className="mt-4">
                        {todayStatus.absent.length > 0 ? todayStatus.absent.map(item => <StatusListItem key={item.employee.id} employee={item.employee} status="Absent" detail={item.period} />) : <p className="text-muted-foreground text-center py-8 text-sm">No one is absent today.</p>}
                    </TabsContent>
                     <TabsContent value="late" className="mt-4">
                        {todayStatus.late.length > 0 ? todayStatus.late.map(item => <StatusListItem key={item.employee.id} employee={item.employee} status="Late" detail={item.time} />) : <p className="text-muted-foreground text-center py-8 text-sm">No one is late today.</p>}
                    </TabsContent>
                     <TabsContent value="permission" className="mt-4">
                        {todayStatus.permission.length > 0 ? todayStatus.permission.map(item => <StatusListItem key={item.employee.id} employee={item.employee} status="Permission" detail={item.period} />) : <p className="text-muted-foreground text-center py-8 text-sm">No one is on leave today.</p>}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Payroll History</CardTitle>
                <CardDescription>Total payroll expenses for the last 6 months.</CardDescription>
            </CardHeader>
            <CardContent>
                <PayrollHistoryChart data={payrollHistory} />
            </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
            <CardTitle>Employees</CardTitle>
            <CardDescription>A list of sample employees.</CardDescription>
            </CardHeader>
            <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Payment Method</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {employees.map((employee) => (
                    <TableRow key={employee.id}>
                    <TableCell>
                        <div className="flex items-center gap-3">
                            <Avatar className="hidden h-9 w-9 sm:flex">
                                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                            </Avatar>
                            <div className="grid gap-1">
                                <p className="font-medium leading-none">{employee.name}</p>
                                <p className="text-xs text-muted-foreground">{employee.position}</p>
                            </div>
                        </div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline">{employee.paymentMethod}</Badge>
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription>Track customer orders.</CardDescription>
            </CardHeader>
            <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {orders.map((order) => (
                    <TableRow key={order.id}>
                    <TableCell>
                        <div className="font-medium">{order.customerName}</div>
                        <div className="text-sm text-muted-foreground">{format(new Date(order.orderDate), "PPP")}</div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-3">
                        {order.productPictureUrl && (
                            <Image src={order.productPictureUrl} alt={order.orderDescription || 'Product image'} width={40} height={40} className="rounded-md object-cover" />
                        )}
                        <span>{order.orderDescription}</span>
                        </div>
                    </TableCell>
                    <TableCell>
                        <Badge variant={order.orderStatus === 'Completed' ? 'secondary' : order.orderStatus === 'Processing' ? 'default' : 'outline'}>
                        {order.orderStatus}
                        </Badge>
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
            <CardTitle>Store Inventory</CardTitle>
            <CardDescription>Keep track of raw materials and stock levels.</CardDescription>
            </CardHeader>
            <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Stock Level</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {items.map((item) => (
                    <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.stockLevel} {item.unitOfMeasurement}</TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
            <CardTitle>Stock Adjustments</CardTitle>
            <CardDescription>History of stock changes.</CardDescription>
            </CardHeader>
            <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {stockAdjustments.map((adj) => (
                    <TableRow key={adj.id}>
                    <TableCell>{items.find(i => i.id === adj.itemId)?.name}</TableCell>
                    <TableCell>{format(new Date(adj.adjustmentDate), "PPP p")}</TableCell>
                    <TableCell className={`text-right ${adj.adjustmentQuantity > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {adj.adjustmentQuantity > 0 ? `+${adj.adjustmentQuantity}` : adj.adjustmentQuantity}
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
      </div>

    </div>
  );
}

    