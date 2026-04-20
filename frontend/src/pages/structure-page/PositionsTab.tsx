import { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
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
  Briefcase, Plus, ChevronRight, ChevronDown, Users,
  Pencil, Check, ChevronsDown, ChevronsUp,
} from "lucide-react"
import {
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
} from "@/entities/position"
import { positionApi } from "@/entities/position/api"
import { useTags } from "@/entities/tag"
import {
  useEmployees,
  useAssignTag,
  useUnassignTag,
} from "@/entities/employee/useEmployees"
import { EntityDialog, type EntityDialogField, renderIcon } from "./shared/EntityDialog"
import { SearchInput } from "./shared/SearchInput"

const POS_FIELDS: Record<string, EntityDialogField> = {
  name: { type: "text", label: "Название", required: true, placeholder: "Новая должность" },
  icon: { type: "icon", label: "Иконка" },
  color: { type: "color", label: "Цвет иконки" },
}

/* ───────── Строка сотрудника ───────── */

function EmployeeRowInline({
  emp,
  allTags,
  onAssignTag,
  onUnassignTag,
  highlight,
}: {
  emp: { id: number; name: string; department?: string; tags: { id: number; name: string; color?: string }[] }
  allTags: { id: number; name: string; color?: string }[]
  onAssignTag: (employeeId: number, tagId: number) => void
  onUnassignTag: (employeeId: number, tagId: number) => void
  highlight?: boolean
}) {
  const assignedIds = new Set(emp.tags.map((t) => t.id))
  const available = allTags.filter((t) => !assignedIds.has(t.id))

  return (
    <div className={`flex items-center gap-2 py-1 px-2 text-sm rounded-md transition-colors ${
      highlight ? "bg-yellow-500/10" : "hover:bg-accent/30"
    } group/emp`}>
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
      <span className="truncate flex-1">{emp.name}</span>
      {emp.department && (
        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
          {emp.department}
        </Badge>
      )}
      <div className="flex gap-0.5 flex-shrink-0">
        {emp.tags.map((t) => (
          <Badge
            key={t.id}
            variant="outline"
            className="text-[10px] h-4.5 px-1 cursor-pointer hover:bg-destructive/10 transition-colors"
            style={{ borderColor: t.color, color: t.color }}
            onClick={() => onUnassignTag(emp.id, t.id)}
            title="Убрать тег"
          >
            {t.name}
          </Badge>
        ))}
      </div>
      {available.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="opacity-0 group-hover/emp:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0">
              <Plus className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            {available.map((t) => (
              <button
                key={t.id}
                className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-accent"
                onClick={() => onAssignTag(emp.id, t.id)}
              >
                <div
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color || "#94a3b8" }}
                />
                {t.name}
                <Check className="h-3 w-3 ml-auto text-muted-foreground" />
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/* ───────── Узел дерева должностей ───────── */

function PositionTreeNode({
  position,
  employees,
  allTags,
  onEdit,
  onAssignTag,
  onUnassignTag,
  expandedPositions,
  setExpandedPositions,
  searchQuery,
}: {
  position: { id: number; name: string; color?: string; icon?: string; employee_count: number }
  employees: { id: number; name: string; department?: string; tags: { id: number; name: string; color?: string }[] }[]
  allTags: { id: number; name: string; color?: string }[]
  onEdit: (pos: { id: number; name: string; color?: string; icon?: string }) => void
  onAssignTag: (employeeId: number, tagId: number) => void
  onUnassignTag: (employeeId: number, tagId: number) => void
  expandedPositions: Set<number>
  setExpandedPositions: (fn: (prev: Set<number>) => Set<number>) => void
  searchQuery: string
}) {
  const isExpanded = expandedPositions.has(position.id)
  const toggleExpand = () => {
    setExpandedPositions((prev) => {
      const next = new Set(prev)
      if (next.has(position.id)) next.delete(position.id)
      else next.add(position.id)
      return next
    })
  }

  const filteredEmployees = searchQuery
    ? employees.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : employees
  const hasEmployees = filteredEmployees.length > 0
  const showEmployees = searchQuery ? hasEmployees : isExpanded

  return (
    <div>
      {/* Строка должности */}
      <div
        className="group/pos flex items-center gap-1.5 py-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
        style={{
          paddingLeft: "8px",
          backgroundColor: position.color ? position.color + "18" : undefined,
        }}
        onClick={() => onEdit({ id: position.id, name: position.name, color: position.color, icon: position.icon })}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (employees.length > 0) toggleExpand()
          }}
          className={`h-5 w-5 flex items-center justify-center text-muted-foreground rounded-sm transition-transform flex-shrink-0 ${
            employees.length > 0 ? "hover:bg-accent" : ""
          }`}
        >
          {employees.length > 0 ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="h-1.5 w-1.5 bg-muted-foreground/30 rounded-full" />
          )}
        </button>

        <span
          className="h-4 w-4 flex-shrink-0 text-muted-foreground"
          style={{ color: position.color ?? undefined }}
        >
          {position.icon
            ? renderIcon(position.icon) ?? <Briefcase className="h-4 w-4" />
            : <Briefcase className="h-4 w-4" />}
        </span>

        {employees.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleExpand()
            }}
            className={`flex items-center gap-0.5 text-xs rounded px-1 py-0.5 transition-colors flex-shrink-0 mr-1 ${
              showEmployees
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Users className="h-3 w-3" />
            {employees.length}
          </button>
        )}

        <span className="font-medium text-sm truncate flex-1 min-w-0">{position.name}</span>

        {employees.length === 0 && (
          <span className="text-[10px] text-muted-foreground/50 w-10 text-right flex-shrink-0">
            пусто
          </span>
        )}

        {searchQuery && filteredEmployees.length === 0 && employees.length > 0 && (
          <span className="text-[10px] text-muted-foreground/40 w-10 text-right flex-shrink-0">
            0 совп.
          </span>
        )}

        {/* Действия */}
        <div className="flex gap-0.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onEdit({ id: position.id, name: position.name, color: position.color, icon: position.icon })
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Сотрудники */}
      {showEmployees && hasEmployees && (
        <div className="mt-1 mb-1 space-y-0.5" style={{ paddingLeft: "28px" }}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">
            Сотрудники ({filteredEmployees.length}{searchQuery ? ` из ${employees.length}` : ""})
          </div>
          {filteredEmployees.map((emp) => {
            const isHighlighted = Boolean(searchQuery && emp.name.toLowerCase().includes(searchQuery.toLowerCase()))
            return (
              <EmployeeRowInline
                key={emp.id}
                emp={emp}
                allTags={allTags}
                onAssignTag={onAssignTag}
                onUnassignTag={onUnassignTag}
                highlight={isHighlighted}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ───────── PositionsTab ───────── */

export function PositionsTab() {
  const { data: positions = [], isLoading } = usePositions()
  const createPos = useCreatePosition()
  const updatePos = useUpdatePosition()
  const deletePos = useDeletePosition()
  const { data: allTags = [] } = useTags()
  const assignTag = useAssignTag()
  const unassignTag = useUnassignTag()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [posName, setPosName] = useState("")
  const [posIcon, setPosIcon] = useState("")
  const [posColor, setPosColor] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: number
    name: string
    employeeCount: number
  } | null>(null)

  // Поиск
  const [searchQuery, setSearchQuery] = useState("")

  // Раскрытые должности
  const [expandedPositions, setExpandedPositions] = useState<Set<number>>(new Set())

  // Загружаем сотрудников
  const { data: employeesData } = useEmployees({
    page: 1,
    per_page: 1000,
    status: "active",
  })

  // Группируем по должностям
  const employeesByPosition = useMemo(() => {
    const map = new Map<
      number,
      { id: number; name: string; department?: string; tags: { id: number; name: string; color?: string }[] }[]
    >()
    employeesData?.items.forEach((emp: { id: number; position_id: number; name: string; department?: { name: string }; tags?: { id: number }[] }) => {
      if (emp.position_id) {
        if (!map.has(emp.position_id)) map.set(emp.position_id, [])
        map.get(emp.position_id)!.push({
          id: emp.id,
          name: emp.name,
          department: emp.department?.name,
          tags: [],
        })
      }
    })
    return map
  }, [employeesData])

  // При загрузке — раскрыть все
  useEffect(() => {
    if (positions.length > 0) {
      setExpandedPositions(new Set(positions.map((p) => p.id)))
    }
  }, [positions])

  const expandAll = useCallback(() => {
    if (positions.length > 0) {
      setExpandedPositions(new Set(positions.map((p) => p.id)))
    }
  }, [positions])

  const collapseAll = useCallback(() => {
    setExpandedPositions(new Set())
  }, [])

  const allExpanded = expandedPositions.size === 0
  const toggleAll = useCallback(() => {
    if (allExpanded) {
      expandAll()
    } else {
      collapseAll()
    }
  }, [allExpanded, expandAll, collapseAll])

  const openAdd = () => {
    setEditingId(null)
    setPosName("")
    setPosIcon("")
    setPosColor("")
    setDialogOpen(true)
  }

  const openEdit = (pos: { id: number; name: string; color?: string; icon?: string }) => {
    setEditingId(pos.id)
    setPosName(pos.name)
    setPosIcon(pos.icon ?? "")
    setPosColor(pos.color ?? "")
    setDialogOpen(true)
  }

  const handleDeleteRequest = async () => {
    if (editingId !== null) {
      try {
        const usage = await positionApi.getUsage(editingId)
        setDeleteConfirm({
          id: editingId,
          name: posName,
          employeeCount: usage.employee_count,
        })
      } catch {
        setDeleteConfirm({
          id: editingId,
          name: posName,
          employeeCount: 0,
        })
      }
    }
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deletePos.mutate(deleteConfirm.id)
      setDeleteConfirm(null)
      setDialogOpen(false)
    }
  }

  const handleAssignTag = (employeeId: number, tagId: number) => {
    assignTag.mutate({ employeeId, tagId })
  }

  const handleUnassignTag = (employeeId: number, tagId: number) => {
    unassignTag.mutate({ employeeId, tagId })
  }

  // Подсчёт найденных
  const totalMatches = useMemo(() => {
    if (!searchQuery) return 0
    const q = searchQuery.toLowerCase()
    return employeesData?.items.filter((e) => e.name.toLowerCase().includes(q)).length ?? 0
  }, [searchQuery, employeesData])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Должности — раскрывайте для просмотра сотрудников
          </p>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Должность
          </Button>
        </div>

        {/* Поиск + раскрыть/скрыть */}
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <SearchInput value={searchQuery} onChange={setSearchQuery} />
          </div>
          {searchQuery && totalMatches > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {totalMatches} совп.
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs flex-shrink-0 min-w-[100px]"
            onClick={toggleAll}
          >
            {allExpanded ? (
              <><ChevronsDown className="h-3.5 w-3.5 mr-1" />Раскрыть</>
            ) : (
              <><ChevronsUp className="h-3.5 w-3.5 mr-1" />Скрыть</>
            )}
          </Button>
        </div>
      </div>

      {/* Дерево должностей */}
      {positions.length === 0 ? (
        <EmptyState message="Нет должностей" description="Добавьте первую должность" />
      ) : (
        <div className="border rounded-lg p-2 bg-card">
          {positions.map((pos) => (
            <PositionTreeNode
              key={pos.id}
              position={pos}
              employees={employeesByPosition.get(pos.id) ?? []}
              allTags={allTags}
              onEdit={openEdit}
              onAssignTag={handleAssignTag}
              onUnassignTag={handleUnassignTag}
              expandedPositions={expandedPositions}
              setExpandedPositions={setExpandedPositions}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}

      {/* Dialog */}
      <EntityDialog
        fields={POS_FIELDS}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editingId ? "edit" : "add"}
        initialValues={{ name: posName, icon: posIcon, color: posColor }}
        onSave={(v) => {
          if (editingId) {
            updatePos.mutate({
              id: editingId,
              data: {
                name: String(v.name).trim(),
                icon: v.icon ? String(v.icon) : undefined,
                color: v.color ? String(v.color) : undefined,
              },
            })
          } else {
            createPos.mutate({
              name: String(v.name).trim(),
              icon: v.icon ? String(v.icon) : undefined,
              color: v.color ? String(v.color) : undefined,
            })
          }
          setDialogOpen(false)
        }}
        addTitle="Добавить должность"
        editTitle="Редактировать должность"
        addDescription="Создайте новую должность"
        editDescription="Измените название"
        addLabel="Создать"
        saveLabel="Сохранить"
        onDelete={handleDeleteRequest}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить должность?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteConfirm?.name}</span> будет удалена.
              {deleteConfirm && deleteConfirm.employeeCount > 0 && (
                <div className="mt-2 text-sm">
                  Сотрудников с этой должностью: <strong>{deleteConfirm.employeeCount}</strong>.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
