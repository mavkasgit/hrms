import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Filter, Eye } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { YearFilter } from "@/shared/ui/year-filter"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import { SortableFilterHeader } from "@/shared/ui/SortableFilterHeader"
import { useTableQueryEngine, type ColumnSortDef, type SortConfig } from "@/shared/hooks/useTableQueryEngine"
import { nextMultiSortConfigs } from "@/shared/lib/multiSort"
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
import { ORDER_TYPE_CODE_LABELS, type ContractHistory } from "@/entities/contract/types"
import { EmployeeSearch } from "@/features/employee-search"
import type { Employee } from "@/entities/employee/types"

type SortField = "contract_number" | "employee_name" | "contract_start" | "contract_end" | "order_type_code" | "order_number" | "order_date"

export function ContractRegistryModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(null)
  const [filterOrderType, setFilterOrderType] = useState<string | undefined>(undefined)
  const [sortConfigs, setSortConfigs] = useState<SortConfig<SortField>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<SortField, Set<string>>>({
    contract_number: new Set(),
    employee_name: new Set(),
    contract_start: new Set(),
    contract_end: new Set(),
    order_type_code: new Set(),
    order_number: new Set(),
    order_date: new Set(),
  })

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
    setColumnFilters({
      contract_number: new Set(),
      employee_name: new Set(),
      contract_start: new Set(),
      contract_end: new Set(),
      order_type_code: new Set(),
      order_number: new Set(),
      order_date: new Set(),
    })
  }

  const formatOrderType = (code: string) => ORDER_TYPE_CODE_LABELS[code] || code

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
  }

  const handleSort = (field: SortField) => {
    const defaultOrder = (field === "employee_name" || field === "order_type_code") ? "asc" : "desc"
    setSortConfigs((prev) => nextMultiSortConfigs(prev, field, defaultOrder))
  }

  const sortDefs: ColumnSortDef<ContractHistory, SortField>[] = useMemo(() => [
    { field: "contract_number", getSortValue: (c) => c.contract_number ?? "" },
    { field: "employee_name", getSortValue: (c) => c.employee_name ?? "" },
    { field: "contract_start", getSortValue: (c) => c.contract_start },
    { field: "contract_end", getSortValue: (c) => c.contract_end ?? "" },
    { field: "order_type_code", getSortValue: (c) => formatOrderType(c.order_type_code) },
    { field: "order_number", getSortValue: (c) => c.order_number ?? "" },
    { field: "order_date", getSortValue: (c) => c.order_date ?? "" },
  ], [])

  const localFilterPredicate = useMemo(() => {
    const hasFilters = Object.values(columnFilters).some((s) => s && s.size > 0)
    if (!hasFilters) return null
    return (c: ContractHistory) => {
      for (const [field, selected] of Object.entries(columnFilters)) {
        if (selected && selected.size > 0) {
          let val = ""
          if (field === "contract_number") val = c.contract_number ?? "—"
          else if (field === "employee_name") val = c.employee_name ?? "—"
          else if (field === "contract_start") val = formatDate(c.contract_start)
          else if (field === "contract_end") val = formatDate(c.contract_end)
          else if (field === "order_type_code") val = formatOrderType(c.order_type_code)
          else if (field === "order_number") val = c.order_number ?? "—"
          else if (field === "order_date") val = formatDate(c.order_date)

          if (!selected.has(val)) return false
        }
      }
      return true
    }
  }, [columnFilters])

  const engineResult = useTableQueryEngine({
    rows: items,
    getId: (c) => c.id,
    searchQuery: "",
    filterPredicate: localFilterPredicate,
    sortConfigs,
    sortDefs,
  })
  const displayContracts = engineResult.rows

  const uniqueValues = useMemo(() => {
    return {
      contract_number: [...new Set(items.map(c => c.contract_number ?? "—"))].sort(),
      employee_name: [...new Set(items.map(c => c.employee_name ?? "—"))].sort(),
      contract_start: [...new Set(items.map(c => formatDate(c.contract_start)))].sort(),
      contract_end: [...new Set(items.map(c => formatDate(c.contract_end)))].sort(),
      order_type_code: [...new Set(items.map(c => formatOrderType(c.order_type_code)))].sort(),
      order_number: [...new Set(items.map(c => c.order_number ?? "—"))].sort(),
      order_date: [...new Set(items.map(c => formatDate(c.order_date)))].sort(),
    }
  }, [items])

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
          ) : !displayContracts.length ? (
            <EmptyState
              message="Контракты не найдены"
              description="Создайте приказ, связанный с контрактом"
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortableFilterHeader
                        field="contract_number"
                        label="№ контракта"
                        currentSorts={sortConfigs}
                        onSortChange={handleSort}
                        values={uniqueValues.contract_number}
                        selectedValues={columnFilters.contract_number}
                        onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableFilterHeader
                        field="employee_name"
                        label="Сотрудник"
                        currentSorts={sortConfigs}
                        onSortChange={handleSort}
                        values={uniqueValues.employee_name}
                        selectedValues={columnFilters.employee_name}
                        onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                      />
                    </TableHead>
                    <TableHead>Подразделение</TableHead>
                    <TableHead>
                      <SortableFilterHeader
                        field="contract_start"
                        label="Начало"
                        currentSorts={sortConfigs}
                        onSortChange={handleSort}
                        values={uniqueValues.contract_start}
                        selectedValues={columnFilters.contract_start}
                        onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableFilterHeader
                        field="contract_end"
                        label="Конец"
                        currentSorts={sortConfigs}
                        onSortChange={handleSort}
                        values={uniqueValues.contract_end}
                        selectedValues={columnFilters.contract_end}
                        onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableFilterHeader
                        field="order_type_code"
                        label="Тип приказа"
                        currentSorts={sortConfigs}
                        onSortChange={handleSort}
                        values={uniqueValues.order_type_code}
                        selectedValues={columnFilters.order_type_code}
                        onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableFilterHeader
                        field="order_number"
                        label="№ приказа"
                        currentSorts={sortConfigs}
                        onSortChange={handleSort}
                        values={uniqueValues.order_number}
                        selectedValues={columnFilters.order_number}
                        onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableFilterHeader
                        field="order_date"
                        label="Дата приказа"
                        currentSorts={sortConfigs}
                        onSortChange={handleSort}
                        values={uniqueValues.order_date}
                        selectedValues={columnFilters.order_date}
                        onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                      />
                    </TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayContracts.map((contract) => (
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
                Всего: {displayContracts.length} из {total}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
