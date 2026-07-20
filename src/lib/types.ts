
import { type DocumentData, type Timestamp } from 'firebase/firestore';

export type PaymentMethod = "Weekly" | "Monthly";

export type EmployeeStatus = "Active" | "Inactive";

export interface Employee extends DocumentData {
  id: string;
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
  inactiveDate?: string;
}

export type AttendanceStatus = "Present" | "Absent" | "Late" | "Permission";

export interface AttendanceRecord extends DocumentData {
  id?: string;
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
  amount: number;
  status: "Paid" | "Unpaid";
  amountToDate?: number;
  workingDays?: number;
  expectedHours?: number;
  totalHours?: number;
  baseAmount?: number;
  overtimeAmount?: number;
  baseSalary?: number;
  hoursAbsent?: number;
  minutesLate?: number;
  absenceDeduction?: number;
  lateDeduction?: number; 
  overtimeHours?: number;
  absentDates?: string[];
  lateDates?: string[];
  permissionDaysUsed?: number;
};

export interface Order extends DocumentData {
    id: string;
    customerName?: string;
    uniqueName?: string;
    description?: string;
    status?: string;
    creationDate?: Timestamp | { seconds: number; nanoseconds: number };
    deadline?: Timestamp | { seconds: number; nanoseconds: number };
    incomeAmount?: number;
    prepaidAmount?: number;
    paymentStatus?: string;
    isUrgent?: boolean;
    material?: string;
    dimensions?: {
      depth?: number;
      height?: number;
      width?: number;
    };
    [key: string]: any;
}

export interface PriceRecord {
    price: number;
    date: string;
}

export interface Category extends DocumentData {
    id: string;
    name: string;
}

export interface Item {
    id: string;
    name: string;
    category: string;
    unitOfMeasurement: string;
    stockLevel: number;
    lowStockThreshold?: number;
    currentPrice?: number;
    imageUrl?: string;
    priceHistory?: PriceRecord[];
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
    unitPrice?: number;
    totalPrice?: number;
    supplier?: string;
    paymentStatus?: PaymentStatus;
    orderId?: string;
    orderUniqueName?: string;
}
