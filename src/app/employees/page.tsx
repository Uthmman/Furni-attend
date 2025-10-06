import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import {
  employees as initialEmployees,
} from "@/lib/data";
import { EmployeeList } from "./employee-list";


export default function EmployeesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employees"
        description="Manage employee details and track attendance."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </PageHeader>

      <EmployeeList employees={initialEmployees} />
    </div>
  );
}
