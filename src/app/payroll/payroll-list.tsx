

'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { PayrollEntry } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";

interface PayrollListProps {
    title: string;
    payrollData: PayrollEntry[];
    periodOptions: { label: string; value: string }[];
    selectedPeriod: string | undefined;
    onPeriodChange: (value: string) => void;
}

export function PayrollList({ title, payrollData, periodOptions, selectedPeriod, onPeriodChange }: PayrollListProps) {
    const totalAmount = payrollData.reduce((acc, entry) => acc + entry.amount, 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <Select onValueChange={onPeriodChange} value={selectedPeriod}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a period" />
                    </SelectTrigger>
                    <SelectContent>
                        {periodOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead className="text-right">Amount (ETB)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {payrollData.length > 0 ? (
                            payrollData.map((entry) => (
                                <TableRow key={entry.employeeId}>
                                    <TableCell>
                                        <Link href={`/employees/${entry.employeeId}`} className="font-medium hover:underline">{entry.employeeName}</Link>
                                        <div className="text-sm text-muted-foreground">
                                            {entry.paymentMethod === 'Weekly' ? 
                                                (
                                                    <>
                                                        <div>{entry.workingDays || 0} day(s) worked</div>
                                                        <div>{(entry.totalHours || 0).toFixed(1)} hrs total</div>
                                                        {(entry.overtimeHours || 0) > 0 && (
                                                            <div className="text-primary flex items-center">
                                                                {(entry.overtimeHours || 0).toFixed(1)} hrs overtime
                                                            </div>
                                                        )}
                                                         {(entry.hoursAbsent || 0) > 0 && (
                                                            <div className="text-destructive flex items-center">
                                                                {(entry.hoursAbsent || 0).toFixed(1)} hrs absent
                                                            </div>
                                                        )}
                                                        {(entry.minutesLate || 0) > 0 && (
                                                            <div className="text-destructive flex items-center">
                                                                {(entry.minutesLate || 0).toFixed(0)} mins late
                                                            </div>
                                                        )}
                                                    </>
                                                ) : 
                                                (
                                                    <>
                                                        {(entry.hoursAbsent || 0) > 0 && (
                                                            <div className="text-destructive flex items-center">
                                                                {(entry.hoursAbsent || 0).toFixed(1)} hrs absent
                                                            </div>
                                                        )}
                                                        {(entry.minutesLate || 0) > 0 && (
                                                            <div className="text-destructive flex items-center">
                                                                {(entry.minutesLate || 0).toFixed(0)} mins late
                                                            </div>
                                                        )}
                                                        {(entry.permissionDaysUsed || 0) > 0 && (
                                                            <div className="text-primary flex items-center">
                                                                {entry.permissionDaysUsed} of 15 permission days used
                                                            </div>
                                                        )}
                                                        {(entry.hoursAbsent || 0) === 0 && (entry.minutesLate || 0) === 0 && (
                                                            <div>No absences or lates</div>
                                                        )}
                                                    </>
                                                )
                                            }
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="font-bold">{entry.amount.toFixed(2)}</div>
                                        {entry.paymentMethod === 'Monthly' && typeof entry.amountToDate === 'number' && (
                                            <div className="text-xs text-muted-foreground">
                                                Earned To-Date: {entry.amountToDate.toFixed(2)}
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center">
                                    No payroll entries for this period.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <div className="flex justify-between items-center mt-4 pt-4 border-t">
                    <p className="font-bold text-lg">Total</p>
                    <p className="font-bold text-lg text-primary">ETB {totalAmount.toFixed(2)}</p>
                </div>
            </CardContent>
        </Card>
    );
}
