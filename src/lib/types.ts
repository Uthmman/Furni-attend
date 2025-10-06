export type PaymentMethod = "Weekly" | "Monthly";

export interface Employee {
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

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  morningEntry?: string;
  afternoonEntry?: string;
  status: AttendanceStatus;
  overtimeHours?: number;
}

    