import { TableRow, TableCell } from "@/shared/ui/table"
import { formatDate } from "@/shared/utils/date"
import type { GroupEmployeeInfo } from "../types"

interface GroupOrderEmployeesRowsProps {
  employees: GroupEmployeeInfo[]
  type: "orders" | "unpaid" | "weekend"
  orderNumber: string
}



export function GroupOrderEmployeesRows({ employees, type, orderNumber }: GroupOrderEmployeesRowsProps) {
  return (
    <>
      {employees.map((emp) => {
        const nameCell = (
          <TableCell key="name" className="py-1">
            <div className="font-normal text-sm">{emp.employee_full_name}</div>
          </TableCell>
        )

        const prefixCell = (
          <TableCell className="pl-6 py-1 text-muted-foreground font-mono whitespace-nowrap">
            ↳ {orderNumber}
          </TableCell>
        )

        if (type === "orders") {
          return (
            <TableRow key={emp.employee_id} className="bg-muted/10 hover:bg-muted/20 border-t-0 h-8">
              {prefixCell}
              <TableCell className="py-1" />
              {nameCell}
              <TableCell className="py-1" />
              <TableCell className="py-1" />
              <TableCell className="py-1" />
            </TableRow>
          )
        }

        if (type === "unpaid") {
          return (
            <TableRow key={emp.employee_id} className="bg-muted/10 hover:bg-muted/20 border-t-0 h-8">
              {prefixCell}
              {nameCell}
              <TableCell className="py-1">
                {formatDate(emp.vacation_start)} — {formatDate(emp.vacation_end)}
              </TableCell>
              <TableCell className="py-1">{emp.vacation_days}</TableCell>
              <TableCell className="py-1" />
              <TableCell className="py-1" />
            </TableRow>
          )
        }

        if (type === "weekend") {
          return (
            <TableRow key={emp.employee_id} className="bg-muted/10 hover:bg-muted/20 border-t-0 h-8">
              {prefixCell}
              {nameCell}
              <TableCell className="py-1">
                {formatDate(emp.vacation_start) === formatDate(emp.vacation_end)
                  ? formatDate(emp.vacation_start)
                  : `${formatDate(emp.vacation_start)} — ${formatDate(emp.vacation_end)}`}
              </TableCell>
              <TableCell className="py-1" />
              <TableCell className="py-1" />
            </TableRow>
          )
        }

        return null
      })}
    </>
  )
}
