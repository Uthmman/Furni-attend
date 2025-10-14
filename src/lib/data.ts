import type { Employee, AttendanceRecord } from "./types";
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
