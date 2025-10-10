
"use client";

import { useMemo, useEffect, useState } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
  parse,
  isValid,
  format,
} from "date-fns";
import { Timestamp } from "firebase/firestore";
import type { Employee, AttendanceRecord } from "@/lib/types";
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Calendar } from '@/components/ui/calendar';
import { ExpenseChart } from './expense-chart';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const calculateHoursWorked = (
  morningEntry?: string,
  afternoonEntry?: string
): number => {
  if (!morningEntry || !afternoonEntry) return 0;

  const morningStartTime = parse("08:00", "HH:mm", new Date());
  const morningEndTime = parse("12:30", "HH:mm", new Date());
  const afternoonStartTime = parse("13:30", "HH:mm", new Date());
  const afternoonEndTime = parse("17:00", "HH:mm", new Date());

  const morningEntryTime = parse(morningEntry, "HH:mm", new Date());
  const afternoonEntryTime = parse(afternoonEntry, "HH:mm", new Date());

  let totalHours = 0;

  if (morningEntryTime < morningEndTime) {
    const morningWorkMs =
      morningEndTime.getTime() -
      Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
    totalHours += morningWorkMs / (1000 * 60 * 60);
  }

  if (afternoonEntryTime < afternoonEndTime) {
    const afternoonWorkMs =
      afternoonEndTime.getTime() -
      Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
    totalHours += afternoonWorkMs / (1000 * 60 * 60);
  }

  return Math.max(0, totalHours);
};


const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
    if (!isValid(date)) return "Invalid Date";
    return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", options).format(date);
};

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (!date) return new Date();
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}

export default function PayrollPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());


  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef);
  
  useEffect(() => {
    const fetchAllAttendance = async () => {
        if (!firestore || !employees || employees.length === 0) {
          setAttendanceLoading(false);
          return;
        }

        setAttendanceLoading(true);
        const attendancePromises = employees.map(employee => {
            const attColRef = collection(firestore, 'employees', employee.id, 'attendance');
            return getDocs(attColRef);
        });

        const allSnapshots = await Promise.all(attendancePromises);
        const records = allSnapshots.flatMap(snapshot => 
            snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), employeeId: snapshot.query.parent?.parent?.id } as AttendanceRecord))
        );

        setAttendanceRecords(records);
        setAttendanceLoading(false);
    };

    if (!employeesLoading) {
      fetchAllAttendance();
    }
  }, [firestore, employees, employeesLoading]);
  
  useEffect(() => {
    setTitle("Payroll Analytics");
  }, [setTitle]);

  const handleMonthSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedMonth(date);
  }
  
  if (employeesLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>;
  }

  const calendarCaption = (
      <div className="flex flex-col items-center">
        <p>{format(selectedMonth, 'MMMM yyyy')}</p>
        <p className="text-sm text-muted-foreground">
          {ethiopianDateFormatter(selectedMonth, { month: 'long', year: 'numeric' })}
        </p>
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
        <Card>
          <CardHeader>
              <CardTitle>Expense History</CardTitle>
              <CardDescription>Select a month to view the detailed expense breakdown.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !selectedMonth && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedMonth ? (
                            <div className="flex flex-col">
                               <span>{format(selectedMonth, "MMMM yyyy")}</span>
                               <span className="text-xs text-muted-foreground">{ethiopianDateFormatter(selectedMonth, { month: 'long', year: 'numeric' })}</span>
                            </div>
                        ) : (
                            <span>Pick a month</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedMonth}
                        onSelect={handleMonthSelect}
                        initialFocus
                        captionLayout="dropdown-buttons"
                        fromYear={2015}
                        toYear={2035}
                      />
                    </PopoverContent>
                  </Popover>
            </div>
             <div className="lg:col-span-2">
                <ExpenseChart 
                    employees={employees || []} 
                    attendanceRecords={attendanceRecords} 
                    selectedMonth={selectedMonth} 
                />
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
    