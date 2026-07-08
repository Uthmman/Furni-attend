
'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, UserX, Clock, Hand, CalendarDays, ListFilter } from "lucide-react";
import type { Employee, AttendanceRecord, AttendanceStatus, PayrollEntry } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, subMonths, isSameDay } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PayrollHistoryChart } from './payroll/payroll-history-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { sendAdminPayrollSummary } from './payroll/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


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
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return collection(firestore, 'attendance', todayStr, 'records');
  }, [firestore, user]);

  const { data: todayAttendance, loading: todayAttendanceLoading } = useCollection<AttendanceRecord>(todayAttendanceCollectionRef);

  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  const dashboardStats = useMemo(() => {
    if (!employees) return {
        totalEmployees: 0,
        onSiteToday: 0,
        estWeekly: 0,
        actualWeekly: 0,
        estMonthly: 0,
        actualMonthly: 0,
    };

    const totalEmployees = employees.length;
    const onSiteToday = todayAttendance?.filter(
      (r) => r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent"
    ).length || 0;
    
    const today = new Date();
    const ethToday = toEthiopian(today);

    const weekStart = startOfWeek(today, { weekStartsOn: 0 }); 
    
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

        const period = { start: weekStart, end: today };
        const recordsInWeek = allAttendance.filter(r => 
            r.employeeId === emp.id &&
            isValid(new Date(r.date as string)) &&
            isWithinInterval(new Date(r.date as string), period)
        );
        let hoursWorked = recordsInWeek.reduce((sum, r) => {
            return sum + calculateHoursWorked(r) + (r.overtimeHours || 0);
        }, 0);

        return acc + (hoursWorked * hourlyRate);
    }, 0);

    const monthStart = toGregorian(ethToday.year, ethToday.month, 1);
    
    const estMonthly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod === 'Monthly' && emp.monthlyRate) {
            return acc + emp.monthlyRate;
        }
        return acc;
    }, 0);

    const actualMonthly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Monthly') return acc;
        
        const baseSalary = emp.monthlyRate || 0;
        if (baseSalary === 0) return acc;
        
        const dailyRate = baseSalary / 23.625;
        const hourlyRate = dailyRate / 8;
        const minuteRate = hourlyRate / 60;
        
        const ethYearForPeriod = toEthiopian(monthStart).year;
        const permissionDatesInYear = new Set<string>();
        allAttendance.filter(r => r.employeeId === emp.id).forEach(rec => {
            const recDate = getDateFromRecord(rec.date);
            if (toEthiopian(recDate).year === ethYearForPeriod) {
                if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') {
                    permissionDatesInYear.add(format(recDate, 'yyyy-MM-dd'));
                }
            }
        });
        const sortedPermissionDates = Array.from(permissionDatesInYear).sort();
        const allowedPermissionDates = new Set(sortedPermissionDates.slice(0, 15));

        const period = { start: monthStart, end: today };
        const recordsInMonth = allAttendance.filter(r => 
            r.employeeId === emp.id &&
            isValid(getDateFromRecord(r.date)) &&
            isWithinInterval(getDateFromRecord(r.date), period)
        );
        
        let totalHoursAbsent = 0;
        const minutesLate = recordsInMonth.reduce((sum, r) => {
            const recordDate = getDateFromRecord(r.date);
            const recordDateStr = format(recordDate, 'yyyy-MM-dd');

            let morningIsUnpaidAbsence = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));
            let afternoonIsUnpaidAbsence = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));
            
            if (morningIsUnpaidAbsence) {
                totalHoursAbsent += 4.5;
            }
            if (getDay(recordDate) !== 6 && afternoonIsUnpaidAbsence) {
                totalHoursAbsent += 3.5;
            }
            return sum + calculateMinutesLate(r);
        }, 0);

        const periodDays = eachDayOfInterval(period);
        const employeeStartDate = new Date(emp.attendanceStartDate || 0);
        const recordedDates = new Set(recordsInMonth.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

        periodDays.forEach(day => {
            if (day >= employeeStartDate && getDay(day) !== 0 && day <= today) { 
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    if (getDay(day) === 6) { 
                        totalHoursAbsent += 4.5;
                    } else {
                        totalHoursAbsent += 8;
                    }
                }
            }
        });
        
        const absenceDeduction = totalHoursAbsent * hourlyRate;
        const lateDeduction = minutesLate * minuteRate;
        
        const netSalary = baseSalary - absenceDeduction - lateDeduction;

        return acc + netSalary;
    }, 0);


    return {
      totalEmployees,
      onSiteToday,
      estWeekly,
      actualWeekly,
      estMonthly,
      actualMonthly
    };
  }, [employees, allAttendance, todayAttendance]);

  const payrollHistory = useMemo(() => {
    if (!employees || allAttendance.length === 0) return [];
    
    const history = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(today, i);
        const ethDateForMonth = toEthiopian(monthDate);
        const monthStart = toGregorian(ethDateForMonth.year, ethDateForMonth.month, 1);
        const daysInMonth = getEthiopianMonthDays(ethDateForMonth.year, ethDateForMonth.month);
        const monthEnd = addDays(monthStart, daysInMonth - 1);
        
        const interval = { start: monthStart, end: monthEnd };
        let totalPayrollForMonth = 0;

        employees.forEach(employee => {
            const employeeAttendance = allAttendance.filter(r => 
                r.employeeId === employee.id && isWithinInterval(getDateFromRecord(r.date), interval)
            );
            
            if (employee.paymentMethod === 'Monthly') {
                const baseSalary = employee.monthlyRate || 0;
                if (baseSalary === 0) return;

                const dailyRate = baseSalary / 23.625;
                const hourlyRateCalc = dailyRate / 8;
                const minuteRate = hourlyRateCalc / 60;
                
                const ethYearForPeriod = toEthiopian(monthStart).year;
                const allEmployeeRecords = allAttendance.filter(r => r.employeeId === employee.id);
                const permissionDatesInYear = new Set<string>();
                allEmployeeRecords.forEach(rec => {
                    const recDate = getDateFromRecord(rec.date);
                    if (toEthiopian(recDate).year === ethYearForPeriod) {
                        if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') {
                            permissionDatesInYear.add(format(recDate, 'yyyy-MM-dd'));
                        }
                    }
                });
                const sortedPermissionDates = Array.from(permissionDatesInYear).sort();
                const allowedPermissionDates = new Set(sortedPermissionDates.slice(0, 15));
        
                const calculationPeriod = { start: monthStart, end: monthEnd };
                const allRecordsForMonth = allAttendance.filter(r => 
                    r.employeeId === employee.id &&
                    isValid(getDateFromRecord(r.date)) &&
                    isWithinInterval(getDateFromRecord(r.date), calculationPeriod)
                );
                const recordedDatesForMonth = new Set(allRecordsForMonth.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

                let projectedHoursAbsent = 0;
                let displayMinutesLate = 0;
                
                allRecordsForMonth.forEach(r => {
                    const recordDate = getDateFromRecord(r.date);
                    if(recordDate > today) return;

                    let hoursAbsentThisRecord = 0;
                    const recordDateStr = format(recordDate, 'yyyy-MM-dd');
                    const morningIsUnpaidAbsence = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));
                    const afternoonIsUnpaidAbsence = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));

                    if (morningIsUnpaidAbsence) hoursAbsentThisRecord += 4.5;
                    if (getDay(recordDate) !== 6 && afternoonIsUnpaidAbsence) hoursAbsentThisRecord += 3.5;
                    
                    projectedHoursAbsent += hoursAbsentThisRecord;
                    displayMinutesLate += calculateMinutesLate(r);
                });
                
                const calculationPeriodDays = eachDayOfInterval(calculationPeriod);
                const employeeStartDate = new Date(employee.attendanceStartDate || 0);

                calculationPeriodDays.forEach(day => {
                    if (day >= employeeStartDate && getDay(day) !== 0 && day <= today) { 
                        const dayStr = format(day, 'yyyy-MM-dd');
                        if (!recordedDatesForMonth.has(dayStr)) {
                            projectedHoursAbsent += (getDay(day) === 6) ? 4.5 : 8;
                        }
                    }
                });

                const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
                const projectedAbsenceDeduction = projectedHoursAbsent * (hourlyRateCalc || hourlyRate);
                const lateDeduction = displayMinutesLate * minuteRate;
                
                const netSalary = baseSalary - (projectedAbsenceDeduction + lateDeduction);
                totalPayrollForMonth += netSalary > 0 ? netSalary : 0;

            } else { 
                const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
                if (!hourlyRate) return;

                const totalOvertimeHours = employeeAttendance.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
                let totalHours = employeeAttendance.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
                
                const totalAmount = (totalHours + totalOvertimeHours) * hourlyRate;
                totalPayrollForMonth += totalAmount > 0 ? totalAmount : 0;
            }
        });

        history.push({
            month: format(monthStart, 'MMM'),
            total: totalPayrollForMonth,
        });
    }
    return history;
}, [employees, allAttendance]);

  const weeklyPayroll = useMemo(() => {
    const today = new Date();
    if (!employees || allAttendance.length === 0) return [];
    
    const weekly: PayrollEntry[] = [];
    const weekStart = startOfWeek(today, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    
    employees.filter(employee => employee.paymentMethod === 'Weekly').forEach(employee => {
        const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
        if (!hourlyRate) return;

        const period = { start: weekStart, end: today };
        const relevantRecords = allAttendance.filter(r => 
            r.employeeId === employee.id &&
            isValid(getDateFromRecord(r.date)) &&
            isWithinInterval(getDateFromRecord(r.date), period)
        );

        const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
        const overtimeHours = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        
        const finalAmount = (totalHours + overtimeHours) * hourlyRate;

        weekly.push({
            employeeId: employee.id,
            employeeName: employee.name,
            paymentMethod: employee.paymentMethod,
            period: "This Week",
            amount: finalAmount,
            status: 'Unpaid',
            totalHours: totalHours + overtimeHours
        });
    });

    return weekly;
  }, [employees, allAttendance]);

  const monthlyPayroll = useMemo(() => {
    const today = new Date();
    if (!employees || allAttendance.length === 0) return [];

    const monthly: PayrollEntry[] = [];
    const ethToday = toEthiopian(today);
    const monthStart = toGregorian(ethToday.year, ethToday.month, 1);

    employees.filter(employee => employee.paymentMethod === 'Monthly').forEach(employee => {
        const baseSalary = employee.monthlyRate || 0;
        if (baseSalary === 0) return;

        const dailyRate = baseSalary / 23.625;
        const hourlyRate = dailyRate / 8;
        const minuteRate = hourlyRate / 60;

        const calculationPeriod = { start: monthStart, end: today };
        const allRecordsForMonth = allAttendance.filter(r => 
            r.employeeId === employee.id &&
            isValid(getDateFromRecord(r.date)) &&
            isWithinInterval(getDateFromRecord(r.date), calculationPeriod)
        );
        const recordedDatesForMonth = new Set(allRecordsForMonth.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

        let projectedHoursAbsent = 0;
        let displayMinutesLate = 0;
        
        allRecordsForMonth.forEach(r => {
            const recordDate = getDateFromRecord(r.date);
            const morningIsUnpaidAbsence = r.morningStatus === 'Absent';
            const afternoonIsUnpaidAbsence = r.afternoonStatus === 'Absent' && getDay(recordDate) !== 6;

            if (morningIsUnpaidAbsence) projectedHoursAbsent += 4.5;
            if (afternoonIsUnpaidAbsence) projectedHoursAbsent += 3.5;
            displayMinutesLate += calculateMinutesLate(r);
        });
        
        const calculationPeriodDays = eachDayOfInterval(calculationPeriod);
        const employeeStartDate = new Date(employee.attendanceStartDate || 0);

        calculationPeriodDays.forEach(day => {
            if (day >= employeeStartDate && getDay(day) !== 0 && day <= today) { 
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDatesForMonth.has(dayStr)) {
                    projectedHoursAbsent += (getDay(day) === 6) ? 4.5 : 8;
                }
            }
        });

        const netSalary = baseSalary - (projectedHoursAbsent * hourlyRate) - (displayMinutesLate * minuteRate);

        monthly.push({
            employeeId: employee.id,
            employeeName: employee.name,
            paymentMethod: employee.paymentMethod,
            period: "This Month",
            amount: netSalary,
            status: 'Unpaid',
            hoursAbsent: projectedHoursAbsent,
            minutesLate: displayMinutesLate
        });
    });

    return monthly;

  }, [employees, allAttendance]);

  const dailyEarnings = useMemo(() => {
    if (!employees || !todayAttendance) return [];
    
    return employees.map(emp => {
        const record = todayAttendance.find(r => r.employeeId === emp.id);
        let amount = 0;
        
        if (emp.paymentMethod === 'Weekly') {
            const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
            if (record) {
                const hours = calculateHoursWorked(record);
                const overtime = record.overtimeHours || 0;
                amount = (hours + overtime) * hourlyRate;
            } else if (getDay(new Date()) === 0) { 
                amount = 8 * hourlyRate; 
            }
        } else { 
            const baseSalary = emp.monthlyRate || 0;
            const dailyRate = baseSalary / 23.625;
            const minuteRate = dailyRate / 8 / 60;
            
            if (getDay(new Date()) === 0) {
                amount = dailyRate;
            } else if (record) {
                let deduction = 0;
                if (record.morningStatus === 'Absent') deduction += (4.5 / 8) * dailyRate;
                if (record.afternoonStatus === 'Absent' && getDay(new Date()) !== 6) deduction += (3.5 / 8) * dailyRate;
                deduction += calculateMinutesLate(record) * minuteRate;
                amount = dailyRate - deduction;
            } else {
                amount = 0;
            }
        }
        
        return {
            employeeId: emp.id,
            name: emp.name,
            morning: record?.morningEntry || "—",
            afternoon: record?.afternoonEntry || "—",
            status: record?.morningStatus || (getDay(new Date()) === 0 ? "Present" : "Absent"),
            amount: Math.max(0, amount)
        };
    });
  }, [employees, todayAttendance]);

  const loading = employeesLoading || attendanceLoading || isUserLoading || todayAttendanceLoading;

  if (loading) {
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div
                className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"
                role="status"
            >
                <span className="sr-only">Loading...</span>
            </div>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Employees"
          value={dashboardStats.totalEmployees}
          icon={<Users className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          title="On-site Today"
          value={`${dashboardStats.onSiteToday} / ${dashboardStats.totalEmployees}`}
          icon={<UserCheck className="h-5 w-5 text-muted-foreground" />}
        />
         <StatCard
            title="This Week's Payroll"
            value={`ETB ${dashboardStats.actualWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={<Wallet className="h-5 w-5 text-muted-foreground" />}
            description={`Est: ETB ${dashboardStats.estWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <StatCard
            title="This Month's Payroll"
            value={`ETB ${dashboardStats.actualMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={<Wallet className="h-5 w-5 text-muted-foreground" />}
            description={`Est: ETB ${dashboardStats.estMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
      </div>

       <div className="flex flex-col gap-8">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Overview</CardTitle>
                    <CardDescription>Real-time attendance and payment summaries</CardDescription>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {ethiopianDateFormatter(new Date(), { month: 'long', day: 'numeric', year: 'numeric' })}
                </Badge>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="today">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="today">
                            Today
                        </TabsTrigger>
                        <TabsTrigger value="week">
                            This Week
                        </TabsTrigger>
                        <TabsTrigger value="month">
                            This Month
                        </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="today">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Morning</TableHead>
                                    <TableHead>Afternoon</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Today's Pay</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dailyEarnings.map(item => (
                                    <TableRow key={item.employeeId}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell>{item.morning}</TableCell>
                                        <TableCell>{item.afternoon}</TableCell>
                                        <TableCell>
                                            <Badge variant={item.status === 'Absent' ? 'destructive' : 'secondary'}>
                                                {item.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-primary">
                                            ETB {item.amount.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TabsContent>

                    <TabsContent value="week">
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Summary</TableHead>
                                    <TableHead className="text-right">Earned This Week</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {weeklyPayroll.map(entry => (
                                    <TableRow key={entry.employeeId}>
                                        <TableCell className="font-medium">{entry.employeeName}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{entry.paymentMethod}</Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {entry.totalHours?.toFixed(1)} hrs recorded
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-primary">
                                            ETB {entry.amount.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {weeklyPayroll.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No weekly employees found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TabsContent>

                    <TabsContent value="month">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Summary</TableHead>
                                    <TableHead className="text-right">Month To-Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthlyPayroll.map(entry => (
                                    <TableRow key={entry.employeeId}>
                                        <TableCell className="font-medium">{entry.employeeName}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {entry.hoursAbsent?.toFixed(1)}h absent · {entry.minutesLate}m late
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-primary">
                                            ETB {entry.amount.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {monthlyPayroll.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No monthly employees found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
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
