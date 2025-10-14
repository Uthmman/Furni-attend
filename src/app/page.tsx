
'use client';

import { useMemo, useEffect } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { StatCard } from "@/components/stat-card";
import { Users, UserCheck, Wallet, Calendar } from "lucide-react";
import type { Employee, AttendanceRecord } from "@/lib/types";
import { format, isValid } from "date-fns";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection } from "firebase/firestore";
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


export default function DashboardPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  
  const { data: employees, loading: employeesLoading } = useCollection<Employee>(employeesCollectionRef);
  
  const attendanceCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return collection(firestore, 'attendance', todayStr, 'records');
  }, [firestore, user]);

  const { data: todayAttendance, loading: attendanceLoading } = useCollection<AttendanceRecord>(attendanceCollectionRef);


  useEffect(() => {
    setTitle("Dashboard");
  }, [setTitle]);

  const { totalEmployees, onSiteToday, upcomingPayout } = useMemo(() => {
    const totalEmployees = employees?.length || 0;

    const onSiteToday = todayAttendance?.filter(
      (r) => r.morningStatus !== "Absent" || r.afternoonStatus !== "Absent"
    ).length || 0;
    
    let totalPayout = 0;
    if (employees) {
        employees.forEach(emp => {
            if (emp.paymentMethod === 'Weekly' && emp.dailyRate) {
                // Assuming a 5-day work week for weekly payout calculation
                totalPayout += emp.dailyRate * 5; 
            } else if (emp.paymentMethod === 'Monthly' && emp.monthlyRate) {
                totalPayout += emp.monthlyRate;
            }
        });
    }

    return {
      totalEmployees,
      onSiteToday,
      upcomingPayout: `ETB ${totalPayout.toLocaleString()}`
    };
  }, [employees, todayAttendance]);
  
  const loading = employeesLoading || attendanceLoading || isUserLoading;
  
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Employees"
          value={totalEmployees}
          icon={<Users className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          title="On-site Today"
          value={`${onSiteToday} / ${totalEmployees}`}
          icon={<UserCheck className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          title="Est. Monthly Payout"
          value={upcomingPayout}
          icon={<Wallet className="h-5 w-5 text-muted-foreground" />}
          description="Based on all employee rates"
        />
      </div>
    </div>
  );
}
