export type OrderStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";

export interface Order {
  id: string;
  customerName: string;
  orderDate: string;
  status: OrderStatus;
  description: string;
  imageUrl: string;
  imageHint: string;
  itemsUsed: {
    itemId: string;
    quantity: number;
  }[];
}

export type UnitOfMeasurement = "piece" | "meter" | "sq. meter" | "liter";

export interface StoreItem {
  id: string;
  name: string;
  stock: number;
  unit: UnitOfMeasurement;
}

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
