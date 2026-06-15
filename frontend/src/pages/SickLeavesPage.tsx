import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { ChevronDown, ChevronRight, Trash2, X } from "lucide-react"
import { SortableFilterHeader } from "@/shared/ui/SortableFilterHeader"
import { useTableQueryEngine, type ColumnSortDef, type SortConfig } from "@/shared/hooks/useTableQueryEngine"
import { nextMultiSortConfigs } from "@/shared/lib/multiSort"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  useCreateSickLeave,
  useDeleteSickLeave,
  useSickLeaves,
} from "@/entities/sick-leave/useSickLeaves"
import { EmployeeSearch } from "@/features/employee-search"
import type { Employee } from "@/entities/employee/types"
import type { SickLeave } from "@/entities/sick-leave/types"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

type SortField = "employee_name" | "start_date" | "end_date" | "days_count" | "comment"

export function SickLeavesPage() {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [comment, setComment] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const [nameFilter, setNameFilter] = useState("")
  const [page, setPage] = useState(1)
  const [allSickLeaves, setAllSickLeaves] = useState<SickLeave[]>([])
  const loaderRef = useRef<HTMLDivElement>(null)

  const { data: sickLeavesData, isLoading, isFetching } = useSickLeaves({
    q: nameFilter || undefined,
    page,
    per_page: 20,
  })

  // Accumulate sick leaves as pages load
  useEffect(() => {
    if (sickLeavesData?.items) {
      if (page === 1) {
        setAllSickLeaves(sickLeavesData.items)
      } else {
        setAllSickLeaves(prev => {
          const existingIds = new Set(prev.map(s => s.id))
          const newItems = sickLeavesData.items.filter(s => !existingIds.has(s.id))
          return [...prev, ...newItems]
        })
      }
    }
  }, [sickLeavesData, page])

  const prevNameFilterRef = useRef(nameFilter)

  // Reset on filter change
  useEffect(() => {
    if (prevNameFilterRef.current !== nameFilter) {
      setPage(1)
      setAllSickLeaves([])
      prevNameFilterRef.current = nameFilter
    }
  }, [nameFilter])

  // IntersectionObserver for infinite scroll
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries
    if (entry.isIntersecting && sickLeavesData && sickLeavesData.page < sickLeavesData.pages && !isFetching) {
      setPage(prev => prev + 1)
    }
  }, [sickLeavesData, isFetching])

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { rootMargin: "200px" })
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [handleObserver])

  const createMutation = useCreateSickLeave()
  const deleteMutation = useDeleteSickLeave()

  const resetForm = () => {
    setSelectedEmployee(null)
    setStartDate("")
    setEndDate("")
    setComment("")
    setErrors({})
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedEmployee) newErrors.employee = "Выберите сотрудника"
    if (!startDate) newErrors.startDate = "Укажите дату начала"
    if (!endDate) newErrors.endDate = "Укажите дату конца"
    if (startDate && endDate && endDate < startDate) newErrors.endDate = "Дата конца раньше даты начала"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    
    const payload = {
      employee_id: selectedEmployee!.id,
      start_date: startDate,
      end_date: endDate,
      comment: comment || null,
    }
    
    createMutation.mutate(payload, {
      onSuccess: () => {
        setSuccessMessage("Больничный успешно создан!")
        setTimeout(() => setSuccessMessage(null), 5000)
        resetForm()
      },
      onError: (error: any) => {
        console.error(error)
      }
    })
  }

  const handleDeleteConfirm = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId, {
        onSuccess: () => {
          setSuccessMessage("Больничный удалён")
          setTimeout(() => setSuccessMessage(null), 3000)
        }
      })
    }
    setDeleteId(null)
  }

  const [sortConfigs, setSortConfigs] = useState<SortConfig<SortField>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<SortField, Set<string>>>({
    employee_name: new Set(),
    start_date: new Set(),
    end_date: new Set(),
    days_count: new Set(),
    comment: new Set(),
  })

  const handleSort = (field: SortField) => {
    const defaultOrder = (field === "start_date" || field === "end_date" || field === "days_count") ? "desc" : "asc"
    setSortConfigs((prev) => nextMultiSortConfigs(prev, field, defaultOrder))
  }

  const sortDefs: ColumnSortDef<SickLeave, SortField>[] = useMemo(() => [
    { field: "employee_name", getSortValue: (sl) => sl.employee_name },
    { field: "start_date", getSortValue: (sl) => sl.start_date },
    { field: "end_date", getSortValue: (sl) => sl.end_date },
    { field: "days_count", getSortValue: (sl) => sl.days_count },
    { field: "comment", getSortValue: (sl) => sl.comment ?? "" },
  ], [])

  const localFilterPredicate = useMemo(() => {
    const hasFilters = Object.values(columnFilters).some((s) => s && s.size > 0)
    if (!hasFilters) return null
    return (sl: SickLeave) => {
      for (const [field, selected] of Object.entries(columnFilters)) {
        if (selected && selected.size > 0) {
          if (field === "employee_name") {
            if (!selected.has(sl.employee_name)) return false
          } else if (field === "start_date") {
            const val = formatDate(sl.start_date)
            if (!selected.has(val)) return false
          } else if (field === "end_date") {
            const val = formatDate(sl.end_date)
            if (!selected.has(val)) return false
          } else if (field === "days_count") {
            const val = `${sl.days_count} дн.`
            if (!selected.has(val)) return false
          } else if (field === "comment") {
            const val = sl.comment ?? "—"
            if (!selected.has(val)) return false
          }
        }
      }
      return true
    }
  }, [columnFilters])

  const uniqueValues = useMemo(() => {
    const items = allSickLeaves ?? []
    return {
      employee_name: [...new Set(items.map(sl => sl.employee_name))].sort(),
      start_date: [...new Set(items.map(sl => formatDate(sl.start_date)))].sort(),
      end_date: [...new Set(items.map(sl => formatDate(sl.end_date)))].sort(),
      days_count: [...new Set(items.map(sl => `${sl.days_count} дн.`))].sort((a, b) => parseFloat(a) - parseFloat(b)),
      comment: [...new Set(items.map(sl => sl.comment ?? "—"))].sort(),
    }
  }, [allSickLeaves])

  const engineResult = useTableQueryEngine({
    rows: allSickLeaves ?? [],
    getId: (sl) => sl.id,
    searchQuery: "",
    filterPredicate: localFilterPredicate,
    sortConfigs,
    sortDefs,
  })
  const displaySickLeaves = engineResult.rows
  
  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg z-50">
          <span className="text-sm font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Больничные листы</h1>
      </div>

      <div className="border rounded-lg bg-card">
        <div
          className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold">Создать больничный</h2>
        </div>

        {!collapsed && (
          <div className="border-t px-4 py-4">
            <div className="grid gap-4">
              <div className="flex gap-4">
                <EmployeeSearch
                  value={selectedEmployee}
                  onChange={(emp) => {
                    setSelectedEmployee(emp)
                    if (emp) setErrors({})
                  }}
                  error={errors.employee}
                  required
                />
              </div>

              <div className="flex gap-4">
                <div className="w-[130px]">
                  <DatePicker label="Дата начала *" value={startDate} onChange={setStartDate} />
                  {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
                </div>
                <div className="w-[130px]">
                  <DatePicker label="Дата конца *" value={endDate} onChange={setEndDate} />
                  {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
                </div>
                {startDate && endDate && (
                  <div className="w-[130px]">
                    <label className="text-sm font-medium">Дней</label>
                    <Input
                      value={String(
                        Math.round(
                          (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
                        ) + 1
                      )}
                      readOnly
                      className="h-10 text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="max-w-[420px]">
                <label className="text-sm font-medium">Описание / комментарий</label>
                <Input
                  placeholder="Описание больничного..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    resetForm()
                  }}
                  disabled={createMutation.isPending}
                >
                  Очистить
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSubmit()
                  }}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Создание..." : "Создать"}
                </Button>
              </div>
              {createMutation.isError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Ошибка: {(createMutation.error as any)?.response?.data?.detail || (createMutation.error as any)?.message || "Неизвестная ошибка"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <Input
          placeholder="Поиск по сотруднику..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className="w-64 h-9 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : displaySickLeaves.length === 0 ? (
        <EmptyState message="Нет больничных" description="Создайте первый больничный лист" />
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="p-0">
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
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="start_date"
                      label="Дата начала"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.start_date}
                      selectedValues={columnFilters.start_date}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="end_date"
                      label="Дата окончания"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.end_date}
                      selectedValues={columnFilters.end_date}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="days_count"
                      label="Дней"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.days_count}
                      selectedValues={columnFilters.days_count}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="comment"
                      label="Описание"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.comment}
                      selectedValues={columnFilters.comment}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displaySickLeaves.map((sl: SickLeave) => (
                  <TableRow key={sl.id} className="border-t hover:bg-muted/30">
                    <TableCell className="px-4 py-2 font-medium">{sl.employee_name}</TableCell>
                    <TableCell className="px-4 py-2">{formatDate(sl.start_date)}</TableCell>
                    <TableCell className="px-4 py-2">{formatDate(sl.end_date)}</TableCell>
                    <TableCell className="px-4 py-2">{sl.days_count}</TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground max-w-[200px] truncate">
                      {sl.comment || "—"}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                          onClick={() => setDeleteId(sl.id)}
                          title="Удалить"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div ref={loaderRef} className="flex justify-center py-4">
            {isFetching && (
              <div className="text-sm text-muted-foreground">Загрузка...</div>
            )}
          </div>
        </>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить больничный безвозвратно?</AlertDialogTitle>
            <AlertDialogDescription>
              Больничный будет удалён безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
