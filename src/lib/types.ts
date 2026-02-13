
import { type DocumentData, type Timestamp } from 'firebase/firestore';

export type PaymentMethod = "Weekly" | "Monthly";

export interface Employee extends DocumentData {
  id:string;
  name: string;
  phone: string;
  position?: string;
  paymentMethod: PaymentMethod;
  accountNumber: string;
  dailyRate?: number;
  monthlyRate?: number;
  hourlyRate?: number;
  attendanceStartDate?: string;
}

export type AttendanceStatus = "Present" | "Absent" | "Late";

export interface AttendanceRecord extends DocumentData {
  id?: string; // id is the doc id, so it's not in the data
  employeeId: string;
  date: string | Timestamp;
  morningEntry?: string;
  afternoonEntry?: string;
  morningStatus: AttendanceStatus;
  afternoonStatus: AttendanceStatus;
  overtimeHours?: number;
}

export interface PayrollEntry {
  employeeId: string;
  employeeName: string;
  paymentMethod: "Weekly" | "Monthly";
  period: string;
  amount: number; // Net Salary for both
  status: "Paid" | "Unpaid";

  // For weekly, these fields are used
  workingDays?: number;
  expectedHours?: number;
  totalHours?: number;
  baseAmount?: number; // Calculated weekly base
  overtimeAmount?: number;

  // For monthly, these are used.
  baseSalary?: number;
  hoursAbsent?: number;
  minutesLate?: number;
  absenceDeduction?: number;
  lateDeduction?: number; 
  overtimeHours?: number; // weekly and monthly
  absentDates?: string[];
  lateDates?: string[];
};
