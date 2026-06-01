import { useState, useEffect, useRef, useMemo } from "react"
import { ChevronDown, ChevronRight, Download, Eye, Trash2, FilePen, Filter, X, Check, Printer } from "lucide-react"
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
import { DynamicField, type FieldSchema } from "@/shared/ui/dynamic-field"
import type { Employee } from "@/entities/employee/types"
import type { NotificationType } from "@/entities/notification/types"
import {
  useNotifications,
  useCreateNotificationDraft,
  useDeleteNotification,
  useNotificationTypes,
  useNextNotificationNumber,
} from "@/entities/notification/hooks"
import { openNotificationView, openNotificationEdit, openNotificationPrint, downloadNotificationDocx } from "@/entities/notification/api"
import type { NotificationCreate } from "@/entities/notification/types"
import { NotificationContractExtensionFields } from "@/features/dynamic-form"

import { buildEmployeePlaceholders } from "@/features/dynamic-form/autoFillConfig"

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

export function NotificationsSection() {
  const [collapsed, setCollapsed] = useState(false)
  const [filterCollapsed, setFilterCollapsed] = useState(true)

  // Creation form state
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedNotificationTypeId, setSelectedNotificationTypeId] = useState<number | null>(null)
  const [notificationTypeSearch, setNotificationTypeSearch] = useState("")
  const [notificationTypeOpen, setNotificationTypeOpen] = useState(false)
  const [notificationDate, setNotificationDate] = useState(new Date().toISOString().split("T")[0])
  const [notificationNumber, setNotificationNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [extraFields, setExtraFields] = useState<Record<string, string | number>>({})
  const [extraFieldErrors, setExtraFieldErrors] = useState<Record<string, string | undefined>>({})
  const notificationTypeRef = useRef<HTMLDivElement>(null)

  // Filters
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(null)
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterNotificationTypeId, setFilterNotificationTypeId] = useState<number | undefined>(undefined)
  const [filterNumber, setFilterNumber] = useState("")
  const debouncedFilterEmployeeId = useDebounce(filterEmployee?.id ?? null, 300)
  const debouncedFilterNumber = useDebounce(filterNumber, 300)

  const { data, isLoading, error, refetch } = useNotifications({
    page: 1,
    per_page: 1000,
    number: debouncedFilterNumber || undefined,
    date_from: filterDateFrom || undefined,
    date_to: filterDateTo || undefined,
    employee_id: debouncedFilterEmployeeId ?? undefined,
    notification_type_id: filterNotificationTypeId,
  })

  const { data: notificationTypes = [] } = useNotificationTypes(true)
  const createDraftMutation = useCreateNotificationDraft()
  const deleteMutation = useDeleteNotification()
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const selectedNotificationType = notificationTypes.find(t => t.id === selectedNotificationTypeId) ?? null

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterEmployee) count++
    if (filterDateFrom) count++
    if (filterDateTo) count++
    if (filterNotificationTypeId) count++
    if (filterNumber) count++
    return count
  }, [filterEmployee, filterDateFrom, filterDateTo, filterNotificationTypeId, filterNumber])

  const clearFilters = () => {
    setFilterEmployee(null)
    setFilterDateFrom("")
    setFilterDateTo("")
    setFilterNotificationTypeId(undefined)
    setFilterNumber("")
  }

  const resetForm = () => {
    setSelectedEmployee(null)
    setSelectedNotificationTypeId(null)
    setNotificationTypeSearch("")
    setNotificationDate(new Date().toISOString().split("T")[0])
    setNotificationNumber("")
    setErrors({})
    setExtraFields({})
    setExtraFieldErrors({})
  }

  // Reset extra fields when type changes
  useEffect(() => {
    setExtraFields({})
    setExtraFieldErrors({})
  }, [selectedNotificationTypeId])

  // Auto-fill fields when employee is selected
  useEffect(() => {
    if (selectedEmployee) {
      const autoFilled = buildEmployeePlaceholders(selectedEmployee)
      setExtraFields((prev) => {
        const merged = { ...prev }
        for (const [key, value] of Object.entries(autoFilled)) {
          if (!merged[key]) {
            merged[key] = value
          }
        }
        return merged
      })
    }
  }, [selectedEmployee])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationTypeRef.current && !notificationTypeRef.current.contains(e.target as Node)) {
        setNotificationTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredTypes = notificationTypes.filter((t) =>
    t.name.toLowerCase().includes(notificationTypeSearch.toLowerCase())
  )

  const selectType = (type: NotificationType) => {
    setSelectedNotificationTypeId(type.id)
    setNotificationTypeSearch(type.name)
    setNotificationTypeOpen(false)
  }

  const clearType = () => {
    setSelectedNotificationTypeId(null)
    setNotificationTypeSearch("")
  }

  const handleTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && filteredTypes.length > 0 && notificationTypeOpen) {
      e.preventDefault()
      selectType(filteredTypes[0])
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!notificationDate) newErrors.date = "Укажите дату"
    if (!notificationNumber) newErrors.number = "Укажите номер"

    for (const field of selectedNotificationType?.field_schema ?? []) {
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
    const editorWindowName = `hrms-notification-editor-${Date.now()}`
    const editorWindow = window.open("about:blank", editorWindowName)
    if (editorWindow) {
      try {
        editorWindow.document.title = "Подготовка редактора"
        editorWindow.document.body.innerHTML = `
          <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
            <div style="text-align:center;">
              <div style="width:28px;height:28px;border:3px solid #cbd5e1;border-top-color:#0ea5e9;border-radius:50%;margin:0 auto 12px;animation:spin 0.9s linear infinite;"></div>
              <div style="font-size:16px;font-weight:600;">Подготавливаем документ...</div>
              <div style="font-size:13px;color:#475569;margin-top:6px;">Окно автоматически откроет редактор уведомления</div>
            </div>
          </div>
          <style>
            @keyframes spin { to { transform: rotate(360deg); } }
            html, body { margin: 0; }
          </style>
        `
      } catch (e) {
        console.warn("[NotificationsSection] failed to render editor placeholder", e)
      }
    }
    const cleanedExtraFields = Object.fromEntries(
      Object.entries(extraFields).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined
      )
    )
    const payload: NotificationCreate = {
      title: `Уведомление ${selectedNotificationType?.name || ""} ${notificationNumber}`,
      number: notificationNumber || undefined,
      date: notificationDate,
      employee_id: selectedEmployee?.id ?? null,
      notification_type_id: selectedNotificationTypeId,
      extra_fields: Object.keys(cleanedExtraFields).length > 0 ? cleanedExtraFields : undefined,
    }
    createDraftMutation.mutate(payload, {
      onSuccess: (draft) => {
        console.log("[NotificationsSection] draft created:", draft)
        const url = `/notifications/${draft.notification_id}/edit-docx`
        console.log("[NotificationsSection] redirecting to:", url)
        if (editorWindow && !editorWindow.closed) {
          window.open(url, editorWindowName)
        } else {
          console.log("[NotificationsSection] window closed, opening new one")
          window.open(url, "_blank", "noopener,noreferrer")
        }
        resetForm()
      },
      onError: (err) => {
        console.error("[NotificationsSection] draft creation failed:", err)
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
      const message = event.data as { type?: string; notificationId?: number }
      if (message.type === "hrms:notification-save") {
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
          <h2 className="text-lg font-semibold">Создать уведомление</h2>
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
                      label="Дата уведомления"
                      value={notificationDate}
                      onChange={setNotificationDate}
                      required
                    />
                    {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                  </div>

                  <DocumentNumberField
                    value={notificationNumber}
                    onChange={setNotificationNumber}
                    useNextNumber={useNextNotificationNumber}
                    useRecentItems={() => useNotifications({ page: 1, per_page: 100 })}
                    label="Номер уведомления"
                    emptyListLabel="Уведомлений пока нет"
                    popoverTitle="Последние уведомления"
                    required
                    error={errors.number}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={(e) => { e.stopPropagation(); resetForm(); }} disabled={createDraftMutation.isPending}>
                    Очистить
                  </Button>
                  <Button onClick={(e) => { e.stopPropagation(); handleCreate(); }} disabled={createDraftMutation.isPending}>
                    {createDraftMutation.isPending ? "Подготовка..." : "Создать уведомление"}
                  </Button>
                </div>
              </div>

              {/* Right column — Детали */}
              <div className="space-y-4 flex-1 min-w-0 lg:max-w-[600px] lg:pl-6">
                {/* Type selector */}
                <div ref={notificationTypeRef} className="w-60">
                  <label className="text-sm font-medium">Тип уведомления</label>
                  <div className="mt-1 relative">
                    {selectedNotificationType ? (
                      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 h-10">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm flex-1 truncate">{selectedNotificationType.name}</span>
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
                        value={notificationTypeSearch}
                        onChange={(e) => {
                          setNotificationTypeSearch(e.target.value)
                          setNotificationTypeOpen(true)
                        }}
                        onKeyDown={handleTypeKeyDown}
                        onFocus={() => setNotificationTypeOpen(true)}
                        className="h-10"
                      />
                    )}
                    {notificationTypeOpen && filteredTypes.length > 0 && (
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

                {/* Dynamic extra fields from field_schema — grid-driven rendering */}
                {selectedNotificationType && Array.isArray(selectedNotificationType.field_schema) && selectedNotificationType.field_schema.length > 0 && (
                  <div className="space-y-3">
                    {(() => {
                      // For contract_extension and new_contract, use the custom layout; otherwise use grid
                      if (selectedNotificationType.code === "contract_extension" || selectedNotificationType.code === "new_contract") {
                        return (
                          <NotificationContractExtensionFields
                            extraFields={extraFields}
                            extraFieldErrors={extraFieldErrors}
                            onFieldChange={(key, value) => setExtraFields((prev) => ({ ...prev, [key]: value }))}
                          />
                        )
                      }

                      // Grid-driven rendering: filter enabled, group by row, sort by col
                      const enabledFields = selectedNotificationType.field_schema.filter(f => f.enabled !== false)
                      const rowMap = new Map<number, typeof enabledFields>()
                      for (const field of enabledFields) {
                        const r = field.row ?? 0
                        if (!rowMap.has(r)) rowMap.set(r, [])
                        rowMap.get(r)!.push(field)
                      }
                      for (const [, rowFields] of rowMap) {
                        rowFields.sort((a, b) => (a.col ?? 0) - (b.col ?? 0))
                      }

                      return Array.from(rowMap.entries()).map(([rowNum, rowFields]) => (
                        <div key={rowNum} className="flex gap-4 flex-wrap items-end">
                          {rowFields.map((field) => (
                            <DynamicField
                              key={field.key}
                              field={field as FieldSchema}
                              value={extraFields[field.key]}
                              error={extraFieldErrors[`extra_${field.key}`]}
                              onChange={(key, value) => setExtraFields((prev) => ({ ...prev, [key]: value }))}
                            />
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                )}
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
            {/* Row 1: Employee, Notification type, Number */}
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
                <label className="text-sm font-medium">Тип уведомления</label>
                <Select
                  value={filterNotificationTypeId?.toString() || "all"}
                  onValueChange={(v) => setFilterNotificationTypeId(v === "all" ? undefined : Number(v))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Все типы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    {notificationTypes.map((t) => (
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
          message="Уведомления не найдены"
          description="Создайте первое уведомление или измените фильтры"
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
                <TableCell>{item.notification_type_name || "—"}</TableCell>
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
                    <Button variant="ghost" size="icon" title="Просмотр" onClick={() => openNotificationView(item.id)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Редактировать" onClick={() => openNotificationEdit(item.id)}><FilePen className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Печать" onClick={() => openNotificationPrint(item.id)}><Printer className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Скачать" onClick={() => downloadNotificationDocx(item.id)}><Download className="h-4 w-4" /></Button>
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
            <AlertDialogTitle>Удалить уведомление?</AlertDialogTitle>
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
