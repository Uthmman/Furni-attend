
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Employee } from "@/lib/types";
import { useFirestore, errorEmitter, FirestorePermissionError } from "@/firebase";
import { collection, addDoc, doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const employeeSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  phone: z.string().min(9, { message: "Please enter a valid phone number." }),
  position: z.string().optional(),
  paymentMethod: z.enum(["Weekly", "Monthly"]),
  accountNumber: z.string().min(5, { message: "Account number is required." }),
  dailyRate: z.coerce.number().optional(),
  monthlyRate: z.coerce.number().optional(),
  hourlyRate: z.coerce.number().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  employee?: Employee | null;
}

export function EmployeeForm({ isOpen, setIsOpen, employee }: EmployeeFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isEditMode = !!employee;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: "",
      phone: "",
      position: "",
      paymentMethod: "Weekly",
      accountNumber: "",
      dailyRate: 0,
      monthlyRate: 0,
      hourlyRate: 0,
    },
  });

  useEffect(() => {
    if (employee) {
      form.reset({
        name: employee.name || "",
        phone: employee.phone || "",
        position: employee.position || "",
        paymentMethod: employee.paymentMethod || "Weekly",
        accountNumber: employee.accountNumber || "",
        dailyRate: employee.dailyRate || 0,
        monthlyRate: employee.monthlyRate || 0,
        hourlyRate: employee.hourlyRate || 0,
      });
    } else {
        form.reset(form.formState.defaultValues);
    }
  }, [employee, form, isOpen]);


  const onSubmit = async (data: EmployeeFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);
    
    const handleSuccess = (action: "Added" | "Updated") => {
       toast({
          title: `Employee ${action}`,
          description: `${data.name}'s information has been successfully ${action.toLowerCase()}.`,
        });
        setIsSubmitting(false);
        setIsOpen(false);
        form.reset();
    };

    const handleError = (error: any, path: string, operation: 'create' | 'update') => {
      const permissionError = new FirestorePermissionError({
        path,
        operation,
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
      setIsSubmitting(false);
    };

    if (isEditMode && employee?.id) {
      const employeeRef = doc(firestore, "employees", employee.id);
      setDoc(employeeRef, data, { merge: true })
        .then(() => handleSuccess("Updated"))
        .catch(error => handleError(error, employeeRef.path, 'update'));
    } else {
      const collectionRef = collection(firestore, "employees");
      addDoc(collectionRef, data)
        .then(() => handleSuccess("Added"))
        .catch(error => handleError(error, collectionRef.path, 'create'));
    }
  };

  const paymentMethod = form.watch("paymentMethod");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Employee" : "Add New Employee"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. John Smith" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 0912345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Position</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Lead Carpenter" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accountNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Account Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 1000123456789" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a payment method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Weekly">Weekly</SelectItem>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {paymentMethod === 'Weekly' && (
                 <FormField
                    control={form.control}
                    name="dailyRate"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Daily Rate (ETB)</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="e.g. 500" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            )}

            {paymentMethod === 'Monthly' && (
                 <FormField
                    control={form.control}
                    name="monthlyRate"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Monthly Rate (ETB)</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="e.g. 10000" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            )}
             <FormField
                control={form.control}
                name="hourlyRate"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Hourly Rate (ETB) (Optional)</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="Overrides automatic calculation" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />


            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                    </>
                ) : "Save Employee"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
