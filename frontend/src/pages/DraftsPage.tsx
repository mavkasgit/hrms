import { Fragment, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ClipboardPaste, Eye, FilePen, Loader2, Trash2 } from "lucide-react"
import { useAllDrafts, useDeleteAllDraft, fillFormFromDraft } from "@/entities/draft"
import type { AllDraftItem } from "@/entities/draft"
import { openDraftEditorWindow } from "@/entities/order/draftOrderSaveChannel"
import { DRAFT_SAVE_STATUS_LABEL, DRAFT_SAVE_STATUS_CLASS } from "@/entities/order/draftSaveStatus"
import { ORDER_TYPE_BADGE_COLORS } from "@/entities/order/orderTypeBadge"
import {
  SortableFilterHeader,
} from "@/shared/ui/sortable-filter-header"
import {
  useTableQueryEngine,
  type ColumnSortDef,
  type SortConfig,
} from "@/shared/hooks/useTableQueryEngine"
import { nextMultiSortConfigs } from "@/shared/lib/multiSort"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import { Button } from "@/shared/ui/button"
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
import { formatDate, formatDateTime } from "@/shared/utils/date"

const KIND_LABEL: Record<AllDraftItem["kind"], string> = {
  order: "Приказ",
  notification: "Уведомление",
  statement: "Заявление",
}

type SortField = "type_name" | "title" | "number" | "date" | "created_at" | "save_status"

export function DraftsPage() {
  const navigate = useNavigate()
  const { data: drafts, isLoading } = useAllDrafts()
  const deleteMutation = useDeleteAllDraft()
  const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null)
  const [fillingId, setFillingId] = useState<string | null>(null)
  const [sortConfigs, setSortConfigs] = useState<SortConfig<SortField>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<SortField, Set<string>>>({
    type_name: new Set(),
    title: new Set(),
    number: new Set(),
    date: new Set(),
    created_at: new Set(),
    save_status: new Set(),
  })

  const items = drafts ?? []

  const handleSort = (field: SortField) => {
    const defaultOrder =
      field === "number" || field === "date" || field === "created_at" ? "desc" : "asc"
    setSortConfigs((prev) => nextMultiSortConfigs(prev, field, defaultOrder))
  }

  const formatCreated = (d: AllDraftItem) => (d.created_at ? formatDateTime(d.created_at, false) : "—")
  const formatDocDate = (d: AllDraftItem) => (d.date ? formatDate(d.date) : "—")
  const saveStatusLabel = (d: AllDraftItem) =>
    d.save_status ? DRAFT_SAVE_STATUS_LABEL[d.save_status.state] : "—"

  const fieldValue = (field: SortField, d: AllDraftItem): string => {
    if (field === "type_name") return d.type_name ?? "—"
    if (field === "title") return d.title ?? "—"
    if (field === "number") return d.number ?? "—"
    if (field === "date") return formatDocDate(d)
    if (field === "created_at") return formatCreated(d)
    return saveStatusLabel(d)
  }

  const sortDefs: ColumnSortDef<AllDraftItem, SortField>[] = useMemo(
    () => [
      { field: "type_name", getSortValue: (d) => d.type_name ?? "" },
      {
        field: "title",
        getSortValue: (d) => {
          if (d.group_employees && d.group_employees.length > 0) {
            const names = d.group_employees.map((e) => e.employee_full_name).filter(Boolean)
            if (names.length > 0) {
              names.sort((a, b) => a.localeCompare(b, "ru"))
              return names[0]
            }
          }
          return d.title ?? ""
        },
      },
      { field: "number", getSortValue: (d) => d.number ?? "" },
      { field: "date", getSortValue: (d) => d.date ?? "" },
      { field: "created_at", getSortValue: (d) => d.created_at ?? "" },
      { field: "save_status", getSortValue: (d) => saveStatusLabel(d) },
    ],
    []
  )

  const localFilterPredicate = useMemo(() => {
    const hasFilters = Object.values(columnFilters).some((s) => s && s.size > 0)
    if (!hasFilters) return null
    return (d: AllDraftItem) => {
      for (const [field, selected] of Object.entries(columnFilters) as Array<
        [SortField, Set<string>]
      >) {
        if (!selected || selected.size === 0) continue
        if (field === "title" && d.group_employees && d.group_employees.length > 0) {
          const hasMatchingEmployee = d.group_employees.some((e) =>
            selected.has(e.employee_full_name)
          )
          if (!hasMatchingEmployee) return false
          continue
        }
        if (!selected.has(fieldValue(field, d))) return false
      }
      return true
    }
  }, [columnFilters])

  const engineResult = useTableQueryEngine({
    rows: items,
    getId: (d) => d.draft_id,
    searchQuery: "",
    filterPredicate: localFilterPredicate,
    sortConfigs,
    sortDefs,
  })
  const displayDrafts = engineResult.rows

  const uniqueValues = useMemo(() => {
    const employeeNames = new Set<string>()
    items.forEach((d) => {
      if (d.group_employees && d.group_employees.length > 0) {
        d.group_employees.forEach((e) => {
          if (e.employee_full_name) employeeNames.add(e.employee_full_name)
        })
      } else if (d.title) {
        employeeNames.add(d.title)
      }
    })
    return {
      type_name: [...new Set(items.map((d) => fieldValue("type_name", d)))].sort(),
      title: [...employeeNames].sort((a, b) => a.localeCompare(b, "ru")),
      number: [...new Set(items.map((d) => fieldValue("number", d)))].sort(),
      date: [...new Set(items.map((d) => fieldValue("date", d)))].sort(),
      created_at: [...new Set(items.map((d) => fieldValue("created_at", d)))].sort(),
      save_status: [...new Set(items.map((d) => fieldValue("save_status", d)))].sort(),
    }
  }, [items])

  const setFilter = (field: SortField, selected: Set<string>) =>
    setColumnFilters((prev) => ({ ...prev, [field]: selected }))

  const getDisplayGroupEmployees = (draft: AllDraftItem) => {
    if (!draft.group_employees) return []
    const selectedNames = columnFilters.title
    if (!selectedNames || selectedNames.size === 0) return draft.group_employees
    return draft.group_employees.filter((e) => selectedNames.has(e.employee_full_name))
  }

  const handleFill = async (draft: AllDraftItem) => {
    if (fillingId) return
    setFillingId(draft.draft_id)
    try {
      await fillFormFromDraft(draft.draft_id, navigate)
    } finally {
      setFillingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Черновики</h1>
        <p className="text-sm text-muted-foreground">
          {items.length > 0
            ? `Всего: ${items.length} — приказы, уведомления и заявления`
            : "Сохранённые, но не закоммиченные документы: приказы, уведомления и заявления"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : displayDrafts.length === 0 ? (
        <EmptyState
          message="Черновиков нет"
          description="Создайте приказ, уведомление или заявление — они появятся здесь как черновики"
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableFilterHeader
                    field="number"
                    label="№"
                    currentSorts={sortConfigs}
                    onSortChange={handleSort}
                    values={uniqueValues.number}
                    selectedValues={columnFilters.number}
                    onFilterChange={setFilter}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="type_name"
                    label="Тип"
                    currentSorts={sortConfigs}
                    onSortChange={handleSort}
                    values={uniqueValues.type_name}
                    selectedValues={columnFilters.type_name}
                    onFilterChange={setFilter}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="title"
                    label="Сотрудник"
                    currentSorts={sortConfigs}
                    onSortChange={handleSort}
                    values={uniqueValues.title}
                    selectedValues={columnFilters.title}
                    onFilterChange={setFilter}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="date"
                    label="Дата"
                    currentSorts={sortConfigs}
                    onSortChange={handleSort}
                    values={uniqueValues.date}
                    selectedValues={columnFilters.date}
                    onFilterChange={setFilter}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="created_at"
                    label="Дата создания"
                    currentSorts={sortConfigs}
                    onSortChange={handleSort}
                    values={uniqueValues.created_at}
                    selectedValues={columnFilters.created_at}
                    onFilterChange={setFilter}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="save_status"
                    label="Статус сохранения"
                    currentSorts={sortConfigs}
                    onSortChange={handleSort}
                    values={uniqueValues.save_status}
                    selectedValues={columnFilters.save_status}
                    onFilterChange={setFilter}
                  />
                </TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayDrafts.map((draft) => (
                <Fragment key={draft.draft_id}>
                  <TableRow>
                    <TableCell className="font-mono text-sm">{draft.number || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={ORDER_TYPE_BADGE_COLORS[draft.type_name || ""] || ""}
                      >
                        {draft.type_name || "—"}
                      </Badge>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {KIND_LABEL[draft.kind]}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{draft.title || "—"}</TableCell>
                    <TableCell>{formatDocDate(draft)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCreated(draft)}</TableCell>
                    <TableCell>
                      {draft.save_status ? (
                        <Badge
                          variant="outline"
                          className={DRAFT_SAVE_STATUS_CLASS[draft.save_status.state]}
                          title={
                            draft.save_status.state === "error" && draft.save_status.last_error
                              ? draft.save_status.last_error
                              : undefined
                          }
                        >
                          {DRAFT_SAVE_STATUS_LABEL[draft.save_status.state]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Заполнить форму данными черновика"
                          aria-label="Заполнить"
                          disabled={fillingId !== null}
                          onClick={() => void handleFill(draft)}
                        >
                          {fillingId === draft.draft_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ClipboardPaste className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Открыть документ только для чтения"
                          aria-label="Открыть"
                          onClick={() => openDraftEditorWindow(draft.view_url)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Восстановить — открыть в редакторе для доработки и сохранения"
                          aria-label="Восстановить"
                          onClick={() => openDraftEditorWindow(draft.edit_url)}
                        >
                          <FilePen className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Удалить черновик"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteDraftId(draft.draft_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {(() => {
                    const employees = getDisplayGroupEmployees(draft)
                    if (employees.length === 0) return null
                    return employees.map((emp) => (
                      <TableRow
                        key={emp.employee_id}
                        className="bg-muted/10 hover:bg-muted/20 border-t-0 h-8"
                      >
                        <TableCell className="pl-6 py-1 text-muted-foreground font-mono whitespace-nowrap">
                          ↳ {draft.number || "—"}
                        </TableCell>
                        <TableCell className="py-1" />
                        <TableCell className="py-1">
                          <div className="font-normal text-sm">{emp.employee_full_name}</div>
                        </TableCell>
                        <TableCell className="py-1" />
                        <TableCell className="py-1" />
                        <TableCell className="py-1" />
                        <TableCell className="py-1" />
                      </TableRow>
                    ))
                  })()}
                </Fragment>
              ))}
            </TableBody>
          </Table>

          <div className="text-sm text-muted-foreground px-2">
            Всего: {displayDrafts.length} из {items.length}
          </div>
        </>
      )}

      <AlertDialog
        open={deleteDraftId !== null}
        onOpenChange={(open) => !open && setDeleteDraftId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить черновик?</AlertDialogTitle>
            <AlertDialogDescription>
              Черновик будет удалён безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDraftId) deleteMutation.mutate(deleteDraftId)
                setDeleteDraftId(null)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
