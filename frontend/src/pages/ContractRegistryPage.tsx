import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Filter, ArrowUp, ArrowDown, ArrowUpDown, Eye } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { YearFilter } from "@/shared/ui/year-filter"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import {
  useContractRegistry,
  useContractYears,
} from "@/entities/contract/useContractHistory"
import { ORDER_TYPE_CODE_LABELS } from "@/entities/contract/types"
import { EmployeeSearch } from "@/features/employee-search"
import type { Employee } from "@/entities/employee/types"

type SortField = "contract_number" | "employee_name" | "contract_start" | "contract_end" | "order_type_code" | "order_number" | "order_date"
type SortOrder = "asc" | "desc"

interface SortConfig {
  field: SortField
  order: SortOrder
}

export function ContractRegistryModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(null)
  const [filterOrderType, setFilterOrderType] = useState<string | undefined>(undefined)
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([])

  const { data: years } = useContractYears()

  const { data, isLoading } = useContractRegistry({
    employee_id: filterEmployee?.id,
    order_type_code: filterOrderType,
    year,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterEmployee) count++
    if (filterOrderType) count++
    if (year) count++
    return count
  }, [filterEmployee, filterOrderType, year])

  const clearFilters = () => {
    setFilterEmployee(null)
    setFilterOrderType(undefined)
    setYear(undefined)
    setSortConfigs([])
  }

  const formatOrderType = (code: string) => ORDER_TYPE_CODE_LABELS[code] || code

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
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

  const sortedItems = useMemo(() => {
    if (sortConfigs.length === 0) return items
    return [...items].sort((a, b) => {
      for (const { field, order } of sortConfigs) {
        let aVal: string | number | null
        let bVal: string | number | null
        if (field === "employee_name") {
          aVal = a.employee_name ?? ""
          bVal = b.employee_name ?? ""
        } else if (field === "order_type_code") {
          aVal = formatOrderType(a.order_type_code)
          bVal = formatOrderType(b.order_type_code)
        } else {
          aVal = (a[field as keyof typeof a] as string | number | null) ?? ""
          bVal = (b[field as keyof typeof b] as string | number | null) ?? ""
        }
        if (aVal < bVal) return order === "asc" ? -1 : 1
        if (aVal > bVal) return order === "asc" ? 1 : -1
      }
      return 0
    })
  }, [items, sortConfigs])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-[1200px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Реестр контрактов</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Filters */}
          <div className="border rounded-lg bg-card">
            <div className="flex items-center gap-2 px-4 py-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Фильтры</h2>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs">{activeFilterCount}</Badge>
              )}
            </div>

            <div className="border-t px-4 py-4 space-y-4">
              <div className="flex flex-wrap gap-6 items-end">
                <div className="w-[280px]">
                  <label className="text-sm font-medium">Сотрудник</label>
                  <div className="mt-1">
                    <EmployeeSearch
                      value={filterEmployee}
                      onChange={setFilterEmployee}
                      placeholder="Выберите сотрудника"
                      label=" "
                      width="w-full"
                    />
                  </div>
                </div>

                <div className="w-[220px]">
                  <label className="text-sm font-medium">Тип приказа</label>
                  <div className="mt-1 relative">
                    {filterOrderType ? (
                      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 h-10 text-sm">
                        <span className="flex-1 truncate">{formatOrderType(filterOrderType)}</span>
                        <button type="button" onClick={() => setFilterOrderType(undefined)} className="shrink-0 text-muted-foreground hover:text-foreground">
                          ×
                        </button>
                      </div>
                    ) : (
                      <select
                        className="w-full h-10 border rounded-md px-3 text-sm bg-background"
                        value=""
                        onChange={(e) => setFilterOrderType(e.target.value || undefined)}
                      >
                        <option value="">Все типы</option>
                        {Object.entries(ORDER_TYPE_CODE_LABELS).map(([code, label]) => (
                          <option key={code} value={code}>{label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <YearFilter value={year} onChange={setYear} years={years} />
                <Button variant="outline" size="sm" onClick={clearFilters} className="ml-auto">Сбросить фильтры</Button>
              </div>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !sortedItems.length ? (
            <EmptyState
              message="Контракты не найдены"
              description="Создайте приказ, связанный с контрактом"
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader field="contract_number">№ контракта</SortHeader>
                    <SortHeader field="employee_name">Сотрудник</SortHeader>
                    <TableHead>Подразделение</TableHead>
                    <SortHeader field="contract_start">Начало</SortHeader>
                    <SortHeader field="contract_end">Конец</SortHeader>
                    <SortHeader field="order_type_code">Тип приказа</SortHeader>
                    <SortHeader field="order_number">№ приказа</SortHeader>
                    <SortHeader field="order_date">Дата приказа</SortHeader>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-mono text-sm">
                        {contract.contract_number || "—"}
                      </TableCell>
                      <TableCell className="font-medium">{contract.employee_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {contract.employee_department || "—"}
                      </TableCell>
                      <TableCell>{formatDate(contract.contract_start)}</TableCell>
                      <TableCell>{formatDate(contract.contract_end)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatOrderType(contract.order_type_code)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{contract.order_number || "—"}</TableCell>
                      <TableCell>{formatDate(contract.order_date)}</TableCell>
                      <TableCell className="text-right">
                        {contract.order_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Перейти к приказу"
                            onClick={() => navigate(`/orders?employeeId=${contract.employee_id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="text-sm text-muted-foreground px-2">
                Всего: {total}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
