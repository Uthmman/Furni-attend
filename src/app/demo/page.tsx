'use client';

import { useEffect } from 'react';
import { usePageTitle } from "@/components/page-title-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

// Import mock data
import { employees, orders, items, stockAdjustments } from '@/lib/data';
import { format } from 'date-fns';
import { EmployeeList } from '../employees/employee-list';

export default function DemoPage() {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("App Demo");
  }, [setTitle]);

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Demo Showcase</CardTitle>
          <CardDescription>
            This page demonstrates the various features of the application using mock data.
            The actual application uses live data from Firebase.
          </CardDescription>
        </CardHeader>
      </Card>
      
      {/* Employees Section */}
      <Card>
        <CardHeader>
          <CardTitle>Employees</CardTitle>
          <CardDescription>Manage your team members.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeList employees={employees} />
        </CardContent>
      </Card>
      
      {/* Orders Section */}
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>Track customer orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {order.productPictureUrl && (
                        <Image src={order.productPictureUrl} alt={order.orderDescription || 'Product image'} width={40} height={40} className="rounded-md object-cover" />
                      )}
                      <span>{order.orderDescription}</span>
                    </div>
                  </TableCell>
                  <TableCell>{format(new Date(order.orderDate), "PPP")}</TableCell>
                  <TableCell>
                    <Badge variant={order.orderStatus === 'Completed' ? 'secondary' : order.orderStatus === 'Processing' ? 'default' : 'outline'}>
                      {order.orderStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Store Inventory Section */}
      <Card>
        <CardHeader>
          <CardTitle>Store Inventory</CardTitle>
          <CardDescription>Keep track of raw materials and stock levels.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Stock Level</TableHead>
                <TableHead>Unit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.stockLevel}</TableCell>
                  <TableCell>{item.unitOfMeasurement}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Stock Adjustments Section */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Adjustments</CardTitle>
          <CardDescription>History of stock changes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockAdjustments.map((adj) => (
                <TableRow key={adj.id}>
                  <TableCell>{adj.itemId}</TableCell>
                  <TableCell>{format(new Date(adj.adjustmentDate), "PPP p")}</TableCell>
                  <TableCell className={adj.adjustmentQuantity > 0 ? 'text-primary' : 'text-destructive'}>
                    {adj.adjustmentQuantity > 0 ? `+${adj.adjustmentQuantity}` : adj.adjustmentQuantity}
                  </TableCell>
                  <TableCell>{adj.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
