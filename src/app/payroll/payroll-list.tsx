
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
    return `Hi ${entry.employeeName},\n\nHere is your payroll summary for the period: ${entry.period}.\n\n` +
           `Working Days: ${entry.workingDays}\n` +
           `Total Hours: ${entry.totalHours.toFixed(2)} hrs\n` +
           `Overtime: ${entry.overtimeHours.toFixed(2)} hrs\n\n` +
           `Base Pay: ETB ${entry.baseAmount.toFixed(2)}\n` +
           `Overtime Pay: ETB ${entry.overtimeAmount.toFixed(2)}\n` +
           `Total Payout: ETB ${entry.amount.toFixed(2)}\n\n` +
           `Thank you!`;
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
                                        <div className="text-sm text-muted-foreground">{entry.workingDays} day(s) worked</div>
                                    </TableCell>
                                    <TableCell className="text-right">{entry.amount.toFixed(2)}</TableCell>
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
