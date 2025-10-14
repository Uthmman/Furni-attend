
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { PayrollEntry } from "@/lib/types";

interface PayrollListProps {
    title: string;
    payrollData: PayrollEntry[];
}

export function PayrollList({ title, payrollData }: PayrollListProps) {
    const totalAmount = payrollData.reduce((acc, entry) => acc + entry.amount, 0);
    const period = payrollData.length > 0 ? payrollData[0].period : "N/A";

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>For period: {period}</CardDescription>
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
                                        <div className="font-medium">{entry.employeeName}</div>
                                        <div className="text-sm text-muted-foreground">{entry.workingDays} day(s) worked</div>
                                    </TableCell>
                                    <TableCell className="text-right">{entry.amount.toFixed(2)}</TableCell>
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
