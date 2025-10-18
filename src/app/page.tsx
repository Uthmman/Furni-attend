
'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, Calendar } from "lucide-react";
import type { Employee, AttendanceRecord } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, addDays } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Card, CardContent } from '@/components/ui/card';

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

export default function DashboardPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  
  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  
  const { data: employees, loading: employeesLoading } = useCollection<Employee>(employeesCollectionRef);
  
  const todayAttendanceCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return collection(firestore, 'attendance', todayStr, 'records');
  }, [firestore, user]);

  const { data: todayAttendance, loading: todayAttendanceLoading } = useCollection<AttendanceRecord>(todayAttendanceCollectionRef);

  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  useEffect(() => {
    const fetchAllAttendance = async () => {
        if (!firestore || !employees || employees.length === 0) {
          setAttendanceLoading(false);
          return;
        }

        setAttendanceLoading(true);
        const allRecords: AttendanceRecord[] = [];
        const attendanceStartDate = employees.reduce((min, e) => {
          if (!e.attendanceStartDate) return min;
          const d = new Date(e.attendanceStartDate);
          return d < min ? d : min;
        }, new Date());
        
        let date = attendanceStartDate;
        const today = new Date();
        
        while(date <= today) {
            const dateStr = format(date, 'yyyy-MM-dd');
            const attColRef = collection(firestore, 'attendance', dateStr, 'records');
             try {
                const querySnapshot = await getDocs(attColRef);
                querySnapshot.forEach(doc => {
                    allRecords.push({ id: doc.id, ...doc.data(), employeeId: doc.data().employeeId } as AttendanceRecord);
                });
            } catch(e: any) {
                 errorEmitter.emit('permission-error', e);
            }
            date = addDays(date, 1);
        }

        setAllAttendance(allRecords);
        setAttendanceLoading(false);
    };

    if (!employeesLoading && !isUserLoading && employees) {
      fetchAllAttendance();
    }
  }, [firestore, employees, employeesLoading, isUserLoading]);


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

    // Week calculations
    const weekStart = startOfWeek(today, { weekStartsOn: 0 }); // Sunday
    
    const estWeekly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod === 'Weekly' && emp.dailyRate) {
            return acc + (emp.dailyRate * 7); // 7-day work week
        }
        return acc;
    }, 0);

    const actualWeekly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Weekly') return acc;
        const hourlyRate = emp.hourlyRate || (emp.dailyRate ? emp.dailyRate / 8 : 0);
        if (!hourlyRate) return acc;

        const recordsInWeek = allAttendance.filter(r => 
            r.employeeId === emp.id &&
            isWithinInterval(new Date(r.date as string), { start: weekStart, end: today }) &&
            (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')
        );
        const hoursWorked = recordsInWeek.reduce((sum, r) => {
            let hours = 0;
            if (r.morningStatus !== 'Absent') hours += 4.5;
            if (r.afternoonStatus !== 'Absent') hours += 3.5;
            return sum + hours + (r.overtimeHours || 0);
        }, 0);
        return acc + (hoursWorked * hourlyRate);
    }, 0);

    // Month calculations
    const monthStart = toGregorian(ethToday.year, ethToday.month, 1);
    
    const estMonthly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod === 'Monthly' && emp.monthlyRate) {
            return acc + emp.monthlyRate;
        }
        return acc;
    }, 0);

    const actualMonthly = employees.reduce((acc, emp) => {
        if (emp.paymentMethod !== 'Monthly') return acc;
        const hourlyRate = emp.hourlyRate || (emp.monthlyRate ? emp.monthlyRate / 26 / 8 : 0);
        if (!hourlyRate) return acc;

        const recordsInMonth = allAttendance.filter(r => 
            r.employeeId === emp.id &&
            isWithinInterval(new Date(r.date as string), { start: monthStart, end: today }) &&
            (r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent')
        );

        const hoursWorked = recordsInMonth.reduce((sum, r) => {
            let hours = 0;
            if (r.morningStatus !== 'Absent') hours += 4.5;
            if (r.afternoonStatus !== 'Absent') hours += 3.5;
            return sum + hours + (r.overtimeHours || 0);
        }, 0);

        return acc + (hoursWorked * hourlyRate);
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
  
  const loading = employeesLoading || attendanceLoading || isUserLoading || todayAttendanceLoading;
  
  const today = new Date();

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="flex flex-col gap-6">
        <Card>
            <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Calendar className="h-6 w-6 text-primary" />
                    <div>
                        <p className="text-lg font-semibold">{format(today, 'EEEE, MMMM d, yyyy')}</p>
                        <p className="text-sm text-muted-foreground">{ethiopianDateFormatter(today, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
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
            value={`ETB ${dashboardStats.actualWeekly.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            icon={<Wallet className="h-5 w-5 text-muted-foreground" />}
            description={`Est: ETB ${dashboardStats.estWeekly.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        />
        <StatCard
            title="This Month's Payroll"
            value={`ETB ${dashboardStats.actualMonthly.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            icon={<Wallet className="h-5 w-5 text-muted-foreground" />}
            description={`Est: ETB ${dashboardStats.estMonthly.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        />
      </div>
    </div>
  );
}
