import type { Order, StoreItem, Employee, AttendanceRecord } from "./types";
import { subDays } from "date-fns";

export const orders: Order[] = [
  {
    id: "ORD001",
    customerName: "Alice Johnson",
    orderDate: subDays(new Date(), 2).toISOString(),
    status: "Completed",
    description: "Custom oak dining table with six matching chairs.",
    imageUrl: "https://picsum.photos/seed/furnish2/600/400",
    imageHint: "dining table",
    itemsUsed: [
      { itemId: "ITM001", quantity: 15 },
      { itemId: "ITM003", quantity: 24 },
    ],
  },
  {
    id: "ORD002",
    customerName: "Bob Williams",
    orderDate: subDays(new Date(), 5).toISOString(),
    status: "In Progress",
    description: "Walnut bookshelf for a home library.",
    imageUrl: "https://picsum.photos/seed/furnish4/600/400",
    imageHint: "wooden bookshelf",
    itemsUsed: [{ itemId: "ITM001", quantity: 20 }],
  },
  {
    id: "ORD003",
    customerName: "Charlie Brown",
    orderDate: subDays(new Date(), 1).toISOString(),
    status: "Pending",
    description: "A three-seater sofa with mustard yellow upholstery.",
    imageUrl: "https://picsum.photos/seed/furnish3/600/400",
    imageHint: "plush sofa",
    itemsUsed: [
      { itemId: "ITM004", quantity: 1 },
      { itemId: "ITM005", quantity: 10 },
    ],
  },
  {
    id: "ORD004",
    customerName: "Diana Miller",
    orderDate: subDays(new Date(), 10).toISOString(),
    status: "Cancelled",
    description: "Order for a set of four bar stools.",
    imageUrl: "https://picsum.photos/seed/furnish1/600/400",
    imageHint: "modern chair",
    itemsUsed: [],
  },
    {
    id: "ORD005",
    customerName: "Ethan Davis",
    orderDate: subDays(new Date(), 3).toISOString(),
    status: "Completed",
    description: "Glass-top coffee table for a modern living room.",
    imageUrl: "https://picsum.photos/seed/furnish5/600/400",
    imageHint: "coffee table",
    itemsUsed: [
        { itemId: "ITM002", quantity: 1 },
        { itemId: "ITM006", quantity: 4 },
    ],
  },
];

export const storeItems: StoreItem[] = [
  { id: "ITM001", name: "Oak Wood Plank", stock: 50, unit: "sq. meter" },
  { id: "ITM002", name: "Tempered Glass Sheet", stock: 8, unit: "piece" },
  { id: "ITM003", name: "Steel Screw", stock: 500, unit: "piece" },
  { id: "ITM004", name: "Pine Wood Frame", stock: 25, unit: "piece" },
  { id: "ITM005", name: "Yellow Fabric", stock: 100, unit: "meter" },
  { id: "ITM006", name: "Varnish", stock: 15, unit: "liter" },
  { id: "ITM007", name: "Mahogany Wood", stock: 9, unit: "sq. meter" },
];

export const employees: Employee[] = [
  {
    id: "EMP001",
    name: "John Smith",
    phone: "123-456-7890",
    paymentMethod: "Monthly",
    accountNumber: "123456789",
    monthlyRate: 3000,
  },
  {
    id: "EMP002",
    name: "Jane Doe",
    phone: "098-765-4321",
    paymentMethod: "Weekly",
    accountNumber: "987654321",
    dailyRate: 150,
  },
  {
    id: "EMP003",
    name: "Peter Jones",
    phone: "555-555-5555",
    paymentMethod: "Weekly",
    accountNumber: "555555555",
    dailyRate: 160,
  },
];

export const attendanceRecords: AttendanceRecord[] = [
  { id: 'ATT001', employeeId: "EMP001", date: subDays(new Date(), 1).toISOString(), morningEntry: "08:55", afternoonEntry: "13:05", status: "Present" },
  { id: 'ATT002', employeeId: "EMP002", date: subDays(new Date(), 1).toISOString(), morningEntry: "09:15", afternoonEntry: "13:00", status: "Late" },
  { id: 'ATT003', employeeId: "EMP003", date: subDays(new Date(), 1).toISOString(), status: "Absent" },
  { id: 'ATT004', employeeId: "EMP001", date: subDays(new Date(), 2).toISOString(), morningEntry: "09:00", afternoonEntry: "13:00", status: "Present" },
  { id: 'ATT005', employeeId: "EMP002", date: subDays(new Date(), 2).toISOString(), morningEntry: "09:02", afternoonEntry: "13:01", status: "Present" },
  { id: 'ATT006', employeeId: "EMP003", date: subDays(new Date(), 2).toISOString(), morningEntry: "08:58", afternoonEntry: "12:59", status: "Present" },
  { id: 'ATT007', employeeId: "EMP001", date: subDays(new Date(), 3).toISOString(), status: "Absent" },
  { id: 'ATT008', employeeId: "EMP002", date: subDays(new Date(), 3).toISOString(), morningEntry: "09:05", afternoonEntry: "13:10", status: "Present" },
  { id: 'ATT009', employeeId: "EMP003", date: subDays(new Date(), 3).toISOString(), morningEntry: "09:20", afternoonEntry: "13:05", status: "Late" },
];
