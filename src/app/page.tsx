
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Wallet } from "lucide-react";
import Link from 'next/link';
import {
  isWithinInterval,
  addDays,
  parse,
  endOfMonth,
  getDay,
  startOfMonth,
  getDaysInMonth,
  isSunday,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  format,
  isValid
} from "date-fns";
import { type Timestamp } from "firebase/firestore";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, collectionGroup, query, where, getDocs, type CollectionReference } from "firebase/firestore";
import { type Employee, type AttendanceRecord, type PayrollEntry } from "@/lib/types";

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
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef as CollectionReference<Employee>);
  
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
      const monthStart = startOfMonth(new Date());
      return allAttendance.filter(record => getDateFromRecord(record.date) >= monthStart);
  }, [allAttendance]);


  const recentPayroll = useMemo((): PayrollEntry[] => {
    if (!employees || !attendanceRecords) return [];
    const payroll: PayrollEntry[] = [];
  
    employees.forEach((employee) => {
      const hourlyRate = employee.hourlyRate || 
        (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
        (employee.monthlyRate ? employee.monthlyRate / 22 / 8 : 0);
  
      if (!hourlyRate) return;
  
      if (employee.paymentMethod === "Weekly") {
        const isPaymentDayApproaching = getDay(today) >= 4; // Thursday, Friday, Saturday
  
        if (isPaymentDayApproaching) {
          const weekStart = startOfWeek(today, { weekStartsOn: 1 });
          const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
          const weekPeriod = { start: weekStart, end: weekEnd };
  
           const relevantRecords = attendanceRecords.filter(
              (record) =>
                record.employeeId === employee.id &&
                (record.status === "Present" || record.status === "Late") &&
                isWithinInterval(getDateFromRecord(record.date), weekPeriod)
            );
            
            let totalHours = 0;
            relevantRecords.forEach(record => {
                totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
            });
            
            const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
            const totalAmount = (totalHours + totalOvertime) * hourlyRate;
  
            if (totalAmount > 0) {
              payroll.push({
                employeeId: employee.id,
                employeeName: employee.name,
                paymentMethod: "Weekly",
                period: `${ethiopianDateFormatter(weekPeriod.start, {day: 'numeric', month: 'short'})} - ${ethiopianDateFormatter(weekPeriod.end, {day: 'numeric', month: 'short', year: 'numeric'})}`,
                amount: totalAmount,
                status: "Unpaid",
                workingDays: relevantRecords.length,
              });
            }
        }
      } else if (employee.paymentMethod === "Monthly") {
          const endOfMonthDate = endOfMonth(today);
          const isEndOfMonth = differenceInDays(endOfMonthDate, today) <= 3;
  
          if(isEndOfMonth) {
              const monthPeriod = { start: monthStart, end: endOfMonthDate };
              const relevantRecords = attendanceRecords.filter(
                  (record) =>
                  record.employeeId === employee.id &&
                  (record.status === "Present" || record.status === "Late") &&
                  isWithinInterval(getDateFromRecord(record.date), monthPeriod)
              );
  
              let totalHours = 0;
              relevantRecords.forEach(record => {
                  totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
              });
              
              const totalOvertime = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
              const totalAmount = (totalHours + totalOvertime) * hourlyRate;
  
              if(totalAmount > 0) {
                   payroll.push({
                      employeeId: employee.id,
                      employeeName: employee.name,
                      paymentMethod: "Monthly",
                      period: ethiopianDateFormatter(monthPeriod.start, { year: 'numeric', month: 'long' }),
                      amount: totalAmount,
                      status: "Unpaid",
                      workingDays: relevantRecords.length,
                  });
              }
          }
      }
    });
  
    return payroll.filter((p) => p.amount > 0);
  }, [employees, attendanceRecords, today, monthStart]);

  const monthlyExpense = useMemo(() => {
    if(!employees || !attendanceRecords) return { actual: 0, estimated: 0 };
    const monthEnd = endOfMonth(today);
    
    let actualAmount = 0;
    
    employees.forEach(employee => {
        const hourlyRate = employee.hourlyRate || 
            (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
            (employee.monthlyRate ? employee.monthlyRate / 22 / 8 : 0);
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
            if (!isSunday(date)) { // Monday to Saturday are working days
                remainingWorkdays++;
            }
        }
        
        employees.forEach(employee => {
            const dailyRate = employee.dailyRate || 
                (employee.monthlyRate ? employee.monthlyRate / 22 : 0) ||
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
    return recentPayroll.reduce((acc, entry) => {
        if (entry.paymentMethod === 'Weekly') {
            acc.weekly += entry.amount;
        } else {
            acc.monthly += entry.amount;
        }
        return acc;
    }, { weekly: 0, monthly: 0 });
  }, [recentPayroll]);

  const gregorianDate = format(today, 'EEEE, MMMM d, yyyy');
  const ethiopianFullDate = ethiopianDateFormatter(today, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
        <StatCard
          title="Upcoming Weekly Payout"
          value={`ETB ${upcomingTotals.weekly.toFixed(2)}`}
          icon={<Wallet className="size-5 text-muted-foreground" />}
          description="Total for current week"
        />
        <StatCard
          title="Upcoming Monthly Payout"
          value={`ETB ${upcomingTotals.monthly.toFixed(2)}`}
          icon={<Wallet className="size-5 text-muted-foreground" />}
          description="Total for current month"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {recentPayroll.length > 0 && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Upcoming Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Days Worked</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayroll.map((entry) => (
                    <TableRow key={`${entry.employeeId}-${entry.period}`}>
                      <TableCell>
                        <Link href={`/employees/${entry.employeeId}`} className="font-medium hover:underline">{entry.employeeName}</Link>
                        <div className="text-sm text-muted-foreground">
                          {entry.paymentMethod}
                        </div>
                      </TableCell>
                      <TableCell>{entry.period}</TableCell>
                      <TableCell>{entry.workingDays}</TableCell>
                      <TableCell>ETB {entry.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.status === "Paid" ? "secondary" : "destructive"
                          }
                        >
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
