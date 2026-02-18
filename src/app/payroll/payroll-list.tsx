

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
import { Copy, Eye, Loader2 } from "lucide-react";
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
import { sendPayrollSummaryToTelegram } from "./actions";


const TelegramIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" {...props}>
        <path d="M9.78 18.65l.28-4.23l7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3L3.64 12c-.88-.25-.89-1.37.2-1.61l16.11-5.72c.78-.27 1.45.16 1.18 1.1l-3.27 15.25c-.27 1.22-1.04 1.5-2.04 1.02l-4.87-3.57l-2.31 2.24c-.25.24-.46.46-.8.46c-.42 0-.6-.24-.7-.53z" />
    </svg>
);

interface PayrollListProps {
    title: string;
    payrollData: PayrollEntry[];
    periodOptions: { label: string; value: string }[];
    selectedPeriod: string | undefined;
    onPeriodChange: (value: string) => void;
}

const generateSmsSummary = (entry: PayrollEntry): string => {
    let summary = `Hi ${entry.employeeName}, your payroll for ${entry.period}:\n`;

    if (entry.paymentMethod === 'Monthly') {
        summary += `Base Salary: ETB ${(entry.baseSalary || 0).toFixed(2)}\n`;

        if (entry.absenceDeduction && entry.absenceDeduction > 0) {
            const absentDays = (entry.hoursAbsent || 0) / 8;
            summary += `Absence Deduction (${absentDays.toFixed(1)} days): -ETB ${entry.absenceDeduction.toFixed(2)}\n`;
        }
        
        if (entry.lateDeduction && entry.lateDeduction > 0) {
            summary += `Late Deduction (${entry.minutesLate || 0} mins): -ETB ${entry.lateDeduction.toFixed(2)}\n`;
        }

        summary += `Net Salary: *ETB ${entry.amount.toFixed(2)}*\n`;
    } else { // Weekly
        summary += `Hours Worked: ${(entry.totalHours || 0).toFixed(2)} hrs\n`;
        summary += `Base Pay: ETB ${(entry.baseAmount || 0).toFixed(2)}\n`;

        if (entry.overtimeAmount && entry.overtimeAmount > 0) {
            summary += `Overtime Pay (${entry.overtimeHours || 0} hrs): +ETB ${entry.overtimeAmount.toFixed(2)}\n`;
        }

        if (entry.hoursAbsent && entry.hoursAbsent > 0) {
            const absentDays = (entry.hoursAbsent || 0) / 8; // approx days
            summary += `Absent: ${absentDays.toFixed(1)} days (${(entry.hoursAbsent || 0).toFixed(1)} hrs)\n`;
        }
        
        if (entry.minutesLate && entry.minutesLate > 0) {
            summary += `Late: ${entry.minutesLate || 0} mins\n`;
        }

        summary += `Total Pay: *ETB ${entry.amount.toFixed(2)}*\n`;
    }

    summary += `Thank you.`;
    return summary;
};


export function PayrollList({ title, payrollData, periodOptions, selectedPeriod, onPeriodChange }: PayrollListProps) {
    const [_copiedValue, copy] = useCopyToClipboard();
    const { toast } = useToast();
    const [summaryContent, setSummaryContent] = useState("");
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [sendingStatus, setSendingStatus] = useState<Record<string, boolean>>({});

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

    const handleSendTelegram = async (entry: PayrollEntry) => {
        if (!entry.telegramChatId) {
            toast({
                variant: 'destructive',
                title: 'Missing Chat ID',
                description: `No Telegram Chat ID is set for ${entry.employeeName}.`
            });
            return;
        }

        setSendingStatus(prev => ({ ...prev, [entry.employeeId]: true }));
        
        const summary = generateSmsSummary(entry);
        const result = await sendPayrollSummaryToTelegram(entry.telegramChatId, summary);

        if (result.success) {
            toast({
                title: 'Message Sent!',
                description: `Payroll summary sent to ${entry.employeeName} via Telegram.`
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Send Failed',
                description: result.error || 'Could not send message via Telegram.'
            });
        }
        setSendingStatus(prev => ({ ...prev, [entry.employeeId]: false }));
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
                                <TableHead className="w-[140px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payrollData.length > 0 ? (
                                payrollData.map((entry) => {
                                    const isSending = sendingStatus[entry.employeeId];
                                    return (
                                    <TableRow key={entry.employeeId}>
                                        <TableCell>
                                            <div className="font-medium">{entry.employeeName}</div>
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
                                        <TableCell className="text-right font-bold">{entry.amount.toFixed(2)}</TableCell>
                                        <TableCell className="flex items-center justify-end gap-0">
                                            <Button variant="ghost" size="icon" onClick={() => handleViewSummary(entry)} disabled={isSending}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleCopy(entry)} disabled={isSending}>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleSendTelegram(entry)} disabled={!entry.telegramChatId || isSending}>
                                                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TelegramIcon />}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )})
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
