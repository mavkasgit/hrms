import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Download, Eye, Trash2, FilePen, Filter, X, Check, Printer } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue"
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
import { FieldGroup, FieldRenderer, useAutoFillFields, type FieldSchema } from "@/features/dynamic-form"
import { revalidateEmployeeAndType, useDraftRecoveryFor, useFillDraftIdRestore } from "@/entities/form-draft"
import type { DraftFormData } from "@/entities/draft"
import type { Employee } from "@/entities/employee/types"
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query"

/** Минимальная строка списка документов, которую рендерит таблица. */
export interface DocumentListItem {
  id: number
  number: string | null
  date: string
  employee_name: string | null
  created_at: string | null
}

/** Параметры списка документов (единый вид для обеих сущностей). */
export interface DocumentListFilters {
  page: number
  per_page: number
  number?: string
  date_from?: string
  date_to?: string
  employee_id?: number
  typeId?: number
}

/** Канонические значения формы документа (сотрудник + тип + дата/номер + extra). */
export interface DocumentFormValues {
  employee_id: number | null
  type_id: number | null
  date: string
  number: string
  extra_fields: Record<string, string | number>
}

/** Входные данные для создания черновика документа. */
export interface DocumentCreateValues {
  title: string
  number?: string
  date: string
  employeeId: number | null
  typeId: number | null
  extraFields?: Record<string, string | number>
}

/** Структурный минимум layout-а типа документа. */
export interface DocumentTypeLayout {
  groups: { title?: string; fields: FieldSchema[] }[]
  standaloneFields?: FieldSchema[]
}

/** Минимальный тип документа (id/name/code/is_active/field_schema). */
export interface DocumentTypeShape {
  id: number
  code: string
  name: string
  is_active: boolean
  field_schema: { key: string; label: string; required: boolean }[]
}

/**
 * Конфиг сущности раздела создания документов (#77). Единственное место,
 * где секция знает про конкретную сущность: API-хуки, лейблы, маршруты,
 * kind-мапперы и адаптер черновика формы.
 */
export interface DocumentSectionConfig<TItem, TType, TCreate, TCreateDraft, TDraft extends { saved_at: string }> {
  /** Ключ сущности (kind серверного черновика): notification | statement. */
  kind: "notification" | "statement"
  /** Слот черновика формы (реестр slots.ts). */
  slot: string
  /** Маршрут «Заполнить поля» (?fillDraftId=). */
  fillDraftRoute: string
  /** Тип сообщения сохранения из редактора OnlyOffice. */
  saveMessageType: string
  /** Префикс имени окна редактора. */
  editorWindowPrefix: string

  labels: {
    createHeading: string
    createButton: string
    dateLabel: string
    numberLabel: string
    typeLabel: string
    emptyListMessage: string
    emptyListDescription: string
    emptyListLabel: string
    popoverTitle: string
    deleteTitle: string
    editorNote: string
    titlePrefix: string
  }

  useList: (filters: DocumentListFilters) => UseQueryResult<{ items: TItem[] }>
  useTypes: (activeOnly: boolean) => UseQueryResult<TType[]>
  useCreateDraft: () => UseMutationResult<TCreateDraft, unknown, TCreate>
  useDelete: () => UseMutationResult<unknown, unknown, number>
  useNextNumber: () => { data?: string }
  useRecentItems: () => { data?: { items: { id: number; number: string | null; date: string; employee_name: string | null }[] } }

  openView: (id: number) => void
  openEdit: (id: number) => void
  openPrint: (id: number) => void
  downloadDocx: (id: number) => void
  getTypeLayout: (code: string) => DocumentTypeLayout | undefined
  typeNameOf: (item: TItem) => string | null
  editDraftUrl: (draft: TCreateDraft) => string
  buildCreatePayload: (values: DocumentCreateValues) => TCreate

  mapFillDraft: (data: DraftFormData) => TDraft | null
  draft: {
    hasContent: (state: Omit<TDraft, "saved_at">) => boolean
    fromValues: (values: DocumentFormValues) => Omit<TDraft, "saved_at">
    toValues: (draft: TDraft) => DocumentFormValues
  }
}

/** Форматирование даты в DD.MM.YYYY для ячеек таблицы. */
function formatTableDate(date: string | null): string {
  if (!date) return "—"
  const d = new Date(date)
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
}

/** HTML-заглушка окна подготовки редактора (#77 общая для обоих видов). */
function editorPlaceholderHtml(editorNote: string): string {
  return `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
      <div style="text-align:center;">
        <div style="width:28px;height:28px;border:3px solid #cbd5e1;border-top-color:#0ea5e9;border-radius:50%;margin:0 auto 12px;animation:spin 0.9s linear infinite;"></div>
        <div style="font-size:16px;font-weight:600;">Подготавливаем документ...</div>
        <div style="font-size:13px;color:#475569;margin-top:6px;">Окно автоматически откроет редактор ${editorNote}</div>
      </div>
    </div>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      html, body { margin: 0; }
    </style>
  `
}

/** Collapsible-заголовок карточки (форма создания / фильтры) — общий для обоих блоков. */
function CollapsibleHeader({
  collapsed,
  onToggle,
  title,
  trailing,
  icon,
}: {
  collapsed: boolean
  onToggle: () => void
  title: React.ReactNode
  trailing?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
      onClick={onToggle}
    >
      {icon}
      {collapsed ? (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      )}
      {title}
      {trailing}
    </div>
  )
}

/**
 * Параметризованный раздел создания документов (уведомление / заявление) (#77).
 * Вся логика общая: форма создания, фильтры, таблица, восстановление черновика,
 * диалог удаления. Отличается только конфиг сущности.
 */
export function DocumentSection<TItem extends DocumentListItem, TType extends DocumentTypeShape, TCreate, TCreateDraft, TDraft extends { saved_at: string }>({
  config,
}: {
  config: DocumentSectionConfig<TItem, TType, TCreate, TCreateDraft, TDraft>
}) {
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [filterCollapsed, setFilterCollapsed] = useState(true)

  // Creation form state
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [typeSearch, setTypeSearch] = useState("")
  const [typeOpen, setTypeOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [number, setNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [extraFields, setExtraFields] = useState<Record<string, string | number>>({})
  const [extraFieldErrors, setExtraFieldErrors] = useState<Record<string, string | undefined>>({})
  const typeRef = useRef<HTMLDivElement>(null)

  // Filters
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(null)
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterTypeId, setFilterTypeId] = useState<number | undefined>(undefined)
  const [filterNumber, setFilterNumber] = useState("")
  const debouncedFilterEmployeeId = useDebouncedValue(filterEmployee?.id ?? null, 300)
  const debouncedFilterNumber = useDebouncedValue(filterNumber, 300)

  const { data, isLoading, error, refetch } = config.useList({
    page: 1,
    per_page: 1000,
    number: debouncedFilterNumber || undefined,
    date_from: filterDateFrom || undefined,
    date_to: filterDateTo || undefined,
    employee_id: debouncedFilterEmployeeId ?? undefined,
    typeId: filterTypeId,
  })

  const { data: types = [] } = config.useTypes(true)
  const createDraftMutation = config.useCreateDraft()
  const deleteMutation = config.useDelete()
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const selectedType = types.find((t) => t.id === selectedTypeId) ?? null

  // Восстановление несохранённого заполнения формы (#28)
  const recoveryFormState = useMemo(
    () =>
      config.draft.fromValues({
        employee_id: selectedEmployee?.id ?? null,
        type_id: selectedTypeId,
        date,
        number,
        extra_fields: extraFields,
      }),
    [config, selectedEmployee, selectedTypeId, date, number, extraFields],
  )

  const handleRestore = useCallback((draft: TDraft): boolean => {
    const values = config.draft.toValues(draft)
    // Возврат: изменился ли тип документа (его смена сбрасывает extra_fields —
    // хост-сброс после восстановления должен быть пропущен один раз).
    const typeChanged = revalidateEmployeeAndType({
      queryClient,
      employeeId: values.employee_id,
      typeId: values.type_id,
      types,
      selectedTypeId,
      setEmployee: setSelectedEmployee,
      setTypeId: setSelectedTypeId,
      setTypeSearch,
      extraFields: values.extra_fields,
      setExtraFields,
    })
    if (values.date) setDate(values.date)
    if (values.number) setNumber(values.number)
    return typeChanged
  }, [config, queryClient, types, selectedTypeId])

  const {
    clear: recoveryClear,
    restoreWith: recoveryRestoreWith,
    restoreGuardRef,
    overwriteDialog: recoveryOverwriteDialog,
  } = useDraftRecoveryFor<TDraft>({
    slot: config.slot,
    formState: recoveryFormState,
    hasContent: config.draft.hasContent,
    onRestore: handleRestore,
  })

  // «Заполнить поля» из попапа черновиков: ?fillDraftId=…
  useFillDraftIdRestore(recoveryRestoreWith, config.mapFillDraft, config.fillDraftRoute)

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterEmployee) count++
    if (filterDateFrom) count++
    if (filterDateTo) count++
    if (filterTypeId) count++
    if (filterNumber) count++
    return count
  }, [filterEmployee, filterDateFrom, filterDateTo, filterTypeId, filterNumber])

  const clearFilters = () => {
    setFilterEmployee(null)
    setFilterDateFrom("")
    setFilterDateTo("")
    setFilterTypeId(undefined)
    setFilterNumber("")
  }

  const resetForm = () => {
    setSelectedEmployee(null)
    setSelectedTypeId(null)
    setTypeSearch("")
    setDate(new Date().toISOString().split("T")[0])
    setNumber("")
    setErrors({})
    setExtraFields({})
    setExtraFieldErrors({})
    // Очищаем сохранённый черновик формы (#28) — форма сброшена
    recoveryClear()
  }

  // Reset extra fields when type changes
  useEffect(() => {
    // При восстановлении черновика поля уже восстановлены из черновика — сброс пропускаем один раз
    if (restoreGuardRef.current) {
      restoreGuardRef.current = false
      return
    }
    setExtraFields({})
    setExtraFieldErrors({})
  }, [selectedTypeId])

  // Auto-fill contract fields when employee is selected
  useAutoFillFields(selectedEmployee, selectedType?.code, extraFields, setExtraFields)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) {
        setTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredTypes = types.filter((t) =>
    t.name.toLowerCase().includes(typeSearch.toLowerCase())
  )

  const selectType = (type: TType) => {
    setSelectedTypeId(type.id)
    setTypeSearch(type.name)
    setTypeOpen(false)
  }

  const clearType = () => {
    setSelectedTypeId(null)
    setTypeSearch("")
  }

  const handleTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && filteredTypes.length > 0 && typeOpen) {
      e.preventDefault()
      selectType(filteredTypes[0])
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!date) newErrors.date = "Укажите дату"
    if (!number) newErrors.number = "Укажите номер"

    // Validate required extra fields
    for (const field of selectedType?.field_schema ?? []) {
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
    const editorWindowName = `${config.editorWindowPrefix}${Date.now()}`
    const editorWindow = window.open("about:blank", editorWindowName)
    if (editorWindow) {
      try {
        editorWindow.document.title = "Подготовка редактора"
        editorWindow.document.body.innerHTML = editorPlaceholderHtml(config.labels.editorNote)
      } catch (e) {
        console.warn(`[${config.kind}] failed to render editor placeholder`, e)
      }
    }
    const cleanedExtraFields = Object.fromEntries(
      Object.entries(extraFields).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined
      )
    )
    const payload = config.buildCreatePayload({
      title: `${config.labels.titlePrefix} ${selectedType?.name || ""} ${number}`,
      number: number || undefined,
      date,
      employeeId: selectedEmployee?.id ?? null,
      typeId: selectedTypeId,
      extraFields: Object.keys(cleanedExtraFields).length > 0 ? cleanedExtraFields : undefined,
    })
    createDraftMutation.mutate(payload, {
      onSuccess: (draft) => {
        const url = config.editDraftUrl(draft)
        if (editorWindow && !editorWindow.closed) {
          window.open(url, editorWindowName)
        } else {
          window.open(url, "_blank", "noopener,noreferrer")
        }
        resetForm()
      },
      onError: (err) => {
        console.error(`[${config.kind}] draft creation failed`, err)
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
      const message = event.data as { type?: string }
      if (message.type === config.saveMessageType) {
        refetch()
      }
    }
    window.addEventListener("message", handleSave)
    return () => window.removeEventListener("message", handleSave)
  }, [refetch, config.saveMessageType])

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="border rounded-lg bg-card">
        <CollapsibleHeader
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          title={<h2 className="text-lg font-semibold">{config.labels.createHeading}</h2>}
        />

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
                      label={config.labels.dateLabel}
                      value={date}
                      onChange={setDate}
                      required
                    />
                    {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                  </div>

                  <DocumentNumberField
                    value={number}
                    onChange={setNumber}
                    useNextNumber={config.useNextNumber}
                    useRecentItems={config.useRecentItems}
                    label={config.labels.numberLabel}
                    emptyListLabel={config.labels.emptyListLabel}
                    popoverTitle={config.labels.popoverTitle}
                    required
                    error={errors.number}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={(e) => { e.stopPropagation(); resetForm(); }} disabled={createDraftMutation.isPending}>
                    Очистить
                  </Button>
                  <Button onClick={(e) => { e.stopPropagation(); handleCreate(); }} disabled={createDraftMutation.isPending}>
                    {createDraftMutation.isPending ? "Подготовка..." : config.labels.createButton}
                  </Button>
                </div>
              </div>

              {/* Right column — Детали */}
              <div className="space-y-4 flex-1 min-w-0 max-w-[600px] lg:pl-6">
                {/* Type selector */}
                <div ref={typeRef} className="w-[350px]">
                  <label className="text-sm font-medium">{config.labels.typeLabel}</label>
                  <div className="mt-1 relative">
                    {selectedType ? (
                      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 h-10">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm flex-1 truncate">{selectedType.name}</span>
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
                        value={typeSearch}
                        onChange={(e) => {
                          setTypeSearch(e.target.value)
                          setTypeOpen(true)
                        }}
                        onKeyDown={handleTypeKeyDown}
                        onFocus={() => setTypeOpen(true)}
                        className="h-10"
                      />
                    )}
                    {typeOpen && filteredTypes.length > 0 && (
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
                {selectedType && (() => {
                  const layout = config.getTypeLayout(selectedType.code)
                  if (!layout || layout.groups.length === 0) return null

                  return (
                    <div className="space-y-4">
                      {layout.groups.map((group, idx) => (
                        <FieldGroup key={`${selectedType.code}-group-${idx}`} title={group.title}>
                          <div className="flex gap-2 items-end flex-wrap">
                            {group.fields.map((field) => (
                              <div key={field.key} className="flex flex-col min-w-0">
                                <FieldRenderer
                                  field={field}
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
                            field={field}
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
        <CollapsibleHeader
          collapsed={filterCollapsed}
          onToggle={() => setFilterCollapsed(!filterCollapsed)}
          icon={<Filter className="h-4 w-4 text-muted-foreground" />}
          title={<h2 className="text-sm font-medium">Фильтры</h2>}
          trailing={
            activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">{activeFilterCount}</Badge>
            )
          }
        />

        {!filterCollapsed && (
          <div className="border-t px-4 py-4 space-y-4">
            {/* Row 1: Employee, Type, Number */}
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
                <label className="text-sm font-medium">{config.labels.typeLabel}</label>
                <Select
                  value={filterTypeId?.toString() || "all"}
                  onValueChange={(v) => setFilterTypeId(v === "all" ? undefined : Number(v))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Все типы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    {types.map((t) => (
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
          message={config.labels.emptyListMessage}
          description={config.labels.emptyListDescription}
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
                <TableCell>{config.typeNameOf(item) || "—"}</TableCell>
                <TableCell>{item.employee_name || "—"}</TableCell>
                <TableCell>{formatTableDate(item.date)}</TableCell>
                <TableCell>{formatTableDate(item.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Просмотр" onClick={() => config.openView(item.id)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Редактировать" onClick={() => config.openEdit(item.id)}><FilePen className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Печать" onClick={() => config.openPrint(item.id)}><Printer className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Скачать" onClick={() => config.downloadDocx(item.id)}><Download className="h-4 w-4" /></Button>
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
            <AlertDialogTitle>{config.labels.deleteTitle}</AlertDialogTitle>
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

      {/* Подтверждение перезаписи сохранённого заполнения (#28) */}
      {recoveryOverwriteDialog}
    </div>
  )
}
