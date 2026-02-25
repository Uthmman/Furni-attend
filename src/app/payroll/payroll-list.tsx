

'use client';

import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface PayrollListProps {
    title: string;
    payrollData: PayrollEntry[];
    periodOptions: { label: string; value: string }[];
    selectedPeriod: string | undefined;
    onPeriodChange: (value: string) => void;
}

export function PayrollList({ title, payrollData, periodOptions, selectedPeriod, onPeriodChange }: PayrollListProps) {
    const totalAmount = payrollData.reduce((acc, entry) => acc + entry.amount, 0);
    
    const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
    const [summaryText, setSummaryText] = useState("");
    const [_copiedValue, copy] = useCopyToClipboard();
    const { toast } = useToast();

    const generateSummaryMessage = (entry: PayrollEntry) => {
        let summaryMessage = `Payroll Summary for ${entry.employeeName}\n`;
        summaryMessage += `Period: ${entry.period}\n\n`;

        if (entry.paymentMethod === 'Monthly') {
          summaryMessage += `Base Salary: ETB ${(entry.baseSalary || 0).toFixed(2)}\n`;
          if ((entry.lateDeduction || 0) > 0) {
            summaryMessage += `Late Deduction (${entry.minutesLate || 0} mins): - ETB ${(entry.lateDeduction || 0).toFixed(2)}\n`;
          }
          if ((entry.absenceDeduction || 0) > 0) {
            summaryMessage += `Absence Deduction (${(entry.hoursAbsent || 0).toFixed(1)} hrs): - ETB ${(entry.absenceDeduction || 0).toFixed(2)}\n`;
          }
          summaryMessage += `--------------------\n`;
          summaryMessage += `Net Salary: ETB ${(entry.amount || 0).toFixed(2)}`;
        } else { // Weekly
          summaryMessage += `Base Pay (${(entry.totalHours || 0).toFixed(2)} hrs): ETB ${(entry.baseAmount || 0).toFixed(2)}\n`;
          if ((entry.overtimeAmount || 0) > 0) {
              const overtimeHours = entry.overtimeHours || 0;
              summaryMessage += `Overtime Pay (${overtimeHours} hrs): + ETB ${(entry.overtimeAmount || 0).toFixed(2)}\n`;
          }
          summaryMessage += `--------------------\n`;
          summaryMessage += `Total Payout: ETB ${(entry.amount || 0).toFixed(2)}`;
        }
        
        return summaryMessage;
    };

    const handleViewSummary = (entry: PayrollEntry) => {
        const message = generateSummaryMessage(entry);
        setSummaryText(message);
        setIsSummaryDialogOpen(true);
    };

    const handleCopyToClipboard = () => {
        copy(summaryText);
        toast({
          title: "Copied to clipboard!",
        });
    }


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
                                <TableHead className="w-[50px] text-right">Action</TableHead>
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
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleViewSummary(entry)}>
                                                <Copy className="h-4 w-4" />
                                                <span className="sr-only">Copy summary</span>
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
            <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
                <DialogContent>
                <DialogHeader>
                    <DialogTitle>Payroll Summary</DialogTitle>
                    <DialogDescription>
                    Copy the summary below to send it manually.
                    </DialogDescription>
                </DialogHeader>
                <Textarea readOnly value={summaryText} rows={12} className="text-sm font-mono" />
                <DialogFooter>
                    <Button variant="secondary" onClick={handleCopyToClipboard}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                    </Button>
                    <DialogClose asChild>
                    <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
