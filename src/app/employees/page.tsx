"use client";

import { useEffect } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import {
  employees as initialEmployees,
} from "@/lib/data";
import { EmployeeList } from "./employee-list";


export default function EmployeesPage() {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Employees");
  }, [setTitle]);

  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between">
         <div/>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <EmployeeList employees={initialEmployees} />
    </div>
  );
}
