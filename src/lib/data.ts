import type { Employee, AttendanceRecord, Order, Item, StockAdjustment } from "./types";
import { subDays } from "date-fns";

export const employees: Employee[] = [
  {
    id: "EMP001",
    name: "John Smith",
    position: "Lead Carpenter",
    phone: "123-456-7890",
    paymentMethod: "Monthly",
    accountNumber: "123456789",
    monthlyRate: 3000,
  },
  {
    id: "EMP002",
    name: "Jane Doe",
    position: "Upholstery Specialist",
    phone: "098-765-4321",
    paymentMethod: "Weekly",
    accountNumber: "987654321",
    dailyRate: 150,
  },
  {
    id: "EMP003",
    name: "Peter Jones",
    position: "Finisher",
    phone: "555-555-5555",
    paymentMethod: "Weekly",
    accountNumber: "555555555",
    dailyRate: 160,
  },
];

export const attendanceRecords: AttendanceRecord[] = [
  { id: 'ATT001', employeeId: "EMP001", date: subDays(new Date(), 1).toISOString(), morningEntry: "08:55", afternoonEntry: "13:05", morningStatus: "Present", afternoonStatus: "Present", overtimeHours: 1 },
  { id: 'ATT002', employeeId: "EMP002", date: subDays(new Date(), 1).toISOString(), morningEntry: "09:15", afternoonEntry: "13:00", morningStatus: "Late", afternoonStatus: "Present" },
  { id: 'ATT003', employeeId: "EMP003", date: subDays(new Date(), 1).toISOString(), morningStatus: "Absent", afternoonStatus: "Absent" },
  { id: 'ATT004', employeeId: "EMP001", date: subDays(new Date(), 2).toISOString(), morningEntry: "09:00", afternoonEntry: "13:00", morningStatus: "Present", afternoonStatus: "Present" },
  { id: 'ATT005', employeeId: "EMP002", date: subDays(new Date(), 2).toISOString(), morningEntry: "09:02", afternoonEntry: "13:01", morningStatus: "Present", afternoonStatus: "Present", overtimeHours: 2 },
  { id: 'ATT006', employeeId: "EMP003", date: subDays(new Date(), 2).toISOString(), morningEntry: "08:58", afternoonEntry: "12:59", morningStatus: "Present", afternoonStatus: "Present" },
  { id: 'ATT007', employeeId: "EMP001", date: subDays(new Date(), 3).toISOString(), morningStatus: "Absent", afternoonStatus: "Absent" },
  { id: 'ATT008', employeeId: "EMP002", date: subDays(new Date(), 3).toISOString(), morningEntry: "09:05", afternoonEntry: "13:10", morningStatus: "Present", afternoonStatus: "Present" },
  { id: 'ATT009', employeeId: "EMP003", date: subDays(new Date(), 3).toISOString(), morningEntry: "09:20", afternoonEntry: "13:05", morningStatus: "Late", afternoonStatus: "Present" },
];

export const orders: Order[] = [
    { id: 'ORD001', customerName: 'Alice Johnson', orderDate: subDays(new Date(), 2).toISOString(), orderDescription: 'Custom oak dining table', orderStatus: 'Completed', productPictureUrl: 'https://picsum.photos/seed/o-table/200/200' },
    { id: 'ORD002', customerName: 'Bob Williams', orderDate: subDays(new Date(), 5).toISOString(), orderDescription: 'Velvet armchair', orderStatus: 'Processing', productPictureUrl: 'https://picsum.photos/seed/v-armchair/200/200' },
    { id: 'ORD003', customerName: 'Charlie Brown', orderDate: subDays(new Date(), 10).toISOString(), orderDescription: 'Set of 4 walnut chairs', orderStatus: 'Pending', productPictureUrl: 'https://picsum.photos/seed/w-chairs/200/200' },
];

export const items: Item[] = [
    { id: 'ITM001', name: 'Oak Wood Planks', unitOfMeasurement: 'piece', stockLevel: 50 },
    { id: 'ITM002', name: 'Walnut Varnish', unitOfMeasurement: 'liter', stockLevel: 20 },
    { id: 'ITM003', name: 'Blue Velvet Fabric', unitOfMeasurement: 'meter', stockLevel: 100 },
];

export const stockAdjustments: StockAdjustment[] = [
    { id: 'ADJ001', itemId: 'ITM001', adjustmentDate: subDays(new Date(), 1).toISOString(), adjustmentQuantity: -10, reason: 'Used for order ORD001' },
    { id: 'ADJ002', itemId: 'ITM003', adjustmentDate: subDays(new Date(), 4).toISOString(), adjustmentQuantity: -20, reason: 'Used for order ORD002' },
    { id: 'ADJ003', itemId: 'ITM002', adjustmentDate: subDays(new Date(), 7).toISOString(), adjustmentQuantity: 5, reason: 'New stock arrival' },
];
