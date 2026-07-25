'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, CalendarDays, Clock, ChevronLeft, ChevronRight, TrendingUp, HandCoins, BarChart3, ShoppingBag, Timer, PackageSearch, ArrowRight } from "lucide-react";
import type { Employee, AttendanceRecord, Order } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, subMonths, isSameDay, startOfDay, endOfDay } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from "@/firebase";
import { secondaryDb } from "@/firebase/secondary";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PayrollHistoryChart } from './payroll/payroll-history-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from "@/components/ui/progress";
import Link from 'next/link';
import { cn } from "@/lib/utils";
import { sendAdminPayrollSummary } from './payroll/actions';

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
    let date = new Date(ethYear + 7, ethMonth + 7, ethDay, 12, 0, 0);
    for (let i = 0; i < 60; i++) {
        const eth = toEthiopian(date);
        if (eth.year === ethYear && eth.month === ethMonth && eth.day === ethDay) {
            return startOfDay(date);
        }
        if (eth.year < ethYear || (eth.year === ethYear && eth.month < ethMonth) || (eth.year === ethYear && eth.month === ethMonth && eth.day < ethDay)) {
            date.setDate(date.getDate() + 1);
        } else {
            date.setDate(date.getDate() - 1);
        }
    }
    return startOfDay(date);
};

const getMonthlyWorkingUnits = (monthStart: Date, daysInMonth: number) => {
    const interval = { start: monthStart, end: addDays(monthStart, daysInMonth - 1) };
    const days = eachDayOfInterval(interval);
    let weekdays = 0;
    let saturdays = 0;
    days.forEach(day => {
        const d = getDay(day);
        if (d >= 1 && d <= 5) weekdays++;
        else if (d === 6) saturdays++;
    });
    // Saturdays are now treated as full 8h workdays (1.0 unit)
    return weekdays + saturdays;
};

const calculateHoursWorked = (record: AttendanceRecord, isMonthlyEmployee: boolean = false): number => {
    if (!record) return 0;
    const recordDate = getDateFromRecord(record.date);

    if (getDay(recordDate) === 0) { // Is Sunday
        if (record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent') {
             return 8; 
        }
        return 0;
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
  
  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  
  const { data: allEmployeesData, loading: employeesLoading } = useCollection<Employee>(employeesCollectionRef);
  
  const activeEmployees = useMemo(() => allEmployeesData?.filter(e => e.status !== 'Inactive') || [], [allEmployeesData]);
  const employees = useMemo(() => allEmployeesData || [], [allEmployeesData]);

  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  const [selectedDay, setSelectedDay] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd"));
  const [selectedMonthStart, setSelectedMonthStart] = useState<string>(format(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1), "yyyy-MM-dd"));
  const [selectedUnifiedMonth, setSelectedUnifiedMonth] = useState<string>(format(toGregorian(toEthiopian(new Date()).year, toEthiopian(new Date()).month, 1), "yyyy-MM-dd"));

  const ordersCollectionRef = useMemoFirebase(() => {
    if (!secondaryDb || !user) return null;
    return collection(secondaryDb, "orders");
  }, [user]);
  const { data: allOrders, isLoading: ordersLoading } = useCollection<Order>(ordersCollectionRef);

  const todayAttendanceCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'attendance', selectedDay, 'records');
  }, [firestore, user, selectedDay]);

  const { data: todayAttendance, loading: todayAttendanceLoading } = useCollection<AttendanceRecord>(todayAttendanceCollectionRef);

  const loading = employeesLoading || attendanceLoading || isUserLoading || todayAttendanceLoading || ordersLoading;

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
    
    if (!isUserLoading && employees && employees.length > 0) {
      fetchAllAttendance();
    }
  }, [firestore, employees, isUserLoading]);
  
  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  const dashboardStats = useMemo(() => {
    if (!activeEmployees) return { totalEmployees: 0, onSiteToday: 0, estWeekly: 0, actualWeekly: 0, estMonthly: 0, actualMonthly: 0 };

    const totalEmployees = activeEmployees.length;
    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");

    const onSiteTodayCount = allAttendance.filter(r => 
        format(getDateFromRecord(r.date), "yyyy-MM-dd") === todayStr &&
        (r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent") &&
        activeEmployees.some(e => e.id === r.employeeId)
    ).length;
    
    const weekStart = startOfWeek(now, { weekStartsOn: 0 }); 
    const ethNow = toEthiopian(now);
    const monthStart = toGregorian(ethNow.year, ethNow.month, 1);
    const daysInMonthCount = getEthiopianMonthDays(ethNow.year, ethNow.month);
    const workingUnits = getMonthlyWorkingUnits(monthStart, daysInMonthCount);
    
    const estWeekly = activeEmployees.reduce((acc, emp) => acc + (emp.paymentMethod === 'Weekly' && emp.dailyRate ? emp.dailyRate * 6 : 0), 0);
    const estMonthly = activeEmployees.reduce((acc, emp) => acc + (emp.paymentMethod === 'Monthly' && emp.monthlyRate ? emp.monthlyRate : 0), 0);

    const actualWeekly = activeEmployees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Weekly') return acc;
        const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
        if (!hourlyRate) return acc;
        const recordsInWeek = allAttendance.filter(r => r.employeeId === emp.id && isValid(getDateFromRecord(r.date)) && isWithinInterval(getDateFromRecord(r.date), { start: weekStart, end: now }));
        let hoursWorked = recordsInWeek.reduce((sum, r) => sum + calculateHoursWorked(r) + (r.overtimeHours || 0), 0);
        return acc + (hoursWorked * hourlyRate);
    }, 0);

    const actualMonthly = activeEmployees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Monthly') return acc;
        
        const recordsInMonth = allAttendance.filter(r => r.employeeId === emp.id && isValid(getDateFromRecord(r.date)) && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: now }));
        const empStartDate = emp.attendanceStartDate ? startOfDay(new Date(emp.attendanceStartDate)) : new Date(0);

        const baseSalary = emp.monthlyRate || 0;
        const hourlyRate = baseSalary / workingUnits / 8;
        const minuteRate = hourlyRate / 60;
        
        const ethYear = toEthiopian(monthStart).year;
        const permissionDates = allAttendance.filter(r => r.employeeId === emp.id && toEthiopian(getDateFromRecord(r.date)).year === ethYear && (r.morningStatus === 'Permission' || r.afternoonStatus === 'Permission'))
                               .map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')).sort();
        const allowedPermissionDates = new Set(permissionDates.slice(0, 15));

        let totalHoursAbsent = 0;
        const minutesLate = recordsInMonth.reduce((sum, r) => {
            const recordDate = getDateFromRecord(r.date);
            const dateStr = format(recordDate, 'yyyy-MM-dd');
            
            if (r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) totalHoursAbsent += 4.5;
            if (r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) totalHoursAbsent += 3.5;
            
            return sum + calculateMinutesLate(r);
        }, 0);

        eachDayOfInterval({ start: monthStart, end: now }).forEach(day => {
            if (day >= empStartDate && getDay(day) !== 0 && !recordsInMonth.some(r => isSameDay(getDateFromRecord(r.date), day))) {
                totalHoursAbsent += 8; // All non-Sunday unrecorded days are 8h absences
            }
        });

        const overtimeHours = recordsInMonth.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const overtimePay = overtimeHours * hourlyRate;

        return acc + (baseSalary - (totalHoursAbsent * hourlyRate) - (minutesLate * minuteRate) + overtimePay);
    }, 0);

    return { totalEmployees, onSiteToday: onSiteTodayCount, estWeekly, actualWeekly, estMonthly, actualMonthly };
  }, [activeEmployees, allAttendance]);

  useEffect(() => {
    if (loading || !dashboardStats || allAttendance.length === 0 || !firestore) return;

    const checkAutoNotifications = async () => {
        const now = new Date();
        const ethNow = toEthiopian(now);
        const metadataRef = doc(firestore, 'metadata', 'payroll_notifications');
        
        if (getDay(now) === 6 && now.getHours() >= 17) {
            const weekId = format(startOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd');
            const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
            const docId = `weekly_${weekId}`;
            const label = `${ethiopianDateFormatter(startOfWeek(now, { weekStartsOn: 0 }), { month: 'short', day: 'numeric' })} - ${ethiopianDateFormatter(weekEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`;
            
            const docSnap = await getDoc(metadataRef);
            const notifiedData = docSnap.exists() ? docSnap.data() : {};
            if (notifiedData[docId]) return;

            let weeklySummary = `📊 *Automatic Weekly Payroll Summary*\n`;
            weeklySummary += `📅 Period: ${label}\n\n`;
            
            let total = 0;
            let count = 0;
            
            activeEmployees.filter(e => e.paymentMethod === 'Weekly').forEach(emp => {
                const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), { start: startOfWeek(now, { weekStartsOn: 0 }), end: weekEnd }));
                const hrs = records.reduce((sum, r) => sum + calculateHoursWorked(r), 0);
                const ot = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
                const amt = (hrs + ot) * (hourlyRate || 0);
                if (amt > 0) {
                    weeklySummary += `• *${emp.name}*: ETB ${amt.toFixed(2)}\n`;
                    total += amt;
                    count++;
                }
            });
            
            weeklySummary += `\n--------------------\n`;
            weeklySummary += `*TOTAL PAYOUT: ETB ${total.toFixed(2)}*`;
            
            if (count > 0) {
                const result = await sendAdminPayrollSummary(weeklySummary);
                if (result.success) {
                    setDoc(metadataRef, {
                        [docId]: {
                            sentAt: new Date().toISOString(),
                            type: 'weekly',
                            periodId: weekId
                        }
                    }, { merge: true });
                }
            }
        }

        if (ethNow.day === 30) {
            const monthId = `${ethNow.year}-${ethNow.month}`;
            const docId = `monthly_${monthId}`;
            const monthStart = toGregorian(ethNow.year, ethNow.month, 1);
            const label = `${ethiopianDateFormatter(monthStart, { month: 'long' })} ${ethNow.year}`;
            
            const docSnap = await getDoc(metadataRef);
            const notifiedData = docSnap.exists() ? docSnap.data() : {};
            if (notifiedData[docId]) return;

            let monthlySummary = `📊 *Automatic Monthly Payroll Summary*\n`;
            monthlySummary += `📅 Period: ${label}\n\n`;
            
            let total = 0;
            let count = 0;
            
            activeEmployees.filter(e => e.paymentMethod === 'Monthly').forEach(emp => {
                const base = emp.monthlyRate || 0;
                if (base > 0) {
                    monthlySummary += `• *${emp.name}*: ETB ${base.toFixed(2)}\n`;
                    total += base;
                    count++;
                }
            });
            
            monthlySummary += `\n--------------------\n`;
            monthlySummary += `*TOTAL PAYOUT: ETB ${total.toFixed(2)}*`;
            
            if (count > 0) {
                const result = await sendAdminPayrollSummary(monthlySummary);
                if (result.success) {
                    setDoc(metadataRef, {
                        [docId]: {
                            sentAt: new Date().toISOString(),
                            type: 'monthly',
                            periodId: monthId
                        }
                    }, { merge: true });
                }
            }
        }
    };

    const timer = setTimeout(checkAutoNotifications, 5000); 
    return () => clearTimeout(timer);
  }, [dashboardStats, allAttendance, activeEmployees, loading, firestore]);

  const payrollHistory = useMemo(() => {
    if (!employees || allAttendance.length === 0) return [];
    const history = [];
    for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const ethDate = toEthiopian(monthDate);
        const start = toGregorian(ethDate.year, ethDate.month, 1);
        const end = addDays(start, getEthiopianMonthDays(ethDate.year, ethDate.month) - 1);
        const monthInterval = { start: startOfDay(start), end: endOfDay(end) };
        const workingUnits = getMonthlyWorkingUnits(start, 30);

        let total = 0;
        employees.forEach(emp => {
            const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), monthInterval));
            const empStartDate = emp.attendanceStartDate ? startOfDay(new Date(emp.attendanceStartDate)) : new Date(0);

            if (emp.paymentMethod === 'Monthly') {
                const base = emp.monthlyRate || 0;
                const hourly = base / workingUnits / 8;
                const minuteRate = hourly / 60;
                
                const ethYear = ethDate.year;
                const permissionDates = allAttendance.filter(r => r.employeeId === emp.id && toEthiopian(getDateFromRecord(r.date)).year === ethYear && (r.morningStatus === 'Permission' || r.afternoonStatus === 'Permission'))
                                       .map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')).sort();
                const allowedPermissionDates = new Set(permissionDates.slice(0, 15));

                let hoursAbsent = 0;
                let minutesLate = 0;
                records.forEach(r => {
                    const recordDate = getDateFromRecord(r.date);
                    const dateStr = format(recordDate, 'yyyy-MM-dd');
                    if (r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) hoursAbsent += 4.5;
                    if (r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) hoursAbsent += 3.5;
                    minutesLate += calculateMinutesLate(r);
                });

                eachDayOfInterval(monthInterval).forEach(day => {
                    if (day >= empStartDate && getDay(day) !== 0 && !records.some(r => isSameDay(getDateFromRecord(r.date), day))) {
                        hoursAbsent += 8;
                    }
                });

                const overtimeHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
                total += (base - (hoursAbsent * hourly) - (minutesLate * minuteRate) + (overtimeHours * hourly));
            } else {
                const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
                let hoursWorked = records.reduce((sum, r) => sum + calculateHoursWorked(r) + (r.overtimeHours || 0), 0);
                
                eachDayOfInterval(monthInterval).forEach(day => {
                    if (getDay(day) === 0 && day >= empStartDate) {
                        const record = records.find(r => isSameDay(getDateFromRecord(r.date), day));
                        if (!record) hoursWorked += 8;
                    }
                });

                total += hoursWorked * (hourly || 0);
            }
        });
        history.push({ month: format(start, 'MMM'), total });
    }
    return history;
  }, [employees, allAttendance]);

  const upcomingOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders
      .filter(order => (order.status || "").toLowerCase() !== 'shipped')
      .sort((a, b) => {
        const dateA = (a.deadline as any)?.seconds || (a.deadline ? new Date(a.deadline as string).getTime() / 1000 : 0);
        const dateB = (b.deadline as any)?.seconds || (b.deadline ? new Date(b.deadline as string).getTime() / 1000 : 0);
        return dateA - dateB;
      })
      .slice(0, 5);
  }, [allOrders]);

  const weeklyPayroll = useMemo(() => {
    if (!employees || !selectedWeekStart) return [];
    const weekStart = startOfDay(new Date(selectedWeekStart));
    const weekEnd = endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 }));
    const today = new Date();
    
    return employees.filter(e => e.paymentMethod === 'Weekly' && (e.status !== 'Inactive' || allAttendance.some(r => r.employeeId === e.id && isWithinInterval(getDateFromRecord(r.date), { start: weekStart, end: weekEnd })))).map(emp => {
        const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
        const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), { start: weekStart, end: weekEnd }));
        const totalHours = records.reduce((sum, r) => sum + calculateHoursWorked(r), 0);
        const otHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const otPay = otHours * (hourlyRate || 0);
        const empStartDate = emp.attendanceStartDate ? startOfDay(new Date(emp.attendanceStartDate)) : new Date(0);
        
        let minutesLate = 0;
        let hoursAbsent = 0;
        const recordedDates = new Set(records.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
        
        eachDayOfInterval({ start: weekStart, end: weekEnd > today ? today : weekEnd }).forEach(day => {
            if (day >= empStartDate && getDay(day) !== 0 && !recordedDates.has(format(day, 'yyyy-MM-dd'))) {
                hoursAbsent += 8;
            }
        });
        
        records.forEach(r => {
            minutesLate += calculateMinutesLate(r);
            if (r.morningStatus === 'Absent') hoursAbsent += 4.5;
            if (r.afternoonStatus === 'Absent') hoursAbsent += 3.5;
        });

        return {
            employeeId: emp.id, 
            employeeName: emp.name, 
            paymentMethod: emp.paymentMethod, 
            period: "Selected Week",
            amount: (totalHours + otHours) * (hourlyRate || 0), 
            status: 'Unpaid', 
            totalHours, 
            overtimeHours: otHours, 
            overtimeAmount: otPay,
            minutesLate,
            hoursAbsent
        };
    });
  }, [employees, allAttendance, selectedWeekStart]);

  const monthlyPayroll = useMemo(() => {
    if (!employees || !selectedMonthStart) return [];
    const monthStart = startOfDay(new Date(selectedMonthStart));
    const ethMonth = toEthiopian(monthStart);
    const daysInMonthCount = getEthiopianMonthDays(ethMonth.year, ethMonth.month);
    const workingUnits = getMonthlyWorkingUnits(monthStart, daysInMonthCount);
    const monthEnd = endOfDay(addDays(monthStart, daysInMonthCount - 1));
    const today = new Date();
    
    return employees.filter(e => e.paymentMethod === 'Monthly' && (e.status !== 'Inactive' || allAttendance.some(r => r.employeeId === e.id && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd })))).map(emp => {
        const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd }));
        const empStartDate = emp.attendanceStartDate ? startOfDay(new Date(emp.attendanceStartDate)) : new Date(0);
        
        let finalAmount = 0;
        let hoursAbsent = 0;
        let minutesLate = 0;
        let overtimeHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);

        const base = emp.monthlyRate || 0;
        const hourly = base / workingUnits / 8;
        const minuteRate = hourly / 60;
        
        const ethYear = toEthiopian(monthStart).year;
        const permissionDates = allAttendance.filter(r => r.employeeId === emp.id && toEthiopian(getDateFromRecord(r.date)).year === ethYear && (r.morningStatus === 'Permission' || r.afternoonStatus === 'Permission'))
                               .map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')).sort();
        const allowedPermissionDates = new Set(permissionDates.slice(0, 15));

        const recordedDates = new Set(records.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

        records.forEach(r => {
            const recordDate = getDateFromRecord(r.date);
            if(recordDate > today) return;

            const dateStr = format(recordDate, 'yyyy-MM-dd');
            if (r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) hoursAbsent += 4.5;
            if (r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) hoursAbsent += 3.5;
            
            minutesLate += calculateMinutesLate(r);
        });

        eachDayOfInterval({ start: monthStart, end: monthEnd > today ? today : monthEnd }).forEach(day => {
            if (day >= empStartDate && getDay(day) !== 0 && !recordedDates.has(format(day, 'yyyy-MM-dd'))) {
                hoursAbsent += 8;
            }
        });

        const overtimeAmount = overtimeHours * hourly;
        const deductions = (hoursAbsent * hourly) + (minutesLate * minuteRate);
        finalAmount = (base - deductions) + overtimeAmount;

        return {
            employeeId: emp.id, 
            employeeName: emp.name, 
            paymentMethod: emp.paymentMethod, 
            period: "Selected Month",
            amount: finalAmount, 
            status: 'Unpaid', 
            overtimeHours, 
            overtimeAmount,
            hoursAbsent,
            minutesLate
        };
    });
  }, [employees, allAttendance, selectedMonthStart]);

  const unifiedMonthlyPayroll = useMemo(() => {
    if (!employees || !selectedUnifiedMonth) return [];
    const monthStart = startOfDay(new Date(selectedUnifiedMonth));
    const ethMonth = toEthiopian(monthStart);
    const daysInMonthCount = getEthiopianMonthDays(ethMonth.year, ethMonth.month);
    const workingUnits = getMonthlyWorkingUnits(monthStart, daysInMonthCount);
    const monthEnd = endOfDay(addDays(monthStart, daysInMonthCount - 1));
    const today = new Date();
    
    return employees.filter(e => e.status !== 'Inactive' || allAttendance.some(r => r.employeeId === e.id && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd }))).map(emp => {
        const records = allAttendance.filter(r => r.employeeId === emp.id && isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd }));
        const empStartDate = emp.attendanceStartDate ? startOfDay(new Date(emp.attendanceStartDate)) : new Date(0);
        
        let finalAmount = 0;
        let overtimeHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);

        if (emp.paymentMethod === 'Monthly') {
            const base = emp.monthlyRate || 0;
            const hourly = base / workingUnits / 8;
            const minuteRate = hourly / 60;
            const ethYear = toEthiopian(monthStart).year;
            const permissionDates = allAttendance.filter(r => r.employeeId === emp.id && toEthiopian(getDateFromRecord(r.date)).year === ethYear && (r.morningStatus === 'Permission' || r.afternoonStatus === 'Permission')).map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')).sort();
            const allowedPermissionDates = new Set(permissionDates.slice(0, 15));
            const recordedDates = new Set(records.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

            let hoursAbsent = 0;
            let minutesLate = 0;
            records.forEach(r => {
                const recordDate = getDateFromRecord(r.date);
                if(recordDate > today) return;
                const dateStr = format(recordDate, 'yyyy-MM-dd');
                if (r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) hoursAbsent += 4.5;
                if (r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dateStr))) hoursAbsent += 3.5;
                minutesLate += calculateMinutesLate(r);
            });
            eachDayOfInterval({ start: monthStart, end: monthEnd > today ? today : monthEnd }).forEach(day => {
                if (day >= empStartDate && getDay(day) !== 0 && !recordedDates.has(format(day, 'yyyy-MM-dd'))) hoursAbsent += 8;
            });
            finalAmount = (base - ((hoursAbsent * hourly) + (minutesLate * minuteRate))) + (overtimeHours * hourly);
        } else {
            const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            let hoursWorked = records.reduce((sum, r) => sum + calculateHoursWorked(r), 0);
            const recordedDates = new Set(records.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
            eachDayOfInterval({ start: monthStart, end: monthEnd > today ? today : monthEnd }).forEach(day => {
                if (day >= empStartDate && getDay(day) === 0 && !recordedDates.has(format(day, 'yyyy-MM-dd'))) hoursWorked += 8;
            });
            finalAmount = (hoursWorked + overtimeHours) * (hourlyRate || 0);
        }

        return { employeeId: emp.id, amount: finalAmount };
    });
  }, [employees, allAttendance, selectedUnifiedMonth]);

  const totalUnifiedMonthly = useMemo(() => unifiedMonthlyPayroll.reduce((acc, curr) => acc + curr.amount, 0), [unifiedMonthlyPayroll]);

  const weekOptions = useMemo(() => {
    const today = new Date();
    const currentWeekStr = format(startOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd");
    const weeks = new Set<string>([currentWeekStr]);
    
    allAttendance.forEach(r => {
        const d = getDateFromRecord(r.date);
        if (isValid(d)) {
            weeks.add(format(startOfWeek(d, { weekStartsOn: 0 }), "yyyy-MM-dd"));
        }
    });

    return Array.from(weeks)
      .sort((a, b) => b.localeCompare(a))
      .map(val => {
          const start = new Date(val);
          const end = endOfWeek(start, { weekStartsOn: 0 });
          const ethStart = ethiopianDateFormatter(start, { month: 'short', day: 'numeric' });
          const ethEnd = ethiopianDateFormatter(end, { month: 'short', day: 'numeric', year: 'numeric' });
          return { value: val, label: `Week of ${ethStart} - ${ethEnd}` };
      });
  }, [allAttendance]);

  const monthOptions = useMemo(() => {
    const today = new Date();
    const ethNow = toEthiopian(today);
    const currentMonthStr = format(toGregorian(ethNow.year, ethNow.month, 1), "yyyy-MM-dd");
    const months = new Set<string>([currentMonthStr]);

    allAttendance.forEach(r => {
        const d = getDateFromRecord(r.date);
        if (isValid(d)) {
            const eth = toEthiopian(d);
            months.add(format(toGregorian(eth.year, eth.month, 1), "yyyy-MM-dd"));
        }
    });

    return Array.from(months)
      .sort((a, b) => b.localeCompare(a))
      .map(val => {
          const start = new Date(val);
          const eth = toEthiopian(start);
          return { value: val, label: `${ethiopianDateFormatter(start, { month: 'long' })} ${eth.year}` };
      });
  }, [allAttendance]);

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    let d: Date;
    if (date?.toDate) {
      d = date.toDate();
    } else if (typeof date?.seconds === 'number') {
      d = new Date(date.seconds * 1000);
    } else {
      d = new Date(date);
    }
    return isValid(d) ? format(d, "MMM d, yyyy") : "N/A";
  };

  const dailyEarnings = useMemo(() => {
    if (!employees || !selectedDay) return [];
    
    return employees.filter(e => e.status !== 'Inactive' || todayAttendance?.some(r => r.employeeId === e.id)).map(emp => {
        const record = todayAttendance?.find(r => r.employeeId === emp.id);
        let amount = 0;
        if (emp.paymentMethod === 'Weekly') {
            const hourly = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            amount = record ? (calculateHoursWorked(record) + (record.overtimeHours || 0)) * (hourly || 0) : (getDay(new Date(selectedDay)) === 0 ? (hourly || 0) * 8 : 0);
        } else {
            const daily = (emp.monthlyRate || 0) / (getMonthlyWorkingUnits(new Date(selectedDay), 30));
            amount = record ? daily : 0; 
        }
        return { 
            employeeId: emp.id, name: emp.name, morning: record?.morningEntry || "—", afternoon: record?.afternoonEntry || "—",
            status: record?.morningStatus || "Absent", amount, overtimeHours: record?.overtimeHours || 0
        };
    });
  }, [employees, todayAttendance, selectedDay]);

  const totalDailyEarnings = useMemo(() => dailyEarnings.reduce((acc, curr) => acc + curr.amount, 0), [dailyEarnings]);
  const totalWeeklyPayroll = useMemo(() => weeklyPayroll.reduce((acc, curr) => acc + curr.amount, 0), [weeklyPayroll]);
  const totalMonthlyPayroll = useMemo(() => monthlyPayroll.reduce((acc, curr) => acc + curr.amount, 0), [monthlyPayroll]);

  if (loading) {
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" role="status">
                <span className="sr-only">Loading...</span>
            </div>
        </div>
    );
  }

  const renderAttendanceBadge = (status: string) => {
    return (
      <Badge 
        variant={status === 'Absent' ? 'destructive' : 'outline'}
        className={cn(
          "shadow-none",
          status === 'Present' && "bg-secondary text-secondary-foreground border-transparent",
          status === 'Late' && "bg-amber-100 text-amber-700 border-amber-200",
          status === 'Permission' && "bg-blue-100 text-blue-700 border-blue-200"
        )}
      >
        {status}
      </Badge>
    );
  };

  const handleGlobalDateSelect = (date: Date | undefined) => {
      if (date) {
          const dayStr = format(date, "yyyy-MM-dd");
          setSelectedDay(dayStr);
          setSelectedWeekStart(format(startOfWeek(date, { weekStartsOn: 0 }), "yyyy-MM-dd"));
          const eth = toEthiopian(date);
          const monthStart = toGregorian(eth.year, eth.month, 1);
          setSelectedMonthStart(format(monthStart, "yyyy-MM-dd"));
      }
  };

  const handlePrevDay = () => {
    const d = parse(selectedDay, "yyyy-MM-dd", new Date());
    if (isValid(d)) handleGlobalDateSelect(addDays(d, -1));
  };

  const handleNextDay = () => {
    const d = parse(selectedDay, "yyyy-MM-dd", new Date());
    if (isValid(d)) handleGlobalDateSelect(addDays(d, 1));
  };

  const attendancePercentage = dashboardStats.totalEmployees > 0 ? (dashboardStats.onSiteToday / dashboardStats.totalEmployees) * 100 : 0;

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 bg-gradient-to-r from-primary/10 to-transparent rounded-2xl border">
        <div className="w-full md:w-auto text-center md:text-left">
          <h2 className="text-3xl font-bold tracking-tight">Welcome back!</h2>
          <p className="text-muted-foreground mt-1">Here is what's happening today at FurnishWise.</p>
        </div>
        <div className="flex items-center gap-4 bg-background/50 p-4 rounded-xl border shadow-sm w-full md:w-auto justify-between md:justify-center">
           <div className="flex flex-col items-end">
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">
                {ethiopianDateFormatter(new Date(), { month: 'long' })} {toEthiopian(new Date()).year}
              </span>
              <span className="text-2xl font-bold">
                {ethiopianDateFormatter(new Date(), { weekday: 'long', day: 'numeric' })}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(), "PPP")}
              </span>
           </div>
           <div className="h-12 w-[1px] bg-border mx-2" />
           <div className="bg-primary/20 p-3 rounded-full">
              <CalendarDays className="h-6 w-6 text-primary" />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard 
          title="Active Employees" 
          value={dashboardStats.totalEmployees} 
          icon={<div className="bg-blue-500/10 p-2 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>} 
        />
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-site Today</CardTitle>
            <div className="bg-green-500/10 p-2 rounded-lg"><UserCheck className="h-5 w-5 text-green-600" /></div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl sm:text-3xl font-bold">{dashboardStats.onSiteToday} / {dashboardStats.totalEmployees}</div>
            <div className="flex flex-col gap-1">
              <Progress value={attendancePercentage} className="h-2" />
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                {attendancePercentage.toFixed(0)}% attendance rate
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Payroll</CardTitle>
            <div className="bg-amber-500/10 p-2 rounded-lg"><HandCoins className="h-5 w-5 text-amber-600" /></div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xl sm:text-2xl font-bold">ETB {dashboardStats.actualWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="flex items-center gap-2">
               <Badge variant="outline" className="text-[10px] font-medium py-0 h-4 border-amber-200 text-amber-700 bg-amber-50">
                 Est: ETB {dashboardStats.estWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
               </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
            <div className="bg-purple-500/10 p-2 rounded-lg"><Wallet className="h-5 w-5 text-purple-600" /></div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xl sm:text-2xl font-bold">ETB {dashboardStats.actualMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="flex items-center gap-2">
               <Badge variant="outline" className="text-[10px] font-medium py-0 h-4 border-purple-200 text-purple-700 bg-purple-50">
                 Est: ETB {dashboardStats.estMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
               </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

       <div className="flex flex-col gap-8">
        <Card className="shadow-lg border-primary/20">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-3 rounded-xl">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                      <CardTitle className="text-xl">Detailed Overview</CardTitle>
                      <CardDescription>Track payments and performance across periods</CardDescription>
                  </div>
                </div>
                <div className="flex justify-center w-full sm:w-auto">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-10 px-4 flex items-center gap-2 font-medium bg-background border-primary/30 hover:bg-primary/5 transition-colors">
                                <CalendarDays className="h-4 w-4 text-primary" />
                                {ethiopianDateFormatter(new Date(selectedDay), { month: 'long', day: 'numeric', year: 'numeric' })}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={new Date(selectedDay)}
                                onSelect={handleGlobalDateSelect}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <Tabs defaultValue="today">
                    <TabsList className="grid w-full grid-cols-3 mb-8 h-12 p-1 bg-muted/50">
                        <TabsTrigger value="today" className="text-sm font-semibold">Today</TabsTrigger>
                        <TabsTrigger value="week" className="text-sm font-semibold">This Week</TabsTrigger>
                        <TabsTrigger value="month" className="text-sm font-semibold">This Month</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="today" className="space-y-6">
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-xl w-fit">
                                <Button variant="ghost" size="icon" onClick={handlePrevDay} className="hover:bg-background shadow-sm">
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Input 
                                type="date" 
                                value={selectedDay} 
                                onChange={(e) => setSelectedDay(e.target.value)} 
                                className="border-none bg-transparent font-medium focus-visible:ring-0 w-[140px]" 
                                />
                                <Button variant="ghost" size="icon" onClick={handleNextDay} className="hover:bg-background shadow-sm">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4 md:hidden">
                            {dailyEarnings.map(item => (
                                <div key={item.employeeId} className="border rounded-xl p-4 space-y-3 bg-card shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <Link href={`/employees/${item.employeeId}`} className="font-bold text-lg hover:underline">{item.name}</Link>
                                        {renderAttendanceBadge(item.status)}
                                    </div>
                                    <div className="grid grid-cols-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
                                        <div><span className="font-semibold text-foreground">Morning:</span> {item.morning}</div>
                                        <div><span className="font-semibold text-foreground">Afternoon:</span> {item.afternoon}</div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-dashed">
                                        <div className="text-xs">
                                            {item.overtimeHours > 0 && <Badge variant="secondary" className="bg-primary/10 text-primary border-none">+{item.overtimeHours} hrs OT</Badge>}
                                        </div>
                                        <div className="font-bold text-lg text-primary">ETB {item.amount.toFixed(2)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="hidden md:block overflow-hidden rounded-xl border">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-bold">Employee</TableHead>
                                        <TableHead className="font-bold">Morning</TableHead>
                                        <TableHead className="font-bold">Afternoon</TableHead>
                                        <TableHead className="font-bold">Status</TableHead>
                                        <TableHead className="font-bold">OT</TableHead>
                                        <TableHead className="text-right font-bold">Earnings Today</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dailyEarnings.map(item => (
                                        <TableRow key={item.employeeId} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-medium">
                                                <Link href={`/employees/${item.employeeId}`} className="hover:underline">{item.name}</Link>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground font-mono text-xs">{item.morning}</TableCell>
                                            <TableCell className="text-muted-foreground font-mono text-xs">{item.afternoon}</TableCell>
                                            <TableCell>{renderAttendanceBadge(item.status)}</TableCell>
                                            <TableCell>
                                              {item.overtimeHours > 0 ? (
                                                <Badge variant="secondary" className="bg-primary/5 text-primary border-none">+{item.overtimeHours} hrs</Badge>
                                              ) : (
                                                <span className="text-muted-foreground/30">—</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-primary text-lg">ETB {item.amount.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        
                        <div className="flex justify-center pt-4">
                            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 w-full max-md:max-w-full max-w-md text-center shadow-sm">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total Daily Earnings</p>
                                <p className="text-4xl font-black text-primary">ETB {totalDailyEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="week" className="space-y-6">
                        <div className="flex flex-col gap-6">
                            <div className="flex justify-center w-full">
                                <div className="flex items-center gap-2 w-full max-w-sm">
                                    <Select value={selectedWeekStart} onValueChange={(v) => setSelectedWeekStart(v)}>
                                        <SelectTrigger className="h-10 font-medium border-primary/20"><SelectValue placeholder="Select week" /></SelectTrigger>
                                        <SelectContent>{weekOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:hidden">
                                {weeklyPayroll.map(entry => (
                                    <div key={entry.employeeId} className="border rounded-xl p-4 space-y-3 bg-card shadow-sm">
                                        <Link href={`/employees/${entry.employeeId}`} className="font-bold text-lg hover:underline">{entry.employeeName}</Link>
                                        <div className="flex justify-between text-sm items-center bg-muted/30 p-2 rounded-lg">
                                            <span className="text-muted-foreground">Working Hours:</span>
                                            <span className="font-bold">{entry.totalHours?.toFixed(1)} hrs</span>
                                        </div>
                                        {entry.overtimeHours > 0 && (
                                            <div className="flex justify-between text-sm text-primary items-center bg-primary/5 p-2 rounded-lg">
                                                <span>Overtime:</span>
                                                <span className="font-bold">+{entry.overtimeHours} hrs (ETB {entry.overtimeAmount?.toFixed(2)})</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 text-[10px] text-muted-foreground pt-1 px-2">
                                            {entry.minutesLate > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Late: {entry.minutesLate}m</span>}
                                            {entry.hoursAbsent > 0 && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> Absent: {entry.hoursAbsent.toFixed(1)}h</span>}
                                        </div>
                                        <div className="flex justify-between pt-3 border-t border-dashed font-bold items-center">
                                            <span className="text-sm">Weekly Total:</span>
                                            <span className="text-2xl text-primary tracking-tight">ETB {entry.amount.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="hidden md:block overflow-hidden rounded-xl border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="font-bold">Employee</TableHead>
                                            <TableHead className="font-bold">Working Hours</TableHead>
                                            <TableHead className="font-bold">Late/Absent</TableHead>
                                            <TableHead className="font-bold">Overtime</TableHead>
                                            <TableHead className="text-right font-bold">Weekly Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {weeklyPayroll.map(entry => (
                                            <TableRow key={entry.employeeId} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="font-medium">
                                                    <Link href={`/employees/${entry.employeeId}`} className="hover:underline">{entry.employeeName}</Link>
                                                </TableCell>
                                                <TableCell className="font-semibold">{entry.totalHours?.toFixed(1)} hrs</TableCell>
                                                <TableCell className="text-xs">
                                                    <div className="flex flex-col gap-1">
                                                      {entry.minutesLate > 0 && <span className="text-amber-600 font-medium">{entry.minutesLate}m late</span>}
                                                      {entry.hoursAbsent > 0 && <span className="text-destructive font-medium">{entry.hoursAbsent.toFixed(1)}h absent</span>}
                                                      {entry.minutesLate === 0 && entry.hoursAbsent === 0 && <span className="text-muted-foreground/30">—</span>}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {entry.overtimeHours > 0 ? (
                                                        <div className="flex flex-col">
                                                          <span className="text-primary font-bold">+{entry.overtimeHours} hrs</span>
                                                          <span className="text-[10px] text-muted-foreground">ETB {entry.overtimeAmount?.toFixed(2)}</span>
                                                        </div>
                                                    ) : <span className="text-muted-foreground/30">—</span>}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-primary text-xl tracking-tight">ETB {entry.amount.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            
                            <div className="flex justify-center py-4">
                                <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-6 w-full max-md:max-w-full max-w-md text-center shadow-sm">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total Weekly Payroll</p>
                                    <p className="text-4xl font-black text-amber-600">ETB {totalWeeklyPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="month" className="space-y-6">
                        <div className="flex flex-col gap-6">
                            <div className="flex justify-center w-full">
                                <div className="flex items-center gap-3 w-full max-sm:max-w-full max-w-sm">
                                    <Select value={selectedMonthStart} onValueChange={(v) => setSelectedMonthStart(v)}>
                                        <SelectTrigger className="h-10 font-medium border-primary/20"><SelectValue placeholder="Select month" /></SelectTrigger>
                                        <SelectContent>{monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:hidden">
                                {monthlyPayroll.map(entry => (
                                    <div key={entry.employeeId} className="border rounded-xl p-4 space-y-3 bg-card shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <Link href={`/employees/${entry.employeeId}`} className="font-bold text-lg hover:underline">{entry.employeeName}</Link>
                                            <Badge variant="outline" className="text-[10px] px-2 h-5">{entry.paymentMethod}</Badge>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
                                            {entry.minutesLate > 0 ? <span className="text-amber-600 font-semibold">Late: {entry.minutesLate}m</span> : <span>No late mins</span>}
                                            {entry.hoursAbsent > 0 ? <span className="text-destructive font-semibold">Absent: {entry.hoursAbsent.toFixed(1)}h</span> : <span>No absences</span>}
                                        </div>
                                        {entry.overtimeHours > 0 && (
                                            <div className="flex justify-between text-sm text-primary items-center bg-primary/5 p-2 rounded-lg">
                                                <span>Overtime:</span>
                                                <span className="font-bold">+{entry.overtimeHours} hrs (ETB {entry.overtimeAmount?.toFixed(2)})</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between pt-3 border-t border-dashed font-bold items-center">
                                            <span className="text-sm">Month To-Date:</span>
                                            <span className="text-2xl text-primary tracking-tight">ETB {entry.amount.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="hidden md:block overflow-hidden rounded-xl border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="font-bold">Employee</TableHead>
                                            <TableHead className="font-bold">Method</TableHead>
                                            <TableHead className="font-bold">Late Time</TableHead>
                                            <TableHead className="font-bold">Absent Day (Hrs)</TableHead>
                                            <TableHead className="font-bold">Overtime</TableHead>
                                            <TableHead className="text-right font-bold">Month To-Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {monthlyPayroll.map(entry => (
                                            <TableRow key={entry.employeeId} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="font-medium">
                                                    <Link href={`/employees/${entry.employeeId}`} className="hover:underline">{entry.employeeName}</Link>
                                                </TableCell>
                                                <TableCell><Badge variant="outline" className="text-[10px] uppercase font-bold">{entry.paymentMethod}</Badge></TableCell>
                                                <TableCell className={entry.minutesLate > 0 ? "text-amber-600 font-bold" : "text-muted-foreground/30"}>
                                                    {entry.minutesLate > 0 ? `${entry.minutesLate}m` : "—"}
                                                </TableCell>
                                                <TableCell className={entry.hoursAbsent > 0 ? "text-destructive font-bold" : "text-muted-foreground/30"}>
                                                    {entry.hoursAbsent > 0 ? `${entry.hoursAbsent.toFixed(1)}h` : "—"}
                                                </TableCell>
                                                <TableCell>
                                                    {entry.overtimeHours > 0 ? (
                                                        <div className="flex flex-col">
                                                          <span className="text-primary font-bold">+{entry.overtimeHours} hrs</span>
                                                          <span className="text-[10px] text-muted-foreground">ETB {entry.overtimeAmount?.toFixed(2)}</span>
                                                        </div>
                                                    ) : <span className="text-muted-foreground/30">—</span>}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-primary text-xl tracking-tight">ETB {entry.amount.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            
                            <div className="flex justify-center py-4">
                                <div className="bg-purple-500/5 border border-purple-500/10 rounded-2xl p-6 w-full max-md:max-w-full max-w-md text-center shadow-sm">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total Monthly Payroll (Monthly-paid)</p>
                                    <p className="text-4xl font-black text-purple-600">ETB {totalMonthlyPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold">Upcoming Orders</h3>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary/80 gap-1 font-bold">
              <Link href="/orders">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          
          {upcomingOrders.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {upcomingOrders.map(order => (
                <Card key={order.id} className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-all group overflow-hidden">
                  <CardContent className="p-4 flex flex-col justify-between h-full min-h-[140px]">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <h4 className="font-bold text-sm truncate leading-tight group-hover:text-primary transition-colors">{order.uniqueName || "Untitled Order"}</h4>
                        {order.isUrgent && <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate font-medium uppercase tracking-tight">{order.customerName || "Private Client"}</p>
                    </div>
                    
                    <div className="space-y-2.5">
                      <div className="bg-muted/30 p-2 rounded-lg">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-muted-foreground font-bold uppercase tracking-widest">Deadline</span>
                          <Badge variant="secondary" className="text-[8px] h-3.5 py-0 px-1.5 uppercase font-bold">{order.status}</Badge>
                        </div>
                        <div className={cn(
                          "flex items-center gap-1.5 text-xs font-black",
                          order.isUrgent ? "text-destructive" : "text-amber-600"
                        )}>
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(order.deadline)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="bg-muted/20 border border-dashed rounded-2xl p-8 text-center">
              <PackageSearch className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">No upcoming orders</p>
              <p className="text-xs text-muted-foreground/60 mt-1">All projects are currently shipped or completed.</p>
            </div>
          )}
        </div>
        
        <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-xl">Payroll Trends</CardTitle>
                    <CardDescription>Visualizing unified expenses over the last 6 months</CardDescription>
                </div>
                <div className="bg-primary/10 p-2 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
            </CardHeader>
            <CardContent>
                <PayrollHistoryChart data={payrollHistory} />
            </CardContent>
        </Card>

        <Card className="shadow-lg border-primary/40 bg-primary/5">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary p-2.5 rounded-lg text-primary-foreground shadow-sm">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div>
                      <CardTitle className="text-xl">Total Workshop Expense (Unified)</CardTitle>
                      <CardDescription>Combined payroll for both Weekly and Monthly employees</CardDescription>
                  </div>
                </div>
                <div className="w-full sm:w-[240px]">
                    <Select value={selectedUnifiedMonth} onValueChange={(v) => setSelectedUnifiedMonth(v)}>
                        <SelectTrigger className="h-10 font-medium bg-background"><SelectValue placeholder="Select month" /></SelectTrigger>
                        <SelectContent>{monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="flex justify-center py-10">
                <div className="text-center">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3">Total Monthly Workshop Payout</p>
                    <p className="text-5xl md:text-7xl font-black text-primary tracking-tighter">ETB {totalUnifiedMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <div className="h-1 w-12 bg-primary/20 rounded-full" />
                      <div className="h-1 w-2 bg-primary rounded-full" />
                      <div className="h-1 w-12 bg-primary/20 rounded-full" />
                    </div>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
