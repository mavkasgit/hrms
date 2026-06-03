import { useState, useEffect, useRef, useMemo } from "react"
import { ChevronDown, ChevronRight, Trash2, FilePen, Filter, Eye, Download, X, Check, Printer } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Alert, AlertDescription } from "@/shared/ui/alert"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { EmployeeSearch } from "@/features/employee-search"
import { DocumentNumberField } from "@/features/DocumentNumberField"
import { FieldGroup, FieldRenderer, useAutoFillFields } from "@/features/dynamic-form"
import { getStatementTypeLayout } from "@/entities/statement/statementTypeLayouts"
import type { Employee } from "@/entities/employee/types"
import type { StatementType } from "@/entities/statement/types"
import {
  useStatements,
  useCreateStatementDraft,
  useDeleteStatement,
  useStatementTypes,
  useNextStatementNumber,
} from "@/entities/statement/hooks"
import { openStatementView, openStatementEdit, openStatementPrint, downloadStatementDocx } from "@/entities/statement/api"
import type { StatementCreate } from "@/entities/statement/types"

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delay])

  return debounced
}

export function StatementsSection() {
  const [collapsed, setCollapsed] = useState(false)
  const [filterCollapsed, setFilterCollapsed] = useState(true)

  // Creation form state
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedStatementTypeId, setSelectedStatementTypeId] = useState<number | null>(null)
  const [statementTypeSearch, setStatementTypeSearch] = useState("")
  const [statementTypeOpen, setStatementTypeOpen] = useState(false)
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split("T")[0])
  const [statementNumber, setStatementNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [extraFields, setExtraFields] = useState<Record<string, string | number>>({})
  const [extraFieldErrors, setExtraFieldErrors] = useState<Record<string, string | undefined>>({})
  const statementTypeRef = useRef<HTMLDivElement>(null)

  // Filters
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(null)
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterStatementTypeId, setFilterStatementTypeId] = useState<number | undefined>(undefined)
  const [filterNumber, setFilterNumber] = useState("")
  const debouncedFilterEmployeeId = useDebounce(filterEmployee?.id ?? null, 300)
  const debouncedFilterNumber = useDebounce(filterNumber, 300)

  const { data, isLoading, error, refetch } = useStatements({
    page: 1,
    per_page: 1000,
    number: debouncedFilterNumber || undefined,
    date_from: filterDateFrom || undefined,
    date_to: filterDateTo || undefined,
    employee_id: debouncedFilterEmployeeId ?? undefined,
    statement_type_id: filterStatementTypeId,
  })

  const { data: statementTypes = [] } = useStatementTypes(true)
  const createDraftMutation = useCreateStatementDraft()
  const deleteMutation = useDeleteStatement()
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const selectedStatementType = statementTypes.find(t => t.id === selectedStatementTypeId) ?? null

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterEmployee) count++
    if (filterDateFrom) count++
    if (filterDateTo) count++
    if (filterStatementTypeId) count++
    if (filterNumber) count++
    return count
  }, [filterEmployee, filterDateFrom, filterDateTo, filterStatementTypeId, filterNumber])

  const clearFilters = () => {
    setFilterEmployee(null)
    setFilterDateFrom("")
    setFilterDateTo("")
    setFilterStatementTypeId(undefined)
    setFilterNumber("")
  }

  const resetForm = () => {
    setSelectedEmployee(null)
    setSelectedStatementTypeId(null)
    setStatementTypeSearch("")
    setStatementDate(new Date().toISOString().split("T")[0])
    setStatementNumber("")
    setErrors({})
    setExtraFields({})
    setExtraFieldErrors({})
  }

  // Reset extra fields when type changes
  useEffect(() => {
    setExtraFields({})
    setExtraFieldErrors({})
  }, [selectedStatementTypeId])

  // Auto-fill contract fields when employee is selected for contract_expiry
  useAutoFillFields(
    selectedEmployee,
    selectedStatementType?.code,
    extraFields,
    setExtraFields,
  )

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statementTypeRef.current && !statementTypeRef.current.contains(e.target as Node)) {
        setStatementTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredTypes = statementTypes.filter((t) =>
    t.name.toLowerCase().includes(statementTypeSearch.toLowerCase())
  )

  const selectType = (type: StatementType) => {
    setSelectedStatementTypeId(type.id)
    setStatementTypeSearch(type.name)
    setStatementTypeOpen(false)
  }

  const clearType = () => {
    setSelectedStatementTypeId(null)
    setStatementTypeSearch("")
  }

  const handleTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && filteredTypes.length > 0 && statementTypeOpen) {
      e.preventDefault()
      selectType(filteredTypes[0])
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!statementDate) newErrors.date = "Укажите дату"
    if (!statementNumber) newErrors.number = "Укажите номер"

    // Validate required extra fields
    for (const field of selectedStatementType?.field_schema ?? []) {
      if (field.required && !extraFields[field.key]) {
        newErrors[`extra_${field.key}`] = `${field.label} обязательно`
      }
    }

    setErrors(newErrors)
    setExtraFieldErrors(newErrors as Record<string, string | undefined>)
    return Object.keys(newErrors).length === 0
  }

  const handleCreate = () => {
    if (!validate()) return
    const editorWindowName = `hrms-statement-editor-${Date.now()}`
    const editorWindow = window.open("about:blank", editorWindowName)
    if (editorWindow) {
      try {
        editorWindow.document.title = "Подготовка редактора"
        editorWindow.document.body.innerHTML = `
          <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
            <div style="text-align:center;">
              <div style="width:28px;height:28px;border:3px solid #cbd5e1;border-top-color:#0ea5e9;border-radius:50%;margin:0 auto 12px;animation:spin 0.9s linear infinite;"></div>
              <div style="font-size:16px;font-weight:600;">Подготавливаем документ...</div>
              <div style="font-size:13px;color:#475569;margin-top:6px;">Окно автоматически откроет редактор заявления</div>
            </div>
          </div>
          <style>
            @keyframes spin { to { transform: rotate(360deg); } }
            html, body { margin: 0; }
          </style>
        `
      } catch (e) {
        console.warn("[StatementsSection] failed to render editor placeholder", e)
      }
    }
    const cleanedExtraFields = Object.fromEntries(
      Object.entries(extraFields).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined
      )
    )
    const payload: StatementCreate = {
      title: `Заявление ${selectedStatementType?.name || ""} ${statementNumber}`,
      number: statementNumber || undefined,
      date: statementDate,
      employee_id: selectedEmployee?.id ?? null,
      statement_type_id: selectedStatementTypeId,
      extra_fields: Object.keys(cleanedExtraFields).length > 0 ? cleanedExtraFields : undefined,
    }
    createDraftMutation.mutate(payload, {
      onSuccess: (draft) => {
        const url = `/statements/${draft.statement_id}/edit-docx`
        if (editorWindow && !editorWindow.closed) {
          window.open(url, editorWindowName)
        } else {
          window.open(url, "_blank", "noopener,noreferrer")
        }
        resetForm()
      },
      onError: (err) => {
        console.error("[StatementsSection] draft creation failed", err)
        editorWindow?.close()
      },
    })
  }

  const handleDelete = () => {
    if (deleteId) deleteMutation.mutate(deleteId, { onSuccess: () => refetch() })
    setDeleteId(null)
  }

  useEffect(() => {
    const handleSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; statementId?: number }
      if (message.type === "hrms:statement-save") {
        refetch()
      }
    }
    window.addEventListener("message", handleSave)
    return () => window.removeEventListener("message", handleSave)
  }, [refetch])

  return (
    <div className="space-y-4">
      {/* Create form */}
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
          <h2 className="text-lg font-semibold">Создать заявление</h2>
        </div>

        {!collapsed && (
          <div className="border-t px-4 py-4">
            <div className="flex flex-col lg:flex-row">
              {/* Left column — Основные данные */}
              <div className="space-y-4 lg:w-[400px] lg:shrink-0 lg:pr-6 lg:border-r">
                <div>
                  <label className="text-sm font-medium">Сотрудник</label>
                  <div className="mt-1">
                    <EmployeeSearch
                      value={selectedEmployee}
                      onChange={setSelectedEmployee}
                      placeholder="Выберите сотрудника"
                      label=" "
                      width="w-96"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-[130px]">
                    <DatePicker
                      label="Дата заявления"
                      value={statementDate}
                      onChange={setStatementDate}
                      required
                    />
                    {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                  </div>

                  <DocumentNumberField
                    value={statementNumber}
                    onChange={setStatementNumber}
                    useNextNumber={useNextStatementNumber}
                    useRecentItems={() => useStatements({ page: 1, per_page: 100 })}
                    label="Номер заявления"
                    emptyListLabel="Заявлений пока нет"
                    popoverTitle="Последние заявления"
                    required
                    error={errors.number}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={(e) => { e.stopPropagation(); resetForm(); }} disabled={createDraftMutation.isPending}>
                    Очистить
                  </Button>
                  <Button onClick={(e) => { e.stopPropagation(); handleCreate(); }} disabled={createDraftMutation.isPending}>
                    {createDraftMutation.isPending ? "Подготовка..." : "Создать заявление"}
                  </Button>
                </div>
              </div>

              {/* Right column — Детали */}
              <div className="space-y-4 flex-1 min-w-0 max-w-[600px] lg:pl-6">
                {/* Type selector */}
                <div ref={statementTypeRef} className="w-[350px]">
                  <label className="text-sm font-medium">Тип заявления</label>
                  <div className="mt-1 relative">
                    {selectedStatementType ? (
                      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 h-10">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm flex-1 truncate">{selectedStatementType.name}</span>
                        <button
                          type="button"
                          onClick={clearType}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <Input
                        placeholder="Выберите тип..."
                        value={statementTypeSearch}
                        onChange={(e) => {
                          setStatementTypeSearch(e.target.value)
                          setStatementTypeOpen(true)
                        }}
                        onKeyDown={handleTypeKeyDown}
                        onFocus={() => setStatementTypeOpen(true)}
                        className="h-10"
                      />
                    )}
                    {statementTypeOpen && filteredTypes.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                        {filteredTypes.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                            onClick={() => selectType(t)}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dynamic extra fields from layout config */}
                {selectedStatementType && (() => {
                  const layout = getStatementTypeLayout(selectedStatementType.code)
                  if (!layout || layout.groups.length === 0) return null

                  return (
                    <div className="space-y-4">
                      {layout.groups.map((group, idx) => (
                        <FieldGroup key={`${selectedStatementType.code}-group-${idx}`} title={group.title}>
                          <div className="flex gap-2 items-end flex-wrap">
                            {group.fields.map((field) => (
                              <div key={field.key} className="flex flex-col min-w-0">
                                <FieldRenderer
                                  field={field as any}
                                  value={extraFields[field.key]}
                                  error={extraFieldErrors[`extra_${field.key}`]}
                                  onChange={(key, value) => setExtraFields((prev) => ({ ...prev, [key]: value }))}
                                  extraFields={extraFields}
                                />
                              </div>
                            ))}
                          </div>
                        </FieldGroup>
                      ))}

                      {layout.standaloneFields?.map((field) => (
                        <div key={field.key} className="pl-2 -mt-2">
                          <FieldRenderer
                            field={field as any}
                            value={extraFields[field.key]}
                            error={extraFieldErrors[`extra_${field.key}`]}
                            onChange={(key, value) => setExtraFields((prev) => ({ ...prev, [key]: value }))}
                            extraFields={extraFields}
                          />
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="border rounded-lg bg-card">
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={() => setFilterCollapsed(!filterCollapsed)}
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Фильтры</h2>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">{activeFilterCount}</Badge>
            )}
          </div>
          {filterCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {!filterCollapsed && (
          <div className="border-t px-4 py-4 space-y-4">
            {/* Row 1: Employee, Statement type, Number */}
            <div className="flex flex-wrap gap-6 items-end">
              <div className="w-[280px]">
                <label className="text-sm font-medium">Сотрудник</label>
                <div className="mt-1">
                  <EmployeeSearch
                    value={filterEmployee}
                    onChange={(v) => { setFilterEmployee(v); }}
                    placeholder="Выберите сотрудника"
                    label=" "
                    width="w-full"
                  />
                </div>
              </div>

              <div className="w-[220px]">
                <label className="text-sm font-medium">Тип заявления</label>
                <Select
                  value={filterStatementTypeId?.toString() || "all"}
                  onValueChange={(v) => setFilterStatementTypeId(v === "all" ? undefined : Number(v))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Все типы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    {statementTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-[160px]">
                <label className="text-sm font-medium">Номер</label>
                <Input
                  className="mt-1"
                  placeholder="Поиск по номеру"
                  value={filterNumber}
                  onChange={(e) => setFilterNumber(e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: Date range */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-[130px]">
                <DatePicker label="Дата с" value={filterDateFrom} onChange={setFilterDateFrom} />
              </div>
              <div className="w-[130px]">
                <DatePicker label="Дата по" value={filterDateTo} onChange={setFilterDateTo} />
              </div>
            </div>

            {/* Row 3: Clear button */}
            <Button variant="outline" size="sm" onClick={clearFilters} className="ml-auto">Сбросить фильтры</Button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {(error as Error).message || "Ошибка загрузки данных"}
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <EmptyState
          message="Заявления не найдены"
          description="Создайте первое заявление или измените фильтры"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Дата создания</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-sm">{item.number || "—"}</TableCell>
                <TableCell>{item.statement_type_name || "—"}</TableCell>
                <TableCell>{item.employee_name || "—"}</TableCell>
                <TableCell>
                  {item.date ? (() => {
                    const d = new Date(item.date)
                    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
                  })() : "—"}
                </TableCell>
                <TableCell>
                  {item.created_at ? (() => {
                    const d = new Date(item.created_at)
                    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
                  })() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Просмотр" onClick={() => openStatementView(item.id)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Редактировать" onClick={() => openStatementEdit(item.id)}><FilePen className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Печать" onClick={() => openStatementPrint(item.id)}><Printer className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Скачать" onClick={() => downloadStatementDocx(item.id)}><Download className="h-4 w-4" /></Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Удалить"
                      onClick={() => setDeleteId(item.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Delete dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить заявление?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
