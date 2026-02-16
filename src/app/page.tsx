
'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, Calendar, UserX, Clock, Hand } from "lucide-react";
import type { Employee, AttendanceRecord, AttendanceStatus } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PayrollHistoryChart } from './payroll/payroll-history-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

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
        } catch(e){}
    }
    return Math.round(minutesLate);
};

const StatusListItem = ({ employee, status, time }: { employee: Employee, status: AttendanceStatus, time?: string }) => (
    <Link href={`/employees/${employee.id}`} className="block hover:bg-accent rounded-lg -mx-2 px-2">
        <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-3">
                <Avatar className="w-9 h-9">
                    <AvatarFallback>{employee.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
                </Avatar>
                <div>
                    <p className="font-medium">{employee.name}</p>
                    <p className="text-sm text-muted-foreground">{employee.position}</p>
                </div>
            </div>
            {time ? (
                 <div className="text-sm text-right">
                    <Badge variant={status === 'Late' ? 'destructive' : 'secondary'} className="capitalize">{status}</Badge>
                    <p className="text-muted-foreground mt-1">{time}</p>
                 </div>
            ) : <Badge variant={status === 'Permission' ? 'default' : 'destructive'} className="capitalize">{status}</Badge>}
        </div>
    </Link>
);


export default function DashboardPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
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

    const weekStart = startOfWeek(today, { weekStartsOn: 0 }); // Sunday
    
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

        const periodDays = eachDayOfInterval(period);
        const recordedDates = new Set(recordsInWeek.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
        const employeeStartDate = new Date(emp.attendanceStartDate || 0);

        periodDays.forEach(day => {
            if (day >= employeeStartDate && getDay(day) === 0 && emp.paymentMethod !== 'Monthly') { 
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    hoursWorked += 8;
                }
            }
        });

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
            if (day >= employeeStartDate && getDay(day) !== 0) { // Mon-Sat
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    if (getDay(day) === 6) { // Saturday
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
  
  const todayStatus = useMemo(() => {
    if (!todayAttendance || !employees) return { absent: [], late: [], permission: [] };

    const absent: Employee[] = [];
    const late: { employee: Employee; time: string }[] = [];
    const permission: Employee[] = [];

    const today = new Date();
    const isSunday = getDay(today) === 0;

    employees.forEach(emp => {
        const record = todayAttendance.find(r => r.employeeId === emp.id);

        if (isSunday && emp.paymentMethod === 'Monthly') {
            return; // Skip monthly employees on Sunday, as they are auto-present
        }

        if (record?.morningStatus === 'Permission' || record?.afternoonStatus === 'Permission') {
            permission.push(emp);
        }
        
        if (record?.morningStatus === 'Late' || record?.afternoonStatus === 'Late') {
            const lateTimes = [];
            if (record.morningStatus === 'Late' && record.morningEntry) lateTimes.push(record.morningEntry);
            if (record.afternoonStatus === 'Late' && record.afternoonEntry) lateTimes.push(record.afternoonEntry);
            late.push({ employee: emp, time: lateTimes.join(' & ') });
        }
        
        if (!record || (record.morningStatus === 'Absent' && record.afternoonStatus === 'Absent')) {
             if (!record || (record.morningStatus !== 'Permission' && record.afternoonStatus !== 'Permission')) {
                absent.push(emp);
             }
        } else if (record.morningStatus === 'Absent' || record.afternoonStatus === 'Absent') {
             if (record.morningStatus !== 'Permission' && record.afternoonStatus !== 'Permission') {
                absent.push(emp);
             }
        }
    });

    return { absent, late, permission };

  }, [todayAttendance, employees]);

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
                const permissionDatesInYear = new Set<string>();
                allAttendance.filter(r => r.employeeId === employee.id).forEach(rec => {
                    const recDate = getDateFromRecord(rec.date);
                    if (toEthiopian(recDate).year === ethYearForPeriod) {
                        if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') {
                            permissionDatesInYear.add(format(recDate, 'yyyy-MM-dd'));
                        }
                    }
                });
                const sortedPermissionDates = Array.from(permissionDatesInYear).sort();
                const allowedPermissionDates = new Set(sortedPermissionDates.slice(0, 15));

                let totalHoursAbsent = 0;
                const minutesLate = employeeAttendance.reduce((acc, r) => {
                    const recordDate = getDateFromRecord(r.date);
                    const recordDateStr = format(recordDate, 'yyyy-MM-dd');

                    let morningIsUnpaidAbsence = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));
                    let afternoonIsUnpaidAbsence = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(recordDateStr));

                    if (morningIsUnpaidAbsence) totalHoursAbsent += 4.5;
                    if (getDay(recordDate) !== 6 && afternoonIsUnpaidAbsence) totalHoursAbsent += 3.5;
                    
                    return acc + calculateMinutesLate(r);
                }, 0);

                const periodDays = eachDayOfInterval(interval);
                const employeeStartDate = new Date(employee.attendanceStartDate || 0);
                const recordedDates = new Set(employeeAttendance.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));

                periodDays.forEach(day => {
                    if (day >= employeeStartDate && getDay(day) !== 0) { // Mon-Sat
                        const dayStr = format(day, 'yyyy-MM-dd');
                        if (!recordedDates.has(dayStr)) {
                            if (getDay(day) === 6) totalHoursAbsent += 4.5;
                            else totalHoursAbsent += 8;
                        }
                    }
                });

                const absenceDeduction = totalHoursAbsent * hourlyRateCalc;
                const lateDeduction = minutesLate * minuteRate;
                const netSalary = baseSalary - (absenceDeduction + lateDeduction);
                totalPayrollForMonth += netSalary > 0 ? netSalary : 0;

            } else { // Weekly
                const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
                if (!hourlyRate) return;

                const totalOvertimeHours = employeeAttendance.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
                let totalHours = employeeAttendance.reduce((acc, r) => acc + calculateHoursWorked(r), 0);

                const periodDays = eachDayOfInterval(interval);
                const recordedDates = new Set(employeeAttendance.map(r => format(getDateFromRecord(r.date), 'yyyy-MM-dd')));
                const employeeStartDate = new Date(employee.attendanceStartDate || 0);

                periodDays.forEach(day => {
                    if (day >= employeeStartDate && getDay(day) === 0) { // Is Sunday
                        const dayStr = format(day, 'yyyy-MM-dd');
                        if (!recordedDates.has(dayStr)) {
                            totalHours += 8;
                        }
                    }
                });
                
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


  const loading = employeesLoading || attendanceLoading || isUserLoading || todayAttendanceLoading;
  
  const today = new Date();

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
    <div className="flex flex-col gap-6">
        <Card>
            <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Calendar className="h-8 w-8 text-primary" />
                    <div>
                        <p className="text-xl font-semibold">{format(today, 'EEEE, MMMM d, yyyy')}</p>
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
          icon={<UserCheck className="h-5 w-s text-muted-foreground" />}
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

       <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Today's Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="absent">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="absent">
                                <UserX className="mr-2 h-4 w-4" /> Absent ({todayStatus.absent.length})
                            </TabsTrigger>
                            <TabsTrigger value="late">
                                <Clock className="mr-2 h-4 w-4" /> Late ({todayStatus.late.length})
                            </TabsTrigger>
                            <TabsTrigger value="permission">
                                <Hand className="mr-2 h-4 w-4" /> Permission ({todayStatus.permission.length})
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="absent" className="mt-4">
                            {todayStatus.absent.length > 0 ? (
                                todayStatus.absent.map(emp => <StatusListItem key={emp.id} employee={emp} status="Absent" />)
                            ) : <p className="text-muted-foreground text-center py-8 text-sm">No one is absent today.</p>}
                        </TabsContent>
                         <TabsContent value="late" className="mt-4">
                            {todayStatus.late.length > 0 ? (
                                todayStatus.late.map(item => <StatusListItem key={item.employee.id} employee={item.employee} status="Late" time={item.time} />)
                            ) : <p className="text-muted-foreground text-center py-8 text-sm">No one is late today.</p>}
                        </TabsContent>
                         <TabsContent value="permission" className="mt-4">
                            {todayStatus.permission.length > 0 ? (
                                todayStatus.permission.map(emp => <StatusListItem key={emp.id} employee={emp} status="Permission" />)
                            ) : <p className="text-muted-foreground text-center py-8 text-sm">No one is on leave today.</p>}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-3">
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
    </div>
  );
}

