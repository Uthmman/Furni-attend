
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
  format,
  isValid,
  addDays,
  isWithinInterval,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  parse,
  getDay,
  startOfDay,
  endOfDay
} from "date-fns";
import { Timestamp, getDocs, doc } from "firebase/firestore";
import type { Employee, AttendanceRecord, PayrollEntry, PayrollSettings } from "@/lib/types";
import { useFirestore, useUser, useMemoFirebase, useDoc } from '@/firebase';
import { collection } from 'firebase/firestore';
import { ExpenseChart } from './expense-chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollection } from '@/firebase';
import { PayrollList } from './payroll-list';

const getDateFromRecord = (date: string | Timestamp): Date => {
  if (!date) return new Date();
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  return new Date(date);
}

const ethiopianDateFormatter = (date: Date, options: Intl.DateTimeFormatOptions): string => {
    if (!isValid(date)) return "Invalid Date";
    try {
        const customOptions: Intl.DateTimeFormatOptions = { ...options };
        if (customOptions.era) delete customOptions.era;
        return new Intl.DateTimeFormat("en-US-u-ca-ethiopic", customOptions).format(date);
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
    // Saturdays counted as 0.5625 units for Monthly staff payout logic
    return weekdays + (saturdays * 0.5625);
};

const calculateHoursWorked = (record: AttendanceRecord): number => {
    if (!record) return 0;
    const recordDate = getDateFromRecord(record.date);

    if (getDay(recordDate) === 0) { // Sunday check
        if (record.morningStatus !== 'Absent' || record.afternoonStatus !== 'Absent') return 8;
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


export default function PayrollPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [monthOptions, setMonthOptions] = useState<{label: string, value: string}[]>([]);
  
  const [selectedWeek, setSelectedWeek] = useState<Date | undefined>(undefined);
  const [weekOptions, setWeekOptions] = useState<{label: string, value: string}[]>([]);


  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);
  const { data: employees, loading: employeesLoading } = useCollection(employeesCollectionRef);
  
  const settingsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "metadata", "payroll_settings");
  }, [firestore, user]);
  const { data: settings } = useDoc<PayrollSettings>(settingsRef);
  
  useEffect(() => {
    const fetchAllAttendance = async () => {
        if (!firestore || !employees || employees.length === 0) {
          setAttendanceLoading(false);
          return;
        }

        setAttendanceLoading(true);
        const allRecords: AttendanceRecord[] = [];
        
        for (const emp of employees) {
            const attendanceColRef = collection(firestore, 'employees', emp.id, 'attendance');
            const querySnapshot = await getDocs(attendanceColRef);
            querySnapshot.forEach(doc => {
                allRecords.push({ id: doc.id, employeeId: emp.id, ...doc.data() } as AttendanceRecord);
            });
        }
        setAllAttendance(allRecords);
        setAttendanceLoading(false);
    };

    if (!employeesLoading && !isUserLoading && employees) {
      fetchAllAttendance();
    }
  }, [firestore, employees, employeesLoading, isUserLoading]);
  
  useEffect(() => {
    setTitle("Payroll Analytics");

    if (allAttendance.length > 0 && employees && employees.length > 0) {
        const today = new Date();
        
        const earliestAttendance = employees.reduce((min, e) => {
            if (!e.attendanceStartDate) return min;
            const d = new Date(e.attendanceStartDate);
            return d < min ? d : min;
        }, new Date());
        
        const mOptions = [];
        let currentMonthStart = toGregorian(toEthiopian(today).year, toEthiopian(today).month, 1);
        for(let i=0; i < 12; i++){
            const ethDate = toEthiopian(currentMonthStart);
            const monthStart = toGregorian(ethDate.year, ethDate.month, 1);
            if (monthStart < addDays(earliestAttendance, -31)) break;
            const monthName = ethiopianDateFormatter(monthStart, { month: 'long' });
            mOptions.push({ value: format(monthStart, "yyyy-MM-dd"), label: `${monthName} ${ethDate.year}` });
            const prevMonthDate = addDays(monthStart, -5);
            const prevEthDate = toEthiopian(prevMonthDate);
            currentMonthStart = toGregorian(prevEthDate.year, prevEthDate.month, 1);
        }
        setMonthOptions(mOptions);
        if (mOptions.length > 0) setSelectedMonth(new Date(mOptions[0]?.value));

        const wOptions = [];
        let currentWeekStart = startOfWeek(today, { weekStartsOn: 0 }); 
        for(let i=0; i < 12; i++){
            const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 }); 
            if (weekEnd < earliestAttendance) break;
            const startDayEth = ethiopianDateFormatter(currentWeekStart, { day: 'numeric', month: 'short' });
            const endDayEth = ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' });
            wOptions.push({ value: format(currentWeekStart, "yyyy-MM-dd"), label: `${startDayEth} - ${endDayEth}` });
            currentWeekStart = addDays(currentWeekStart, -7);
        }
        setWeekOptions(wOptions);
        if(wOptions.length > 0) setSelectedWeek(new Date(wOptions[0].value));
    }
  }, [setTitle, allAttendance, employees]);


  const weeklyPayroll = useMemo(() => {
    if (!employees || allAttendance.length === 0 || !selectedWeek) return [];
    
    const normalOTRate = settings?.normalOvertimeRate || 1.5;

    const weekly: PayrollEntry[] = [];
    const weekStart = startOfDay(selectedWeek);
    const weekEnd = endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 }));
    const weekPeriodLabel = `${ethiopianDateFormatter(weekStart, { day: 'numeric', month: 'short' })} - ${ethiopianDateFormatter(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    
    employees.filter(employee => employee.paymentMethod === 'Weekly').forEach(employee => {
        const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
        if (!hourlyRate) return;

        const period = { start: weekStart, end: weekEnd };
        
        const relevantRecords = allAttendance.filter(r => 
            r.employeeId === employee.id &&
            isValid(getDateFromRecord(r.date)) &&
            isWithinInterval(getDateFromRecord(r.date), period)
        );

        const totalHours = relevantRecords.reduce((acc, r) => acc + calculateHoursWorked(r), 0);
        const overtimeHours = relevantRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
        
        let minutesLate = 0;
        let hoursAbsent = 0;
        const periodDays = eachDayOfInterval(period);
        const recordedDates = new Set(relevantRecords.map(r => r.id));

        relevantRecords.forEach(r => {
            minutesLate += calculateMinutesLate(r);
            if (r.morningStatus === 'Absent') hoursAbsent += 4.5;
            if (r.afternoonStatus === 'Absent') hoursAbsent += 3.5;
        });

        periodDays.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (!recordedDates.has(dayStr)) {
                if (getDay(day) !== 0) {
                    hoursAbsent += 8; 
                }
            }
        });
        
        const baseAmount = totalHours * hourlyRate;
        const overtimeAmount = overtimeHours * hourlyRate * normalOTRate;
        const finalAmount = baseAmount + overtimeAmount;
        
        const daysWorked = new Set(relevantRecords.filter(r => r.morningStatus !== 'Absent' || r.afternoonStatus !== 'Absent').map(r => r.id)).size;
        
        if (finalAmount > 0 || daysWorked > 0 || relevantRecords.length > 0) {
            weekly.push({
                employeeId: employee.id,
                employeeName: employee.name,
                paymentMethod: employee.paymentMethod,
                period: weekPeriodLabel,
                amount: finalAmount,
                status: 'Unpaid',
                workingDays: daysWorked,
                totalHours: totalHours,
                overtimeHours: overtimeHours,
                baseAmount: baseAmount,
                overtimeAmount: overtimeAmount,
                minutesLate: minutesLate,
                hoursAbsent: hoursAbsent,
            });
        }
    });

    return weekly;
  }, [employees, allAttendance, selectedWeek, settings]);
  
  const monthlyPayroll = useMemo(() => {
    if (!employees || allAttendance.length === 0 || !selectedMonth) return [];

    const normalOTRate = settings?.normalOvertimeRate || 1.5;
    const sundayOTRate = settings?.sundayOvertimeRate || 2.0;

    const monthly: PayrollEntry[] = [];
    const monthStart = startOfDay(selectedMonth);
    const ethDate = toEthiopian(monthStart);
    const monthPeriodLabel = `${ethiopianDateFormatter(monthStart, { month: 'long' })} ${ethDate.year}`;
    const daysInMonth = getEthiopianMonthDays(ethDate.year, ethDate.month);
    const workingUnits = getMonthlyWorkingUnits(monthStart, daysInMonth);

    employees.filter(employee => employee.paymentMethod === 'Monthly').forEach(employee => {
        const baseSalary = employee.monthlyRate || 0;
        if (baseSalary === 0) return;

        const ethYearForPeriod = ethDate.year;
        const allEmployeeRecords = allAttendance.filter(r => r.employeeId === employee.id);
        const permissionDatesInYear = new Set<string>();
        allEmployeeRecords.forEach(rec => {
            const dStr = rec.id;
            if (dStr && parse(dStr, "yyyy-MM-dd", new Date()).getFullYear() === ethYearForPeriod) {
                if (rec.morningStatus === 'Permission' || rec.afternoonStatus === 'Permission') {
                    permissionDatesInYear.add(dStr);
                }
            }
        });
        const sortedPermissionDates = Array.from(permissionDatesInYear).sort();
        const allowedPermissionDates = new Set(sortedPermissionDates.slice(0, 15));
        
        const monthEnd = endOfDay(addDays(monthStart, daysInMonth - 1));
        
        const hourlyRate = baseSalary / workingUnits / 8;
        const minuteRate = hourlyRate / 60;

        const calculationPeriod = { start: monthStart, end: monthEnd };
        const allRecordsForMonth = allAttendance.filter(r => 
            r.employeeId === employee.id && 
            isValid(getDateFromRecord(r.date)) && 
            isWithinInterval(getDateFromRecord(r.date), calculationPeriod)
        );
        const recordedDatesForMonth = new Set(allRecordsForMonth.map(r => r.id));

        let projectedHoursAbsent = 0;
        let displayMinutesLate = 0;
        let totalOvertimeAmount = 0;
        let totalOvertimeHours = 0;
        
        const today = new Date();
        
        allRecordsForMonth.forEach(r => {
            const dStr = r.id;
            if(!dStr) return;
            const recordDate = parse(dStr, "yyyy-MM-dd", new Date());
            if(recordDate > today) return;

            const isSaturday = getDay(recordDate) === 6;
            const isSunday = getDay(recordDate) === 0;

            if (isSunday) {
                const isWorking = r.morningStatus === 'Present' || r.morningStatus === 'Late' || r.afternoonStatus === 'Present' || r.afternoonStatus === 'Late';
                if (isWorking) {
                    totalOvertimeAmount += 8 * hourlyRate * sundayOTRate;
                    totalOvertimeHours += 8;
                }
            } else {
                let morningIsUnpaidAbsence = r.morningStatus === 'Absent' || (r.morningStatus === 'Permission' && !allowedPermissionDates.has(dStr));
                let afternoonIsUnpaidAbsence = r.afternoonStatus === 'Absent' || (r.afternoonStatus === 'Permission' && !allowedPermissionDates.has(dStr));

                if (morningIsUnpaidAbsence) projectedHoursAbsent += 4.5;
                // POLICY: Saturday afternoon no deduction
                if (afternoonIsUnpaidAbsence && !isSaturday) projectedHoursAbsent += 3.5;
                
                displayMinutesLate += calculateMinutesLate(r);
            }
            
            if (r.overtimeHours) {
                totalOvertimeAmount += r.overtimeHours * hourlyRate * normalOTRate;
                totalOvertimeHours += r.overtimeHours;
            }
        });
        
        const calculationPeriodDays = eachDayOfInterval(calculationPeriod);
        const employeeStartDate = startOfDay(new Date(employee.attendanceStartDate || 0));

        calculationPeriodDays.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (day >= employeeStartDate && getDay(day) !== 0 && day <= today) { 
                if (!recordedDatesForMonth.has(dayStr)) {
                    if (getDay(day) === 6) {
                        projectedHoursAbsent += 4.5; // Saturday unrecorded is only morning deduction
                    } else {
                        projectedHoursAbsent += 8;
                    }
                }
            }
        });

        const projectedAbsenceDeduction = projectedHoursAbsent * hourlyRate;
        const lateDeduction = displayMinutesLate * minuteRate;
        
        const netSalary = baseSalary - (projectedAbsenceDeduction + lateDeduction) + totalOvertimeAmount;

        if (netSalary > 0 || allRecordsForMonth.length > 0) {
             monthly.push({
                employeeId: employee.id,
                employeeName: employee.name,
                paymentMethod: employee.paymentMethod,
                period: monthPeriodLabel,
                amount: netSalary,
                status: 'Unpaid',
                baseSalary: baseSalary,
                baseAmount: baseSalary,
                hoursAbsent: projectedHoursAbsent,
                minutesLate: displayMinutesLate,
                absenceDeduction: projectedAbsenceDeduction,
                lateDeduction: lateDeduction,
                permissionDaysUsed: Math.min(15, sortedPermissionDates.length),
                overtimeHours: totalOvertimeHours,
                overtimeAmount: totalOvertimeAmount
            });
        }
    });

    return monthly;

  }, [employees, allAttendance, selectedMonth, settings]);


  const monthlyExpenseHistoryData = useMemo(() => {
    if (!employees || !allAttendance || !selectedMonth) return { monthly: [], totalMonthly: 0 };

    const monthStart = startOfDay(selectedMonth);
    const ethSelected = toEthiopian(monthStart);
    const daysInMonthCount = getEthiopianMonthDays(ethSelected.year, ethSelected.month);
    const workingUnits = getMonthlyWorkingUnits(monthStart, daysInMonthCount);
    const monthEnd = endOfDay(addDays(monthStart, daysInMonthCount - 1));
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let totalMonthlyExpense = 0;
    const monthlyData: {name: string, monthly: number}[] = [];

    daysInMonth.forEach(day => {
        let dailyMonthlyExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.filter(e => e.paymentMethod === 'Monthly').forEach(employee => {
            const baseSalary = employee.monthlyRate || 0;
            if (baseSalary === 0) return;

             const hourlyRate = baseSalary / workingUnits / 8;
             if (!hourlyRate) return;

             const record = allAttendance.find(r => 
                r.employeeId === employee.id && r.id === dayStr
             );

             if (record) {
                const hoursWorked = calculateHoursWorked(record);
                const overtime = record.overtimeHours || 0;
                dailyMonthlyExpense += (hoursWorked + overtime) * hourlyRate;
             }
        });
        
        totalMonthlyExpense += dailyMonthlyExpense;
        const dayName = toEthiopian(day).day.toString();
        monthlyData.push({ name: dayName, monthly: dailyMonthlyExpense });
    });

    return {
        monthly: monthlyData,
        totalMonthly: totalMonthlyExpense,
    };
  }, [employees, allAttendance, selectedMonth]);

  const weeklyExpenseHistoryData = useMemo(() => {
    if (!employees || !allAttendance || !selectedWeek) return { weekly: [], totalWeekly: 0 };

    const weekStart = startOfDay(selectedWeek);
    const weekEnd = endOfDay(endOfWeek(weekStart, { weekStartsOn: 0 }));
    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

    let totalWeeklyExpense = 0;
    const weeklyData: {name: string, weekly: number}[] = [];

    daysInWeek.forEach(day => {
        let dailyWeeklyExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.filter(e => e.paymentMethod === 'Weekly').forEach(employee => {
            const hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
            if (!hourlyRate) return;

            const record = allAttendance.find(r => 
                r.employeeId === employee.id && r.id === dayStr
            );
            
            if (record) {
                const hoursWorked = calculateHoursWorked(record);
                const overtime = record.overtimeHours || 0;
                dailyWeeklyExpense += (hoursWorked + overtime) * hourlyRate;
            } else if (getDay(day) === 0) { // Unrecorded Sunday for weekly
                if (new Date(employee.attendanceStartDate || 0) <= day) {
                    dailyWeeklyExpense += 8 * hourlyRate;
                }
            }
        });
        
        totalWeeklyExpense += dailyWeeklyExpense;
        const dayName = ethiopianDateFormatter(day, { weekday: 'short' });
        weeklyData.push({ name: dayName, weekly: dailyWeeklyExpense });
    });

    return {
        weekly: weeklyData,
        totalWeekly: totalWeeklyExpense
    };
  }, [employees, allAttendance, selectedWeek]);
  
  const totalExpenseHistoryData = useMemo(() => {
    if (!selectedMonth || !employees || !allAttendance) return { total: [], overallTotal: 0 };

    const monthStart = startOfDay(selectedMonth);
    const ethSelected = toEthiopian(monthStart);
    const daysInMonthCount = getEthiopianMonthDays(ethSelected.year, ethSelected.month);
    const workingUnits = getMonthlyWorkingUnits(monthStart, daysInMonthCount);
    const monthEnd = endOfDay(addDays(monthStart, daysInMonthCount - 1));
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let overallTotal = 0;
    const totalData: {name: string, total: number}[] = [];

    daysInMonth.forEach(day => {
        let dailyTotalExpense = 0;
        const dayStr = format(day, 'yyyy-MM-dd');

        employees.forEach(employee => {
            let hourlyRate = 0;
            if (employee.paymentMethod === 'Monthly') {
                hourlyRate = (employee.monthlyRate || 0) / workingUnits / 8;
            } else {
                hourlyRate = employee.hourlyRate || (employee.dailyRate ? employee.dailyRate / 8 : 0);
            }
            
            if (!hourlyRate) return;

            const record = allAttendance.find(r => 
                r.employeeId === employee.id && r.id === dayStr
            );
            
            if (record) {
                const hoursWorked = calculateHoursWorked(record);
                const overtime = record.overtimeHours || 0;
                dailyTotalExpense += (hoursWorked + overtime) * hourlyRate;
            } else if (employee.paymentMethod === 'Weekly' && getDay(day) === 0) { // Unrecorded Sunday for weekly
                if (new Date(employee.attendanceStartDate || 0) <= day) {
                    dailyTotalExpense += 8 * hourlyRate;
                }
            }
        });
        
        overallTotal += dailyTotalExpense;
        const dayName = toEthiopian(day).day.toString();
        totalData.push({ name: dayName, total: dailyTotalExpense });
    });
    
    return {
        total: totalData,
        overallTotal: overallTotal
    };

  }, [selectedMonth, employees, allAttendance]);


  const handleMonthSelect = (value: string) => {
    if (!value) return;
    setSelectedMonth(new Date(value));
  }
  
  const handleWeekSelect = (value: string) => {
    if (!value) return;
    setSelectedWeek(new Date(value));
  }
  
  if (employeesLoading || attendanceLoading || isUserLoading) {
    return <div>Loading...</div>;
  }

  const monthLabel = selectedMonth ? ethiopianDateFormatter(selectedMonth, {month: 'long', year: 'numeric'}) : "";
  const weekLabel = selectedWeek ? weekOptions.find(o => o.value === format(selectedWeek, "yyyy-MM-dd"))?.label : "";

  return (
    <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PayrollList 
                title="Weekly Payout" 
                payrollData={weeklyPayroll}
                periodOptions={weekOptions}
                selectedPeriod={selectedWeek ? format(selectedWeek, "yyyy-MM-dd") : undefined}
                onPeriodChange={handleWeekSelect}
            />
            <PayrollList 
                title="Monthly Payout" 
                payrollData={monthlyPayroll} 
                periodOptions={monthOptions}
                selectedPeriod={selectedMonth ? format(selectedMonth, "yyyy-MM-dd") : undefined}
                onPeriodChange={handleMonthSelect}
            />
        </div>

        <Card>
          <CardHeader>
              <CardTitle>Expense History</CardTitle>
              <CardDescription>Select a period to view the detailed expense breakdown.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-4">
                        <Select onValueChange={handleWeekSelect} value={selectedWeek ? format(selectedWeek, "yyyy-MM-dd") : undefined}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a week" />
                            </SelectTrigger>
                            <SelectContent>
                                {weekOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <ExpenseChart 
                            title="Weekly Expenses"
                            description={weekLabel}
                            chartData={weeklyExpenseHistoryData.weekly}
                            series={[{key: 'weekly', name: 'Weekly', color: 'hsl(var(--chart-1))'}]}
                            total={weeklyExpenseHistoryData.totalWeekly}
                        />
                    </div>
                    <div className="flex flex-col gap-4">
                        <Select onValueChange={handleMonthSelect} value={selectedMonth ? format(selectedMonth, "yyyy-MM-dd") : undefined}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a month" />
                            </SelectTrigger>
                            <SelectContent>
                                {monthOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <ExpenseChart 
                            title="Monthly Expenses"
                            description={monthLabel}
                            chartData={monthlyExpenseHistoryData.monthly}
                            series={[{key: 'monthly', name: 'Monthly', color: 'hsl(var(--chart-2))'}]}
                            total={monthlyExpenseHistoryData.totalMonthly}
                        />
                    </div>
                     <div className="flex flex-col gap-4">
                        <div className="h-10"/>
                        <ExpenseChart 
                            title="Total Expenses"
                            description={monthLabel}
                            chartData={totalExpenseHistoryData.total}
                            series={[{key: 'total', name: 'Total', color: 'hsl(var(--chart-3))'}]}
                            total={totalExpenseHistoryData.overallTotal}
                        />
                     </div>
                </div>
          </CardContent>
        </Card>
    </div>
  );
}
