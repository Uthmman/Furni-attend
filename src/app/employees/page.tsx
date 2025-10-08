
"use client";

import { useEffect } from "react";
import { usePageTitle } from "@/components/page-title-provider";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { EmployeeList } from "./employee-list";
import { useCollection } from "@/firebase";
import { collection } from "firebase/firestore";


export default function EmployeesPage() {
  const { setTitle } = usePageTitle();
  const { data: employees, loading } = useCollection(collection(useFirestore(), 'employees'));

  useEffect(() => {
    setTitle("Employees");
  }, [setTitle]);

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between">
         <div/>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <EmployeeList employees={employees || []} />
    </div>
  );
}
