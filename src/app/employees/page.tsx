
"use client";

import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { EmployeeList } from "./employee-list";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection } from "firebase/firestore";
import { EmployeeForm } from "./employee-form";

export default function EmployeesPage() {
  const { setTitle } = usePageTitle();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const employeesCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'employees');
  }, [firestore, user]);

  const { data: employees, loading } = useCollection(employeesCollectionRef);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    setTitle("Employees");
  }, [setTitle]);

  if (loading || isUserLoading) {
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
