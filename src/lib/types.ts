
import { type DocumentData, type Timestamp } from 'firebase/firestore';

export type PaymentMethod = "Weekly" | "Monthly";

export type EmployeeStatus = "Active" | "Inactive";

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
  status?: EmployeeStatus;
}

export type AttendanceStatus = "Present" | "Absent" | "Late" | "Permission";

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
  amountToDate?: number;

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
  permissionDaysUsed?: number;
};

export interface Order {
    id: string;
    customerName: string;
    orderDate: string;
    orderDescription?: string;
    orderStatus: string;
    productPictureUrl?: string;
}

export interface Item {
    id: string;
    name: string;
    category: string;
    unitOfMeasurement: string;
    stockLevel: number;
    lowStockThreshold?: number;
    currentPrice?: number;
}

export type PaymentStatus = "Paid" | "Unpaid";

export interface StockAdjustment {
    id: string;
    itemId: string;
    itemName: string;
    adjustmentDate: string;
    adjustmentQuantity: number;
    type: "In" | "Out";
    reason: string;
    // New fields for financial tracking
    unitPrice?: number;
    totalPrice?: number;
    supplier?: string;
    paymentStatus?: PaymentStatus;
}
