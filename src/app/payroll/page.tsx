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
import { subWeeks, startOfWeek, endOfWeek, isWithinInterval, startOfMonth, endOfMonth, subMonths, parse } from "date-fns";

type PayrollEntry = {
  employeeId: string;
  employeeName: string;
  paymentMethod: "Weekly" | "Monthly";
  period: string;
  amount: number;
  status: "Paid" | "Unpaid";
};

const calculateHoursWorked = (morningEntry?: string, afternoonEntry?: string): number => {
    if (!morningEntry || !afternoonEntry) return 0;

    const morningStartTime = parse("08:00", "HH:mm", new Date());
    const morningEndTime = parse("12:30", "HH:mm", new Date());
    const afternoonStartTime = parse("13:30", "HH:mm", new Date());
    const afternoonEndTime = parse("17:00", "HH:mm", new Date());

    const morningEntryTime = parse(morningEntry, "HH:mm", new Date());
    const afternoonEntryTime = parse(afternoonEntry, "HH:mm", new Date());
    
    let totalHours = 0;

    if(morningEntryTime < morningEndTime) {
        const morningWorkMs = morningEndTime.getTime() - Math.max(morningStartTime.getTime(), morningEntryTime.getTime());
        totalHours += morningWorkMs / (1000 * 60 * 60);
    }
    
    if(afternoonEntryTime < afternoonEndTime) {
        const afternoonWorkMs = afternoonEndTime.getTime() - Math.max(afternoonStartTime.getTime(), afternoonEntryTime.getTime());
        totalHours += afternoonWorkMs / (1000 * 60 * 60);
    }

    return Math.max(0, totalHours);
};


const calculatePayroll = (): PayrollEntry[] => {
  const payroll: PayrollEntry[] = [];
  const today = new Date();
  
  const ethiopianDateFormatter = new Intl.DateTimeFormat('am-ET-u-ca-ethiopic', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
  });

  const lastWeek = {
    start: startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
    end: endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
  };
  const lastMonth = {
      start: startOfMonth(subMonths(today, 1)),
      end: endOfMonth(subMonths(today, 1))
  }

  employees.forEach(employee => {
     const hourlyRate = employee.hourlyRate || 
      (employee.dailyRate ? employee.dailyRate / 8 : 0) || 
      (employee.monthlyRate ? employee.monthlyRate / 22 / 8 : 0);

    if (!hourlyRate) return;

    if (employee.paymentMethod === 'Weekly') {
      const relevantRecords = attendanceRecords.filter(
        record =>
          record.employeeId === employee.id &&
          (record.status === 'Present' || record.status === 'Late') &&
          isWithinInterval(new Date(record.date), lastWeek)
      );
      
      let totalHours = 0;
      relevantRecords.forEach(record => {
          totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
      });

      if(totalHours > 0) {
        payroll.push({
            employeeId: employee.id,
            employeeName: employee.name,
            paymentMethod: 'Weekly',
            period: `${ethiopianDateFormatter.format(lastWeek.start)} - ${ethiopianDateFormatter.format(lastWeek.end)}`,
            amount: totalHours * hourlyRate,
            status: 'Unpaid',
        });
      }
    } else if (employee.paymentMethod === 'Monthly') {
       const relevantRecords = attendanceRecords.filter(
        record =>
          record.employeeId === employee.id &&
          (record.status === 'Present' || record.status === 'Late') &&
          isWithinInterval(new Date(record.date), lastMonth)
      );

      let totalHours = 0;
      relevantRecords.forEach(record => {
          totalHours += calculateHoursWorked(record.morningEntry, record.afternoonEntry);
      });
      
      if (totalHours > 0) {
        payroll.push({
            employeeId: employee.id,
            employeeName: employee.name,
            paymentMethod: 'Monthly',
            period: new Intl.DateTimeFormat('am-ET-u-ca-ethiopic', { year: 'numeric', month: 'long' }).format(lastMonth.start),
            amount: totalHours * hourlyRate,
            status: 'Unpaid',
        });
      }
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
                  <TableCell>ETB {entry.amount.toFixed(2)}</TableCell>
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
