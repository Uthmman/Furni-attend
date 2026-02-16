

'use client';

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Copy, Eye } from "lucide-react";
import type { PayrollEntry } from "@/lib/types";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogClose 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PayrollListProps {
    title: string;
    payrollData: PayrollEntry[];
    periodOptions: { label: string; value: string }[];
    selectedPeriod: string | undefined;
    onPeriodChange: (value: string) => void;
}

const generateSmsSummary = (entry: PayrollEntry): string => {
    if (entry.paymentMethod === 'Monthly') {
        return `Hi ${entry.employeeName}, your payroll for ${entry.period}:\n` +
               `Base Salary: ETB ${(entry.baseSalary || 0).toFixed(2)}\n` +
               `Late: -ETB ${(entry.lateDeduction || 0).toFixed(2)}\n` +
               `Absence: -ETB ${(entry.absenceDeduction || 0).toFixed(2)}\n` +
               `Net Salary: ETB **${entry.amount.toFixed(2)}**\n` +
               `Thank you.`;
    }
    
    // Summary for weekly employees
    return `Hi ${entry.employeeName}, your payroll for ${entry.period}:\n` +
           `Base: ETB ${(entry.baseAmount || 0).toFixed(2)}\n` +
           `Overtime: ETB ${(entry.overtimeAmount || 0).toFixed(2)}\n` +
           `Late: -ETB ${(entry.lateDeduction || 0).toFixed(2)}\n` +
           `Total: ETB **${entry.amount.toFixed(2)}**\n` +
           `Thank you.`;
};


export function PayrollList({ title, payrollData, periodOptions, selectedPeriod, onPeriodChange }: PayrollListProps) {
    const [_copiedValue, copy] = useCopyToClipboard();
    const { toast } = useToast();
    const [summaryContent, setSummaryContent] = useState("");
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);

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
    
    const handleViewSummary = (entry: PayrollEntry) => {
        const summary = generateSmsSummary(entry);
        setSummaryContent(summary);
        setIsSummaryOpen(true);
    };

    const totalAmount = payrollData.reduce((acc, entry) => acc + entry.amount, 0);

    return (
        <>
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
                                <TableHead className="w-[100px] text-right">Actions</TableHead>
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
                                        <TableCell className="text-right font-bold">{entry.amount.toFixed(2)}</TableCell>
                                        <TableCell className="flex items-center justify-end gap-0">
                                            <Button variant="ghost" size="icon" onClick={() => handleViewSummary(entry)}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
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
            <Dialog open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Payroll Summary</DialogTitle>
                        <DialogDescription>
                            This is the summary that will be copied to the clipboard.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        readOnly
                        value={summaryContent}
                        className="min-h-[200px] bg-muted text-sm"
                    />
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Close</Button>
                        </DialogClose>
                        <Button onClick={() => {
                            copy(summaryContent).then(success => {
                                if (success) {
                                    toast({
                                        title: "Copied!",
                                        description: "Payroll summary copied to clipboard."
                                    });
                                    setIsSummaryOpen(false);
                                } else {
                                     toast({
                                        variant: "destructive",
                                        title: "Copy Failed",
                                        description: "Could not copy summary."
                                    });
                                }
                            })
                        }}>
                            <Copy className="mr-2 h-4 w-4" /> Copy
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
