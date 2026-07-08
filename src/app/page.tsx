'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, UserX, Clock, Hand, CalendarDays, ListFilter, ChevronLeft, ChevronRight } from "lucide-react";
import type { Employee, AttendanceRecord, AttendanceStatus, PayrollEntry } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, subMonths, isSameDay, startOfMonth } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PayrollHistoryChart } from './payroll/payroll-history-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

const calculateHoursWorked = (record: AttendanceRecord, isMonthlyEmployee: boolean = false): number => {
    if (!record) return 0;
    const recordDate = getDateFromRecord(record.date);

    if (getDay(recordDate) === 0) { // Sunday
        if (record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent') {
             return 8; 
        }
        return 0;
    }

    if (getDay(recordDate) === 6) { // Saturday
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

export default function DashboardPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  
  const { data: employees, loading: employeesLoading } = useCollection<Employee>(employeesCollectionRef);
  
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  // Overview tab selectors
  const [selectedDay, setSelectedDay] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(startOfWeek(new Date(), { weekStartsOn: 0 }).toISOString());
  const [selectedMonthStart, setSelectedMonthStart] = useState<string>(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1).toISOString());

  useEffect(() => {
    const fetchAllAttendance = async () => {
      if (!firestore || !employees || employees.length === 0) {
        setAttendanceLoading(false);
        return;
      }
      setAttendanceLoading(true);
      try {
        const recordsPromises = employees.map(async (emp) => {
          const attendanceColRef = collection(firestore, 'employees', emp.id, 'attendance');
          const querySnapshot = await getDocs(attendanceColRef);
          return querySnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            employeeId: emp.id
          } as AttendanceRecord));
        });
        
        const allRecordsArrays = await Promise.all(recordsPromises);
        const allRecords = allRecordsArrays.flat();
        setAllAttendance(allRecords);

      } catch (error) {
        console.error("Error fetching attendance data:", error);
      } finally {
        setAttendanceLoading(false);
      }
    };
    
    if (!isUserLoading && employees) {
      fetchAllAttendance();
    }
  }, [firestore, employees, isUserLoading]);
  
  const todayAttendanceCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance', selectedDay, 'records');
  }, [firestore, user, selectedDay]);

  const { data: todayAttendance, loading: todayAttendanceLoading } = useCollection<AttendanceRecord>(todayAttendanceCollectionRef);

  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  const dashboardStats = useMemo(() => {
    if (!employees) return { totalEmployees: 0, onSiteToday: 0, estWeekly: 0, actualWeekly: 0, estMonthly: 0, actualMonthly: 0 };

    const totalEmployees = employees.length;
    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");

    // Real-time site attendance based on today's logs
    const onSiteTodayCount = allAttendance.filter(r => 
        format(getDateFromRecord(r.date), "yyyy-MM-dd") === todayStr &&
        (r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent")
    ).length;
    
    const weekStart = startOfWeek(now, { weekStartsOn: 0 }); 
    const monthStart = toGregorian(toEthiopian(now).year, toEthiopian(now).month, 1);
    
    const estWeekly = employees.reduce((acc, emp) => acc + (emp.paymentMethod === 'Weekly' && emp.dailyRate ? emp.dailyRate * 7 : 0), 0);
    const estMonthly = employees.reduce((acc, emp) => acc + (emp.paymentMethod === 'Monthly' && emp.monthlyRate ? emp.monthlyRate : 0), 0);

    const actualWeekly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Weekly') return acc;
        const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
        if (!hourlyRate) return acc;
        const recordsInWeek = allAttendance.filter(r => r.employeeId === emp.id && isValid(getDateFromRecord(r.date)) && isWithinInterval(getDateFromRecord(r.date), { start: weekStart, end: now }));
        let hoursWorked = recordsInWeek.reduce((sum, r) => sum + calculateHoursWorked(r) + (r.overtimeHours || 0), 0);
        return acc + (hoursWorked * hourlyRate);
    }, 0);

    const actualMonthly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Monthly') return acc;
        const baseSalary = emp.monthlyRate || 0;
        const hourlyRate = baseSalary / 23.625 / 8;
        const minuteRate = hourlyRate / 60;
        
        const ethYear = toEthiopian(monthStart).year;
        const permissionDates = allAttendance.filter(r => r.employeeId === emp.id && toEthiopian(getDateFromRecord(r.date)).year === ethYear && (r.morningStatus === 'Permission' || r.afternoonStatus === 'Permission'))
                               .map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')).sort();
        const allowedPermissionDates = new Set(permissionDates.slice(0, 15));

        const recordsInMonth = allAttendance.filter(r => r.employeeId === emp.id && isValid(getDateFromRecord(r.date)) && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: now }));
        let totalHoursAbsent = 0;
        const minutesLate = recordsInMonth.reduce((sum, r) => {
            const dateStr = format(getDateFromRecord(r.date), 'yyyy-MM-dd');
            if (r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) totalHoursAbsent += 4.5;
            if (getDay(getDateFromRecord(r.date)) !== 6 && (r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dateStr)))) totalHoursAbsent += 3.5;
            return sum + calculateMinutesLate(r);
        }, 0);

        eachDayOfInterval({ start: monthStart, end: now }).forEach(day => {
            if (getDay(day) !== 0 && !recordsInMonth.some(r => isSameDay(getDateFromRecord(r.date), day))) {
                totalHoursAbsent += (getDay(day) === 6) ? 4.5 : 8;
            }
        });

        return acc + (baseSalary - (totalHoursAbsent * hourlyRate) - (minutesLate * minuteRate));
    }, 0);

    return { totalEmployees, onSiteToday: onSiteTodayCount, estWeekly, actualWeekly, estMonthly, actualMonthly };
  }, [employees, allAttendance]);

  const payrollHistory = useMemo(() => {
    if (!employees || allAttendance.length === 0) return [];
    const history = [];
    for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const ethDate = toEthiopian(monthDate);
        const start = toGregorian(ethDate.year, ethDate.month, 1);
        const end = addDays(start, getEthiopianMonthDays(ethDate.year, ethDate.month) - 1);
        let total = 0;
        employees.forEach(emp => {
            const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), { start, end }));
            if (emp.paymentMethod === 'Monthly') {
                total += emp.monthlyRate || 0; // Simplified for chart
            } else {
                const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                const hours = records.reduce((sum, r) => sum + calculateHoursWorked(r) + (r.overtimeHours || 0), 0);
                total += hours * (hourly || 0);
            }
        });
        history.push({ month: format(start, 'MMM'), total });
    }
    return history;
  }, [employees, allAttendance]);

  // Tab calculations
  const weeklyPayroll = useMemo(() => {
    if (!employees || !selectedWeekStart) return [];
    const weekStart = new Date(selectedWeekStart);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    return employees.filter(e => e.paymentMethod === 'Weekly').map(emp => {
        const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
        const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), { start: weekStart, end: weekEnd }));
        const totalHours = records.reduce((sum, r) => sum + calculateHoursWorked(r), 0);
        const otHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const otPay = otHours * (hourlyRate || 0);
        return {
            employeeId: emp.id, employeeName: emp.name, paymentMethod: emp.paymentMethod, period: "Selected Week",
            amount: (totalHours + otHours) * (hourlyRate || 0), status: 'Unpaid', totalHours, overtimeHours: otHours, overtimeAmount: otPay
        };
    });
  }, [employees, allAttendance, selectedWeekStart]);

  const monthlyPayroll = useMemo(() => {
    if (!employees || !selectedMonthStart) return [];
    const monthStart = new Date(selectedMonthStart);
    const ethMonth = toEthiopian(monthStart);
    const monthEnd = addDays(monthStart, getEthiopianMonthDays(ethMonth.year, ethMonth.month) - 1);
    return employees.filter(e => e.paymentMethod === 'Monthly').map(emp => {
        const base = emp.monthlyRate || 0;
        const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd }));
        const otHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const hourly = base / 23.625 / 8;
        const otPay = otHours * (hourly || 0);
        return {
            employeeId: emp.id, employeeName: emp.name, paymentMethod: emp.paymentMethod, period: "Selected Month",
            amount: base + otPay, status: 'Unpaid', overtimeHours: otHours, overtimeAmount: otPay
        };
    });
  }, [employees, allAttendance, selectedMonthStart]);

  const dailyEarnings = useMemo(() => {
    if (!employees || !selectedDay) return [];
    const date = new Date(selectedDay);
    return employees.map(emp => {
        const record = todayAttendance?.find(r => r.employeeId === emp.id);
        let amount = 0;
        if (emp.paymentMethod === 'Weekly') {
            const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            amount = record ? (calculateHoursWorked(record) + (record.overtimeHours || 0)) * (hourly || 0) : 0;
        } else {
            const daily = (emp.monthlyRate || 0) / 23.625;
            amount = record ? daily : 0; // Simplified for daily
        }
        return { 
            employeeId: emp.id, name: emp.name, morning: record?.morningEntry || "—", afternoon: record?.afternoonEntry || "—",
            status: record?.morningStatus || "Absent", amount, overtimeHours: record?.overtimeHours || 0
        };
    });
  }, [employees, todayAttendance, selectedDay]);

  // Options for selectors
  const weekOptions = useMemo(() => {
      const options = [];
      let current = startOfWeek(new Date(), { weekStartsOn: 0 });
      for (let i = 0; i < 8; i++) {
          options.push({ value: current.toISOString(), label: `Week of ${format(current, 'MMM d')}` });
          current = addDays(current, -7);
      }
      return options;
  }, []);

  const monthOptions = useMemo(() => {
      const options = [];
      let today = new Date();
      for (let i = 0; i < 6; i++) {
          const m = subMonths(today, i);
          const eth = toEthiopian(m);
          const start = toGregorian(eth.year, eth.month, 1);
          options.push({ value: start.toISOString(), label: `${ethiopianDateFormatter(start, { month: 'long' })} ${eth.year}` });
      }
      return options;
  }, []);

  const loading = employeesLoading || attendanceLoading || isUserLoading || todayAttendanceLoading;

  if (loading) {
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" role="status">
                <span className="sr-only">Loading...</span>
            </div>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Employees" value={dashboardStats.totalEmployees} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
        <StatCard title="On-site Today" value={`${dashboardStats.onSiteToday} / ${dashboardStats.totalEmployees}`} icon={<UserCheck className="h-5 w-5 text-muted-foreground" />} />
        <StatCard title="This Week's Payroll" value={`ETB ${dashboardStats.actualWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<Wallet className="h-5 w-5 text-muted-foreground" />} description={`Est: ETB ${dashboardStats.estWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard title="This Month's Payroll" value={`ETB ${dashboardStats.actualMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<Wallet className="h-5 w-5 text-muted-foreground" />} description={`Est: ETB ${dashboardStats.estMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      </div>

       <div className="flex flex-col gap-8">
        <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <CardTitle>Overview</CardTitle>
                    <CardDescription>Detailed attendance and payment tracking</CardDescription>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {ethiopianDateFormatter(new Date(), { month: 'long', day: 'numeric', year: 'numeric' })}
                </Badge>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="today">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="today">Today</TabsTrigger>
                        <TabsTrigger value="week">Week</TabsTrigger>
                        <TabsTrigger value="month">Month</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="today" className="space-y-4">
                        <div className="flex items-center gap-2 max-w-xs">
                            <Input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} />
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Morning</TableHead>
                                        <TableHead>Afternoon</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>OT Hrs</TableHead>
                                        <TableHead className="text-right">Today's Pay</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dailyEarnings.map(item => (
                                        <TableRow key={item.employeeId}>
                                            <TableCell className="font-medium whitespace-nowrap">{item.name}</TableCell>
                                            <TableCell>{item.morning}</TableCell>
                                            <TableCell>{item.afternoon}</TableCell>
                                            <TableCell>
                                                <Badge variant={item.status === 'Absent' ? 'destructive' : 'secondary'}>{item.status}</Badge>
                                            </TableCell>
                                            <TableCell>{item.overtimeHours || 0}</TableCell>
                                            <TableCell className="text-right font-bold text-primary">ETB {item.amount.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="week" className="space-y-4">
                        <div className="flex items-center gap-2 max-w-xs">
                             <Select value={selectedWeekStart} onValueChange={setSelectedWeekStart}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select week" />
                                </SelectTrigger>
                                <SelectContent>
                                    {weekOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Working Hours</TableHead>
                                        <TableHead>OT Hours</TableHead>
                                        <TableHead>OT Pay</TableHead>
                                        <TableHead className="text-right">Weekly Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {weeklyPayroll.map(entry => (
                                        <TableRow key={entry.employeeId}>
                                            <TableCell className="font-medium whitespace-nowrap">{entry.employeeName}</TableCell>
                                            <TableCell>{entry.totalHours?.toFixed(1)} hrs</TableCell>
                                            <TableCell>{entry.overtimeHours || 0}</TableCell>
                                            <TableCell>ETB {entry.overtimeAmount?.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-bold text-primary">ETB {entry.amount.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="month" className="space-y-4">
                        <div className="flex items-center gap-2 max-w-xs">
                            <Select value={selectedMonthStart} onValueChange={setSelectedMonthStart}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Payment Method</TableHead>
                                        <TableHead>OT Hours</TableHead>
                                        <TableHead>OT Pay</TableHead>
                                        <TableHead className="text-right">Month To-Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {monthlyPayroll.map(entry => (
                                        <TableRow key={entry.employeeId}>
                                            <TableCell className="font-medium whitespace-nowrap">{entry.employeeName}</TableCell>
                                            <TableCell><Badge variant="outline">{entry.paymentMethod}</Badge></TableCell>
                                            <TableCell>{entry.overtimeHours || 0}</TableCell>
                                            <TableCell>ETB {entry.overtimeAmount?.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-bold text-primary">ETB {entry.amount.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
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
    </div>
  );
}
