

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
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import type { PayrollEntry } from "@/lib/types";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useToast } from "@/hooks/use-toast";

interface PayrollListProps {
    title: string;
    payrollData: PayrollEntry[];
}

const generateSmsSummary = (entry: PayrollEntry): string => {
    if (entry.paymentMethod === 'Monthly') {
        return `Hi ${entry.employeeName}, your payroll for ${entry.period}:\n` +
               `Base Salary: ETB ${(entry.baseSalary || 0).toFixed(2)}\n` +
               `Late Deduction: -ETB ${(entry.lateDeduction || 0).toFixed(2)}\n` +
               `Absence Deduction: -ETB ${(entry.absenceDeduction || 0).toFixed(2)}\n` +
               `Net Salary: ETB ${entry.amount.toFixed(2)}\n` +
               `Thank you.`;
    }
    
    // Summary for weekly employees
    return `Hi ${entry.employeeName}, your payroll for ${entry.period}:\n` +
           `Base: ETB ${(entry.baseAmount || 0).toFixed(2)}\n` +
           `Overtime: ETB ${(entry.overtimeAmount || 0).toFixed(2)}\n` +
           `Late: -ETB ${(entry.lateDeduction || 0).toFixed(2)}\n` +
           `Total: ETB ${entry.amount.toFixed(2)}\n` +
           `Thank you.`;
};


export function PayrollList({ title, payrollData }: PayrollListProps) {
    const [_copiedValue, copy] = useCopyToClipboard();
    const { toast } = useToast();

    const handleCopy = (entry: PayrollEntry) => {
        const summary = generateSmsSummary(entry);
        copy(summary).then(success => {
            if (success) {
                toast({
                    title: "Copied!",
                    description: `Payroll summary for ${entry.employeeName} copied to clipboard.`
                });
            } else {
                 toast({
                    variant: "destructive",
                    title: "Copy Failed",
                    description: "Could not copy summary."
                });
            }
        })
    };
    
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
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {payrollData.length > 0 ? (
                            payrollData.map((entry) => (
                                <TableRow key={entry.employeeId}>
                                    <TableCell>
                                        <div className="font-medium">{entry.employeeName}</div>
                                        <div className="text-sm text-muted-foreground">
                                            {entry.paymentMethod === 'Weekly' ? 
                                                `${entry.workingDays || 0} day(s) worked` : 
                                                `${entry.daysAbsent || 0} day(s) absent`}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-bold">{entry.amount.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleCopy(entry)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
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
