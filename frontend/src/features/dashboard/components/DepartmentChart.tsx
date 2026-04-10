import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { DepartmentCount, DepartmentPosition } from "../types"
import { Building2 } from "lucide-react"

interface DepartmentChartProps {
  data: DepartmentCount[] | DepartmentPosition[]
  isLoading?: boolean
  labelKey?: string
}

export function DepartmentChart({ data, isLoading, labelKey }: DepartmentChartProps) {
  const label = labelKey || (data.length > 0 && "position" in data[0] ? "position" : "department")

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-48" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {labelKey === "position" ? "По должностям" : "По отделам"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data as any[]}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey={label}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "#f3f4f6" }}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            />
            <Bar
              dataKey="count"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
