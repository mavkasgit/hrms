import { useState } from "react"
import { Check, Filter, Trash2, X } from "lucide-react"
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
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import {
  InlineMultiSelect,
  type InlineMultiSelectOption,
} from "@/shared/ui/inline-multi-select"
import { cn } from "@/shared/utils/cn"
import type { TimesheetFilter } from "./types"

export interface TimesheetFiltersMenuProps {
  departmentOptions: InlineMultiSelectOption[]
  tagOptions: InlineMultiSelectOption[]
  departments: Set<string>
  tags: Set<string>
  onDepartmentsChange: (next: Set<string>) => void
  onTagsChange: (next: Set<string>) => void
  onReset: () => void
  onSaveTemplate: (name: string, departments: string[], tags: string[]) => void
}

export function TimesheetFiltersMenu({
  departmentOptions,
  tagOptions,
  departments,
  tags,
  onDepartmentsChange,
  onTagsChange,
  onReset,
  onSaveTemplate,
}: TimesheetFiltersMenuProps) {
  const [open, setOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [draftName, setDraftName] = useState("")

  const activeCount = departments.size + tags.size
  const canSave = activeCount > 0 && draftName.trim().length > 0

  const handleSaveConfirm = () => {
    if (!canSave) return
    onSaveTemplate(draftName, Array.from(departments), Array.from(tags))
    setDraftName("")
    setIsSaving(false)
  }

  const handleSaveCancel = () => {
    setIsSaving(false)
    setDraftName("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setIsSaving(false)
          setDraftName("")
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-9",
            activeCount > 0 && "border-primary/50 bg-primary/5"
          )}
          data-testid="timesheet-filters-trigger"
        >
          <Filter className="h-4 w-4 mr-1.5" />
          Фильтры
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[10px] font-semibold">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[640px] p-0 bg-popover text-popover-foreground border shadow-md"
        align="center"
        side="bottom"
      >
        <div
          className="flex items-center justify-between px-3 py-2.5 border-b"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Фильтры</span>
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] font-semibold">
                {activeCount}
              </Badge>
            )}
          </div>
          {isSaving ? (
            <div className="flex items-center gap-1">
              <Input
                placeholder="Название шаблона..."
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSaveConfirm()
                  }
                  if (e.key === "Escape") {
                    e.preventDefault()
                    handleSaveCancel()
                  }
                }}
                className="h-6 w-40 text-[11px] px-1.5 focus-visible:ring-1 focus-visible:ring-offset-0"
                autoFocus
                maxLength={60}
                data-testid="timesheet-filters-name-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50 p-0"
                onClick={handleSaveConfirm}
                disabled={!canSave}
                title="Сохранить"
                data-testid="timesheet-filters-save-confirm"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground p-0"
                onClick={handleSaveCancel}
                title="Отмена"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 border-dashed text-[11px] px-2 flex items-center gap-1"
              onClick={() => {
                setIsSaving(true)
                setDraftName("")
              }}
              disabled={activeCount === 0}
              title={
                activeCount === 0
                  ? "Сначала выберите значения фильтров"
                  : "Сохранить текущий фильтр как шаблон"
              }
              data-testid="timesheet-filters-save-button"
            >
              Сохранить шаблон
            </Button>
          )}
        </div>

        <div
          className="grid grid-cols-2 gap-4 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <InlineMultiSelect
            label="Подразделения"
            options={departmentOptions}
            selected={departments}
            onChange={onDepartmentsChange}
            searchPlaceholder="Поиск подразделения..."
            testId="timesheet-filters-departments"
          />

          <InlineMultiSelect
            label="Теги"
            options={tagOptions}
            selected={tags}
            onChange={onTagsChange}
            searchPlaceholder="Поиск тега..."
            testId="timesheet-filters-tags"
          />
        </div>

        <div className="border-t px-3 py-2 flex items-center justify-end">
          {activeCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onReset}
              data-testid="timesheet-filters-reset"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Сбросить фильтры
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Фильтры не применены
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export interface TimesheetTemplateButtonsProps {
  filters: TimesheetFilter[]
  isFilterActive: (filter: TimesheetFilter) => boolean
  activeFilterId: string | null
  onApply: (filter: TimesheetFilter) => void
  onClear: () => void
  onDelete: (id: string) => void
  onSetActive: (id: string | null) => void
}

export function TimesheetTemplateButtons({
  filters,
  isFilterActive,
  onApply,
  onClear,
  onDelete,
  onSetActive,
}: TimesheetTemplateButtonsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  if (filters.length === 0) return null

  const handleBadgeClick = (filter: TimesheetFilter) => {
    if (isFilterActive(filter)) {
      onSetActive(null)
      onClear()
    } else {
      onApply(filter)
    }
  }

  const handleDeleteRequest = (id: string) => setPendingDeleteId(id)
  const handleDeleteConfirm = () => {
    if (pendingDeleteId) {
      onDelete(pendingDeleteId)
      setPendingDeleteId(null)
    }
  }

  return (
    <>
      {filters.map((filter) => {
        const active = isFilterActive(filter)
        const count = filter.departments.length + filter.tags.length
        return (
          <Button
            key={filter.id}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-9 flex items-center gap-1",
              !active && "border-dashed"
            )}
            onClick={() => handleBadgeClick(filter)}
            title={
              active
                ? `Шаблон «${filter.name}» применён — нажмите, чтобы сбросить`
                : `Применить шаблон «${filter.name}» (${count})`
            }
            data-testid="timesheet-filters-badge"
          >
            <span>{filter.name}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteRequest(filter.id)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDeleteRequest(filter.id)
                }
              }}
              className="ml-1 rounded-full p-0.5 hover:bg-black/10 cursor-pointer"
              aria-label={`Удалить шаблон «${filter.name}»`}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          </Button>
        )
      })}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон фильтров?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Вы действительно хотите удалить шаблон «${filters.find((f) => f.id === pendingDeleteId)?.name ?? ""}»? Это действие нельзя отменить.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
