import { useState, useEffect, useRef, useMemo } from "react"
import { Plus, Search, Filter, Pencil, ArrowUp, ArrowDown, ArrowUpDown, Upload, ScrollText } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
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
import { ImportEmployeesModal } from "@/features/import-employees/ImportEmployeesModal"
import { GlobalAuditLog } from "@/features/global-audit-log"
import type { Employee, EmployeeStatus } from "@/entities/employee/types"

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

type SortField = "name" | "age" | "department" | "position" | "hire_date"
type SortOrder = "asc" | "desc"

interface SortConfig {
  field: SortField
  order: SortOrder
}

const GENDERS = [
  { value: "М", label: "Мужчины", activeBg: "bg-sky-100", activeText: "text-sky-700", activeBorder: "border-sky-300" },
  { value: "Ж", label: "Женщины", activeBg: "bg-rose-100", activeText: "text-rose-700", activeBorder: "border-rose-300" },
]

function getGenderButtonClass(gender: string, active: boolean): string {
  const g = GENDERS.find((x) => x.value === gender)
  if (!g) return active ? "bg-muted text-foreground border-border" : "hover:bg-accent text-muted-foreground"
  return active
    ? `${g.activeBg} ${g.activeText} ${g.activeBorder}`
    : "hover:bg-accent text-muted-foreground"
}

export function EmployeesPage() {
  const [status, setStatus] = useState<EmployeeStatus>("active")
  const [q, setQ] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedGenders, setSelectedGenders] = useState<Set<string>>(new Set())
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([])
  const filtersRef = useRef<HTMLDivElement>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  const genderFilter = selectedGenders.size === 1 ? [...selectedGenders][0] : undefined

  const { data, isLoading, error } = useEmployees({
    page: 1,
    per_page: 1000,
    status,
    q: q || undefined,
    gender: genderFilter,
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

  const toggleGender = (gender: string) => {
    setSelectedGenders((prev) => {
      const next = new Set(prev)
      if (next.has(gender)) next.delete(gender)
      else next.add(gender)
      return next
    })
  }

  const resetFilters = () => {
    setSearchInput("")
    setQ("")
    setSelectedGenders(new Set())
    setSortConfigs([])
    setStatus("active")
  }

  const handleSort = (field: SortField) => {
    setSortConfigs((prev) => {
      const existing = prev.find((c) => c.field === field)
      if (!existing) return [...prev, { field, order: "asc" }]
      if (existing.order === "asc") return prev.map((c) => c.field === field ? { ...c, order: "desc" } : c)
      return prev.filter((c) => c.field !== field)
    })
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    const config = sortConfigs.find((c) => c.field === field)
    const sortIndex = sortConfigs.findIndex((c) => c.field === field) + 1

    if (!config) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />

    return (
      <span className="flex items-center ml-1">
        <span className="text-xs text-muted-foreground mt-0.5">{sortIndex}</span>
        {config.order === "asc" ? <ArrowUp className="h-3 w-3 ml-0.5" /> : <ArrowDown className="h-3 w-3 ml-0.5" />}
      </span>
    )
  }

  // Клиентская сортировка
  const sortedItems = useMemo(() => {
    if (!data?.items || sortConfigs.length === 0) return data?.items ?? []
    return [...data.items].sort((a, b) => {
      for (const { field, order } of sortConfigs) {
        let aVal: string | number | null
        let bVal: string | number | null
        if (field === "age") {
          aVal = calculateAge(a.birth_date) ?? 0
          bVal = calculateAge(b.birth_date) ?? 0
        } else if (field === "hire_date") {
          aVal = a.contract_end ?? ""
          bVal = b.contract_end ?? ""
        } else if (field === "department") {
          aVal = a.department?.name ?? ""
          bVal = b.department?.name ?? ""
        } else if (field === "position") {
          aVal = a.position?.name ?? ""
          bVal = b.position?.name ?? ""
        } else {
          aVal = (a[field as keyof typeof a] ?? "") as string | number
          bVal = (b[field as keyof typeof b] ?? "") as string | number
        }
        if (aVal < bVal) return order === "asc" ? -1 : 1
        if (aVal > bVal) return order === "asc" ? 1 : -1
      }
      return 0
    })
  }, [data?.items, sortConfigs])

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center">
        {children}
        <SortIcon field={field} />
      </div>
    </TableHead>
  )

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAuditLogOpen(true)}>
            <ScrollText className="mr-2 h-4 w-4" />
            Журнал
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Импорт
          </Button>
          <Button onClick={() => { setEditingEmployee(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО или таб. номеру..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Toggle М/Ж */}
        <div className="flex gap-2">
          {GENDERS.map((g) => {
            const active = selectedGenders.has(g.value)
            return (
              <button
                key={g.value}
                onClick={() => toggleGender(g.value)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${getGenderButtonClass(g.value, active)}`}
              >
                {g.label}
              </button>
            )
          })}
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

        <Button variant="outline" size="sm" onClick={resetFilters}>
          Очистить
        </Button>
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
      ) : !sortedItems?.length ? (
        <EmptyState
          message="Сотрудники не найдены"
          description="Добавьте первого сотрудника или измените фильтры"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Таб. №</TableHead>
              <SortHeader field="name">ФИО</SortHeader>
              <SortHeader field="department">Подразделение</SortHeader>
              <SortHeader field="position">Должность</SortHeader>
              <SortHeader field="age">Возраст</SortHeader>
              <SortHeader field="hire_date">Конец контракта</SortHeader>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((emp) => {
              const age = calculateAge(emp.birth_date)
              return (
                <TableRow
                  key={emp.id}
                  className={`${emp.is_archived ? "bg-muted/30" : ""} cursor-pointer hover:bg-muted/50 transition-colors`}
                  onClick={() => handleEdit(emp)}
                >
                  <TableCell className="font-mono text-sm">{emp.tab_number ?? "—"}</TableCell>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell>{emp.department?.name ?? "—"}</TableCell>
                  <TableCell>{emp.position?.name ?? "—"}</TableCell>
                  <TableCell>{age !== null ? `${age} лет` : "—"}</TableCell>
                  <TableCell>
                    {emp.contract_end ? new Date(emp.contract_end).toLocaleDateString("ru-RU") : "—"}
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
              )
            })}
          </TableBody>
        </Table>
      )}

      <EmployeeForm
        open={formOpen}
        onOpenChange={handleFormClose}
        employee={editingEmployee}
      />
      <GlobalAuditLog open={auditLogOpen} onOpenChange={setAuditLogOpen} />
      <ImportEmployeesModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={() => {
          window.location.reload()
        }}
      />
    </div>
  )
}
