
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
  getDay,
  differenceInDays,
  format,
  isValid,
  subMonths
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { type Employee, type AttendanceRecord } from "@/lib/types";
import { ExpenseChart } from "./payroll/expense-chart";
import { PayrollHistoryChart } from "./payroll/payroll-history-chart";

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

const getEthiopianMonthDays = (year: number, month: number): number => {
    if (month < 1 || month > 13) return 0;
    if (month <= 12) return 30;
    const isLeap = (year + 1) % 4 === 0;
    return isLeap ? 6 : 5;
};

const toEthiopian = (date: Date) => {
    const parts = ethiopianDateFormatter(date, { year: 'numeric', month: 'numeric', day: 'numeric' }).split('/');
    return {
        month: parseInt(parts[0], 10),
        day: parseInt(parts[1], 10),
        year: parseInt(parts[2], 10)
    };
};

const toGregorian = (ethYear: number, ethMonth: number, ethDay: number): Date => {
    const today = new Date();
    const ethToday = toEthiopian(today);
    // Rough conversion, not perfectly accurate but good enough for this app's purpose
    const dayDiff = ((ethYear - ethToday.year) * 365.25) + ((ethMonth - ethToday.month) * 30) + (ethDay - ethToday.day);
    return addDays(today, dayDiff);
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
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef);
  
  const today = new Date();
  const ethToday = toEthiopian(today);
  const monthStart = toGregorian(ethToday.year, ethToday.month, 1);
  const monthEnd = addDays(monthStart, getEthiopianMonthDays(ethToday.year, ethToday.month) - 1);
  const weekStart = addDays(today, (1 - getDay(today) + 7) % 7); // Monday
  const weekEnd = addDays(weekStart, 6); // Sunday

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
        const allRecords: AttendanceRecord[] = [];
        let date = new Date(employees.reduce((min, e) => !e.attendanceStartDate || new Date(e.attendanceStartDate) < min ? new Date(e.attendanceStartDate!) : min, new Date()));
        
        while(date <= today) {
            const dateStr = format(date, 'yyyy-MM-dd');
            const attColRef = collection(firestore, 'attendance', dateStr, 'records');
             try {
                const querySnapshot = await getDocs(attColRef);
                querySnapshot.forEach(doc => {
                    allRecords.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
                });
            } catch(e) {
                 const permissionError = new FirestorePermissionError({
                    path: attColRef.path,
                    operation: 'list',
                });
                errorEmitter.emit('permission-error', permissionError);
            }
            date = addDays(date, 1);
        }

        setAllAttendance(allRecords);
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
            (record.morningStatus !== "Absent" || record.afternoonStatus !== "Absent")
        );
        
        const totalHours = relevantRecords.reduce((acc, r) => {
             let hours = 0;
            if (r.morningStatus !== 'Absent') hours += 4.5;
            if (r.afternoonStatus !== 'Absent') hours += 3.5;
            return acc + hours;
        }, 0);
        
        const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        actualAmount += (totalHours + totalOvertime) * hourlyRate;
    });

    let estimatedFutureAmount = 0;
    const remainingDays = differenceInDays(monthEnd, today);
    
    if(remainingDays > 0) {
        let remainingWorkdays = 0;
        for (let i = 1; i <= remainingDays; i++) {
            const date = addDays(today, i);
            if (getDay(date) !== 0) { // Not Sunday
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
  }, [employees, attendanceRecords, today, monthStart, monthEnd]);

  const totalEmployees = employees?.length || 0;

  const upcomingTotals = useMemo(() => {
    if (!employees || !attendanceRecords) return { weekly: 0, monthly: 0 };
    
    return employees.reduce((acc, employee) => {
        const hourlyRate = employee.hourlyRate || 
            (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
            (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
        if (!hourlyRate) return acc;

        const period = employee.paymentMethod === 'Weekly' 
            ? { start: weekStart, end: today }
            : { start: monthStart, end: today };
        
        const relevantRecords = attendanceRecords.filter(r =>
            r.employeeId === employee.id &&
            (r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent") &&
            isWithinInterval(getDateFromRecord(r.date), period)
        );

        const totalHours = relevantRecords.reduce((total, r) => {
             let hours = 0;
            if (r.morningStatus !== 'Absent') hours += 4.5;
            if (r.afternoonStatus !== 'Absent') hours += 3.5;
            return total + hours;
        }, 0);
        const totalOvertime = relevantRecords.reduce((total, r) => total + (r.overtimeHours || 0), 0);
        const amount = (totalHours + totalOvertime) * hourlyRate;

        if (employee.paymentMethod === 'Weekly') {
            acc.weekly += amount;
        } else {
            acc.monthly += amount;
        }
        return acc;
    }, { weekly: 0, monthly: 0 });
  }, [employees, attendanceRecords, today, monthStart, weekStart]);

  const estimatedUpcomingTotals = useMemo(() => {
    if (!employees) return { weekly: 0, monthly: 0 };
    
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
  }, [employees, today, upcomingTotals, weekEnd, monthEnd]);

  const gregorianDate = format(today, 'EEEE, MMMM d, yyyy');
  const ethiopianFullDate = ethiopianDateFormatter(today, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  const payrollHistory = useMemo(() => {
    if (!employees || !attendanceRecords || employees.length === 0 || attendanceRecords.length === 0) return [];
    
    const history: { month: string, total: number }[] = [];
    
    for (let i = 0; i < 6; i++) {
        let monthDateEth = toEthiopian(subMonths(today, i));
        monthDateEth = {...monthDateEth, day: 1};
        if(i > 0) {
             monthDateEth.month = monthDateEth.month -1;
             if(monthDateEth.month === 0){
                monthDateEth.month = 13;
                monthDateEth.year = monthDateEth.year -1;
             }
        }

        const monthStart = toGregorian(monthDateEth.year, monthDateEth.month, 1);
        const monthEnd = addDays(monthStart, getEthiopianMonthDays(monthDateEth.year, monthDateEth.month) - 1);
        
        let monthTotal = 0;
        employees.forEach(employee => {
            const hourlyRate = employee.hourlyRate || 
                (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
                (employee.monthlyRate ? employee.monthlyRate / 26 / 8 : 0);
            if (!hourlyRate) return;

            const relevantRecords = attendanceRecords.filter(r =>
                r.employeeId === employee.id &&
                (r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent") &&
                isWithinInterval(getDateFromRecord(r.date), { start: monthStart, end: monthEnd })
            );

             const totalHours = relevantRecords.reduce((acc, r) => {
                let hours = 0;
                if (r.morningStatus !== 'Absent') hours += 4.5;
                if (r.afternoonStatus !== 'Absent') hours += 3.5;
                return acc + hours;
            }, 0);
            const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
            monthTotal += (totalHours + totalOvertime) * hourlyRate;
        });
        
        history.push({ month: ethiopianDateFormatter(monthStart, {month: 'short', year: 'numeric'}), total: monthTotal });
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
                        Monthly Expense ({ethiopianDateFormatter(today, {month: 'long'})})
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
            <CardTitle>Current Month Expense ({ethiopianDateFormatter(today, {month: 'long'})})</CardTitle>
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

    

    