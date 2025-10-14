
'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface ChartDataItem {
  name: string;
  [key: string]: number | string;
}

interface DataSeries {
  key: string;
  name: string;
  color: string;
}

interface ExpenseChartProps {
    title: string;
    description?: string;
    chartData: ChartDataItem[];
    series: DataSeries[];
    total: number;
}

export function ExpenseChart({ title, description, chartData, series, total }: ExpenseChartProps) {
  return (
    <Card>
        <CardHeader>
            <CardTitle>
                {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `ETB ${value}`} />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--background))",
                            borderColor: "hsl(var(--border))",
                        }}
                    />
                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                     {series.map(s => (
                        <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId="a" radius={[4, 4, 0, 0]} />
                    ))}
                </BarChart>
                </ResponsiveContainer>
            </div>
             <div className="mt-4 flex justify-end items-center border-t pt-4">
                 <div className="text-right">
                    <p className="text-sm font-bold text-primary">Total for Month</p>
                    <p className="font-bold text-lg text-primary">ETB {total.toFixed(2)}</p>
                </div>
            </div>
        </CardContent>
    </Card>
  );
}
