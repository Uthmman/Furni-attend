
'use client';

import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Wallet } from "lucide-react";
import Link from 'next/link';
import {
  isWithinInterval,
  addDays,
  parse,
  endOfMonth,
  getDay,
  startOfMonth,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  format,
  isValid,
  subMonths,
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { type Employee, type AttendanceRecord, type PayrollEntry } from "@/lib/types";
import { ExpenseChart } from "./payroll/expense-chart";
import { PayrollHistoryChart } from "./payroll/payroll-history-chart";

const calculateHoursWorked = (morningEntry?: string, afternoonEntry?: string): number => {
    if (!morningEntry || !afternoonEntry) return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    const morningEntryTime = parse(morningEntry, "HH:mm", new Date());
    const afternoonEntryTime = parse(afternoonEntry, "HH:mm", new Date());
    
    let totalHours = 0;

    if(morningEntryTime < morningEndTime) {
        const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
        totalHours += morningWorkMs / (1000 * 60 * 60);
    }
    
    if(afternoonEntryTime < afternoonEndTime) {
        const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
        totalHours += afternoonWorkMs / (1000 * 60 * 60);
    }

    return Math.max(0, totalHours);
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

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (!date) return new Date();
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}

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
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef);
  
  const today = new Date();
  const monthStart = startOfMonth(today);

  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  useEffect(() => {
    const fetchAllAttendance = async () => {
        if (!firestore || !employees || employees.length === 0) {
            setAttendanceLoading(false);
            return;
        };

        setAttendanceLoading(true);
        const attendancePromises = employees.map(employee => {
            const attColRef = collection(firestore, 'employees', employee.id, 'attendance');
            return getDocs(attColRef);
        });

        const allSnapshots = await Promise.all(attendancePromises);
        const records = allSnapshots.flatMap(snapshot => 
            snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord))
        );

        setAllAttendance(records);
        setAttendanceLoading(false);
    };

    if (!employeesLoading && !isUserLoading) {
      fetchAllAttendance();
    }
  }, [firestore, employees, employeesLoading, isUserLoading]);


  const attendanceRecords = useMemo(() => {
      if (!allAttendance) return [];
      return allAttendance;
  }, [allAttendance]);

  const monthlyExpense = useMemo(() => {
    if(!employees || !attendanceRecords) return { actual: 0, estimated: 0 };
    const monthEnd = endOfMonth(today);
    
    let actualAmount = 0;
    
    employees.forEach(employee => {
        const hourlyRate = employee.hourlyRate || 
            (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
            (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
        if(!hourlyRate) return;

        const relevantRecords = attendanceRecords.filter(
            (record) =>
            record.employeeId === employee.id &&
            isWithinInterval(getDateFromRecord(record.date), {start: monthStart, end: today}) &&
            (record.status === "Present" || record.status === "Late")
        );

        const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
        const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        actualAmount += (totalHours + totalOvertime) * hourlyRate;
    });

    let estimatedFutureAmount = 0;
    const remainingDays = differenceInDays(monthEnd, today);
    
    if(remainingDays > 0) {
        let remainingWorkdays = 0;
        for (let i = 1; i <= remainingDays; i++) {
            const date = addDays(today, i);
            if (getDay(date) !== 0) { // Monday to Saturday are working days (0 is Sunday)
                remainingWorkdays++;
            }
        }
        
        employees.forEach(employee => {
            const dailyRate = employee.dailyRate || 
                (employee.monthlyRate ? employee.monthlyRate / 26 : 0) ||
                (employee.hourlyRate ? employee.hourlyRate * 8 : 0);
            if(dailyRate) {
                estimatedFutureAmount += dailyRate * remainingWorkdays;
            }
        });
    }

    return {
        actual: actualAmount,
        estimated: actualAmount + estimatedFutureAmount
    };
  }, [employees, attendanceRecords, today, monthStart]);

  const totalEmployees = employees?.length || 0;

  const upcomingTotals = useMemo(() => {
    if (!employees || !attendanceRecords) return { weekly: 0, monthly: 0 };
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    
    return employees.reduce((acc, employee) => {
        const hourlyRate = employee.hourlyRate || 
            (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
            (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
        if (!hourlyRate) return acc;

        const period = employee.paymentMethod === 'Weekly' 
            ? { start: currentWeekStart, end: today }
            : { start: monthStart, end: today };
        
        const relevantRecords = attendanceRecords.filter(r =>
            r.employeeId === employee.id &&
            (r.status === "Present" || r.status === "Late") &&
            isWithinInterval(getDateFromRecord(r.date), period)
        );

        const totalHours = relevantRecords.reduce((total, r) => total + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
        const totalOvertime = relevantRecords.reduce((total, r) => total + (r.overtimeHours || 0), 0);
        const amount = (totalHours + totalOvertime) * hourlyRate;

        if (employee.paymentMethod === 'Weekly') {
            acc.weekly += amount;
        } else {
            acc.monthly += amount;
        }
        return acc;
    }, { weekly: 0, monthly: 0 });
  }, [employees, attendanceRecords, today, monthStart]);

  const estimatedUpcomingTotals = useMemo(() => {
    if (!employees) return { weekly: 0, monthly: 0 };
    
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const monthEnd = endOfMonth(today);
    
    let estimatedWeekly = upcomingTotals.weekly;
    let estimatedMonthly = upcomingTotals.monthly;

    const remainingDaysInWeek = differenceInDays(weekEnd, today);
    if(remainingDaysInWeek > 0) {
        let remainingWorkdays = 0;
        for (let i = 1; i <= remainingDaysInWeek; i++) {
            const date = addDays(today, i);
            if (getDay(date) !== 0) { // Not Sunday
                remainingWorkdays++;
            }
        }
        employees.filter(e => e.paymentMethod === 'Weekly').forEach(emp => {
            const dailyRate = emp.dailyRate || (emp.hourlyRate ? emp.hourlyRate * 8 : 0);
            if (dailyRate) estimatedWeekly += dailyRate * remainingWorkdays;
        });
    }

    const remainingDaysInMonth = differenceInDays(monthEnd, today);
    if(remainingDaysInMonth > 0) {
        let remainingWorkdays = 0;
        for (let i = 1; i <= remainingDaysInMonth; i++) {
            const date = addDays(today, i);
            if (getDay(date) !== 0) { // Not Sunday
                remainingWorkdays++;
            }
        }
        employees.filter(e => e.paymentMethod === 'Monthly').forEach(emp => {
             const dailyRate = emp.monthlyRate ? emp.monthlyRate / 26 : (emp.hourlyRate ? emp.hourlyRate * 8 : 0);
            if (dailyRate) estimatedMonthly += dailyRate * remainingWorkdays;
        });
    }

    return { weekly: estimatedWeekly, monthly: estimatedMonthly };
  }, [employees, today, upcomingTotals]);

  const gregorianDate = format(today, 'EEEE, MMMM d, yyyy');
  const ethiopianFullDate = ethiopianDateFormatter(today, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  const payrollHistory = useMemo(() => {
    if (!employees || !attendanceRecords || employees.length === 0 || attendanceRecords.length === 0) return [];
    
    const history: { month: string, total: number }[] = [];
    const sixMonthsAgo = startOfMonth(subMonths(today, 5));
    
    for (let i = 0; i < 6; i++) {
        const monthDate = startOfMonth(subMonths(today, i));
        const monthKey = format(monthDate, 'yyyy-MM');
        
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        
        let monthTotal = 0;
        employees.forEach(employee => {
            const hourlyRate = employee.hourlyRate || 
                (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
                (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
            if (!hourlyRate) return;

            const relevantRecords = attendanceRecords.filter(r =>
                r.employeeId === employee.id &&
                (r.status === "Present" || r.status === "Late") &&
                isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd })
            );

            const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r.morningEntry, r.afternoonEntry), 0);
            const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
            monthTotal += (totalHours + totalOvertime) * hourlyRate;
        });
        
        history.push({ month: format(monthDate, 'MMM yyyy'), total: monthTotal });
    }
    
    return history.reverse();
  }, [employees, attendanceRecords]);

  if (isUserLoading || employeesLoading || attendanceLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2">
            <CardHeader>
                 <CardTitle>{gregorianDate}</CardTitle>
                 <p className="text-muted-foreground">{ethiopianFullDate}</p>
            </CardHeader>
            <CardContent className="flex items-center justify-center p-6 text-center">
            </CardContent>
        </Card>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-8">
             <Link href="/employees" className="hover:shadow-lg transition-shadow rounded-xl">
                <StatCard
                title="Total Employees"
                value={totalEmployees}
                icon={<Users className="size-5 text-muted-foreground" />}
                />
            </Link>
             <Card className="hover:shadow-lg transition-shadow rounded-xl col-span-2 lg:col-span-1">
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center justify-between">
                        Monthly Expense
                        <Wallet className="size-5 text-muted-foreground" />
                    </CardTitle>
                </CardHeader>
                 <CardContent className="flex flex-col gap-2">
                    <div>
                        <p className="text-xs text-muted-foreground">Estimated Total</p>
                        <p className="text-2xl font-bold">ETB {monthlyExpense.estimated.toFixed(2)}</p>
                    </div>
                     <div>
                        <p className="text-xs text-muted-foreground">Actual to Date</p>
                        <p className="text-lg font-semibold text-primary">ETB {monthlyExpense.actual.toFixed(2)}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
      
       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="hover:shadow-lg transition-shadow rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold">Upcoming Weekly Payout</CardTitle>
                <Wallet className="size-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                <div>
                    <p className="text-xs text-muted-foreground">Estimated Total</p>
                    <p className="text-2xl font-bold">ETB {estimatedUpcomingTotals.weekly.toFixed(2)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Actual to Date</p>
                    <p className="text-lg font-semibold text-primary">ETB {upcomingTotals.weekly.toFixed(2)}</p>
                </div>
            </CardContent>
        </Card>
        <Card className="hover:shadow-lg transition-shadow rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold">Upcoming Monthly Payout</CardTitle>
                <Wallet className="size-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                <div>
                    <p className="text-xs text-muted-foreground">Estimated Total</p>
                    <p className="text-2xl font-bold">ETB {estimatedUpcomingTotals.monthly.toFixed(2)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Actual to Date</p>
                    <p className="text-lg font-semibold text-primary">ETB {upcomingTotals.monthly.toFixed(2)}</p>
                </div>
            </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Current Month Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseChart
              employees={employees || []}
              attendanceRecords={attendanceRecords}
              selectedMonth={today}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payroll History (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <PayrollHistoryChart data={payrollHistory} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

    