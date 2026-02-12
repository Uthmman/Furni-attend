
'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, Calendar } from "lucide-react";
import type { Employee, AttendanceRecord } from "@/lib/types";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, addDays, parse, getDay, eachDayOfInterval } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter } from "@/firebase";
import { collection, getDocs, FirestoreError } from "firebase/firestore";
import { Card, CardContent } from '@/components/ui/card';
import { FirestorePermissionError } from '@/firebase/errors';

const getDateFromRecord = (date: string | any): Date => {
  if (date?.toDate) {
    return date.toDate();
  }
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
        const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
        if(isValid(morningEntryTime) && morningEntryTime < morningEndTime) {
            const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
            totalHours += morningWorkMs / (1000 * 60 * 60);
        }
    }
    
    if (record.afternoonStatus !== 'Absent' && record.afternoonEntry) {
        const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
        if(isValid(afternoonEntryTime) && afternoonEntryTime < afternoonEndTime) {
            const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
            totalHours += afternoonWorkMs / (1000 * 60 * 60);
        }
    }

    return Math.max(0, totalHours);
};

const calculateMinutesLate = (record: AttendanceRecord): number => {
    if (!record) return 0;
    let minutesLate = 0;
    if (record.morningStatus === 'Late' && record.morningEntry) {
        const morningStartTime = parse("08:00", "HH:mm", new Date());
        const morningEntryTime = parse(record.morningEntry, "HH:mm", new Date());
        if (isValid(morningEntryTime) && morningEntryTime > morningStartTime) {
            minutesLate += (morningEntryTime.getTime() - morningStartTime.getTime()) / (1000 * 60);
        }
    }
    if (record.afternoonStatus === 'Late' && record.afternoonEntry) {
        const afternoonStartTime = parse("13:30", "HH:mm", new Date());
        const afternoonEntryTime = parse(record.afternoonEntry, "HH:mm", new Date());
        if (isValid(afternoonEntryTime) && afternoonEntryTime > afternoonStartTime) {
            minutesLate += (afternoonEntryTime.getTime() - afternoonStartTime.getTime()) / (1000 * 60);
        }
    }
    return Math.round(minutesLate);
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
    const fetchAllAttendance = () => {
        if (!firestore || !employees || employees.length === 0) {
          setAttendanceLoading(false);
          return;
        }

        setAttendanceLoading(true);
        const allRecords: AttendanceRecord[] = [];

        const employeePromises = (employees || []).map(emp => {
            const attendanceColRef = collection(firestore, 'employees', emp.id, 'attendance');
            return getDocs(attendanceColRef).catch(error => {
                if (error instanceof FirestoreError) {
                    const permissionError = new FirestorePermissionError({
                        path: attendanceColRef.path,
                        operation: 'list'
                    });
                    errorEmitter.emit('permission-error', permissionError);
                }
                return { docs: [] as any[] }; // Return empty on error to not break Promise.all
            });
        });

        Promise.all(employeePromises)
            .then(snapshots => {
                snapshots.forEach(snapshot => {
                    snapshot.docs.forEach(doc => {
                        allRecords.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
                    });
                });
                setAllAttendance(allRecords);
            })
            .catch(error => {
                console.error("Error fetching all attendance records:", error);
                 const permissionError = new FirestorePermissionError({
                    path: 'employees/{employeeId}/attendance',
                    operation: 'list'
                });
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => {
                setAttendanceLoading(false);
            });
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
            if (day >= employeeStartDate && getDay(day) === 0) { 
                const dayStr = format(day, 'yyyy-MM-dd');
                if (!recordedDates.has(dayStr)) {
                    hoursWorked += 8;
                }
            }
        });

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
        
        const baseSalary = emp.monthlyRate || 0;
        if (baseSalary === 0) return acc;
        
        const dailyRate = baseSalary / 23.625;
        const hourlyRate = dailyRate / 8;
        const minuteRate = hourlyRate / 60;

        const period = { start: monthStart, end: today };
        const recordsInMonth = allAttendance.filter(r => 
            r.employeeId === emp.id &&
            isValid(getDateFromRecord(r.date)) &&
            isWithinInterval(getDateFromRecord(r.date), period)
        );
        
        let totalHoursAbsent = 0;
        const minutesLate = recordsInMonth.reduce((sum, r) => {
            if (r.morningStatus === 'Absent') totalHoursAbsent += 4.5;
            if (r.afternoonStatus === 'Absent') totalHoursAbsent += 3.5;
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
