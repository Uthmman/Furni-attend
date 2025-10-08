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
}

export type AttendanceStatus = "Present" | "Absent" | "Late";

export interface AttendanceRecord extends DocumentData {
  id: string;
  employeeId: string;
  date: string | Timestamp;
  morningEntry?: string;
  afternoonEntry?: string;
  status: AttendanceStatus;
  overtimeHours?: number;
}

export interface PayrollEntry {
  employeeId: string;
  employeeName: string;
  paymentMethod: "Weekly" | "Monthly";
  period: string;
  amount: number;
  status: "Paid" | "Unpaid";
  workingDays?: number;
};
