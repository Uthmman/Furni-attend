
"use client";

import { useEffect, useState } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { EmployeeList } from "./employee-list";
import { useCollection, useFirestore } from "@/firebase";
import { collection } from "firebase/firestore";
import { EmployeeForm } from "./employee-form";

export default function EmployeesPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { data: employees, loading } = useCollection(collection(firestore, 'employees'));
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    setTitle("Employees");
  }, [setTitle]);

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <EmployeeForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={() => setIsFormOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <EmployeeList employees={employees || []} />
    </div>
  );
}

    