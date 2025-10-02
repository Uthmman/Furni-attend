import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CircleDollarSign } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { employees, attendanceRecords } from "@/lib/data";
import { subWeeks, startOfWeek, endOfWeek, isWithinInterval, startOfMonth, endOfMonth, subMonths } from "date-fns";

type PayrollEntry = {
  employeeId: string;
  employeeName: string;
  paymentMethod: "Weekly" | "Monthly";
  period: string;
  amount: number;
  status: "Paid" | "Unpaid";
};

const calculatePayroll = (): PayrollEntry[] => {
  const payroll: PayrollEntry[] = [];
  const lastWeek = {
    start: startOfWeek(subWeeks(new Date(), 1)),
    end: endOfWeek(subWeeks(new Date(), 1)),
  };
  const lastMonth = {
      start: startOfMonth(subMonths(new Date(), 1)),
      end: endOfMonth(subMonths(new Date(), 1))
  }

  employees.forEach(employee => {
    if (employee.paymentMethod === 'Weekly' && employee.dailyRate) {
      const presentDays = attendanceRecords.filter(
        record =>
          record.employeeId === employee.id &&
          (record.status === 'Present' || record.status === 'Late') &&
          isWithinInterval(new Date(record.date), lastWeek)
      ).length;

      payroll.push({
        employeeId: employee.id,
        employeeName: employee.name,
        paymentMethod: 'Weekly',
        period: `${lastWeek.start.toLocaleDateString()} - ${lastWeek.end.toLocaleDateString()}`,
        amount: presentDays * employee.dailyRate,
        status: 'Unpaid',
      });
    } else if (employee.paymentMethod === 'Monthly' && employee.monthlyRate) {
      // Assuming monthly payment is for the previous calendar month
      payroll.push({
        employeeId: employee.id,
        employeeName: employee.name,
        paymentMethod: 'Monthly',
        period: lastMonth.start.toLocaleString('default', { month: 'long', year: 'numeric' }),
        amount: employee.monthlyRate,
        status: 'Unpaid',
      });
    }
  });

  return payroll.filter(p => p.amount > 0);
};

export default function PayrollPage() {
  const payrollData = calculatePayroll();

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Calculate and process employee payments."
      >
        <Button variant="secondary">
          <CircleDollarSign className="mr-2 h-4 w-4" />
          Process All Payments
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
          <CardTitle>Pending Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Payment Period</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollData.map((entry) => (
                <TableRow key={`${entry.employeeId}-${entry.period}`}>
                  <TableCell className="font-medium">{entry.employeeName}</TableCell>
                  <TableCell>{entry.period}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.paymentMethod}</Badge>
                  </TableCell>
                  <TableCell>${entry.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={entry.status === 'Paid' ? 'default' : 'destructive'}>
                      {entry.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {payrollData.length === 0 && (
                <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No pending payroll for the last period.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
