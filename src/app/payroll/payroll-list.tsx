

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
import { Loader2 } from "lucide-react";
import type { PayrollEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendAdminPayrollSummary } from "./actions";


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

export function PayrollList({ title, payrollData, periodOptions, selectedPeriod, onPeriodChange }: PayrollListProps) {
    const { toast } = useToast();
    const [isSending, setIsSending] = useState(false);

    const handleSendAdminSummary = async () => {
        if (payrollData.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No Data',
                description: 'There is no payroll data to send.'
            });
            return;
        }

        setIsSending(true);

        const periodLabel = periodOptions.find(o => o.value === selectedPeriod)?.label || title;
        
        let summaryMessage = `*${title} Summary for ${periodLabel}*\n\n`;

        payrollData.forEach(entry => {
            summaryMessage += `${entry.employeeName}: ETB ${entry.amount.toFixed(2)}\n`;
        });

        summaryMessage += `\n*Total: ETB ${totalAmount.toFixed(2)}*`;

        const result = await sendAdminPayrollSummary(summaryMessage);

        if (result.success) {
            toast({
                title: 'Summary Sent!',
                description: `The ${title.toLowerCase()} summary was sent to the admin via Telegram.`
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Send Failed',
                description: result.error || 'Could not send summary via Telegram.'
            });
        }
        
        setIsSending(false);
    };

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
                    <div className="flex items-center gap-2">
                        <p className="font-bold text-lg text-primary">ETB {totalAmount.toFixed(2)}</p>
                        <Button variant="outline" size="sm" onClick={handleSendAdminSummary} disabled={isSending}>
                            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TelegramIcon className="mr-2 h-4 w-4" />}
                            Send
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
