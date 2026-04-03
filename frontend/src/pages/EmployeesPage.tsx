import { useState, useEffect, useRef } from "react"
import { Plus, Search, Filter, Pencil } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import { useEmployees } from "@/entities/employee/useEmployees"
import { EmployeeForm } from "@/features/employee-form"
import type { Employee, EmployeeStatus } from "@/entities/employee/types"

export function EmployeesPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<EmployeeStatus>("active")
  const [q, setQ] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  const { data, isLoading, error } = useEmployees({
    page: 1,
    per_page: 1000,
    status,
    q: q || undefined,
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== q) {
        setQ(searchInput)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormOpen(true)
  }

  const handleFormClose = (open: boolean) => {
    setFormOpen(open)
    if (!open) setEditingEmployee(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Сотрудники</h1>
        <Button onClick={() => { setEditingEmployee(null); setFormOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Добавить
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО или таб. номеру..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <div ref={filtersRef} className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={status !== "active" ? "border-blue-300" : ""}
          >
            <Filter className="h-4 w-4 mr-1" />
            Фильтры
          </Button>
          {filtersOpen && (
            <div className="absolute right-0 top-full mt-1 bg-popover border rounded-md shadow-lg p-3 z-50 w-56">
              <p className="text-xs font-medium text-muted-foreground mb-2">Статус</p>
              <div className="flex flex-col gap-1">
                {(["active", "archived", "all", "deleted"] as EmployeeStatus[]).map((s) => (
                  <button
                    key={s}
                    className={`text-left px-2 py-1.5 text-sm rounded hover:bg-muted ${
                      status === s ? "bg-muted font-medium" : ""
                    }`}
                    onClick={() => setStatus(s)}
                  >
                    {s === "active" ? "Активные" : s === "archived" ? "В архиве" : s === "all" ? "Все" : "Удалённые"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {(error as Error).message || "Ошибка загрузки данных"}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <EmptyState
          message="Сотрудники не найдены"
          description="Добавьте первого сотрудника или измените фильтры"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Таб. №</TableHead>
              <TableHead>ФИО</TableHead>
              <TableHead>Подразделение</TableHead>
              <TableHead>Должность</TableHead>
              <TableHead>Дата приёма</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((emp) => (
              <TableRow 
                key={emp.id} 
                className={`${emp.is_archived ? "bg-muted/30" : ""} cursor-pointer hover:bg-muted/50 transition-colors`}
                onClick={() => handleEdit(emp)}
              >
                <TableCell className="font-mono text-sm">{emp.tab_number ?? "—"}</TableCell>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell>{emp.department}</TableCell>
                <TableCell>{emp.position}</TableCell>
                <TableCell>
                  {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString("ru-RU") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Редактировать"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(emp)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <EmployeeForm
        open={formOpen}
        onOpenChange={handleFormClose}
        employee={editingEmployee}
      />
    </div>
  )
}
