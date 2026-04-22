import { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
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
  Briefcase, Plus, ChevronRight, ChevronDown, Users,
  ChevronsDown, ChevronsUp,
} from "lucide-react"
import { TagPicker } from "@/shared/ui/tag-picker"
import {
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
} from "@/entities/position"
import { useDepartmentGraph } from "@/entities/department"
import { positionApi } from "@/entities/position/api"
import { useTags } from "@/entities/tag"
import {
  useEmployees,
  useAssignTag,
  useUnassignTag,
} from "@/entities/employee/useEmployees"
import { EntityDialog, type EntityDialogField, renderIcon } from "./shared/EntityDialog"
import { SearchInput } from "./shared/SearchInput"
import { buildEmployeesByPosition } from "./positions-helpers"

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
  return (
    <div className={`flex items-center gap-2 py-1 px-2 text-sm rounded-md transition-colors ${
      highlight ? "bg-yellow-500/10" : "hover:bg-accent/30"
    } group/emp`}>
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
      <span className="truncate flex-1">{emp.name}</span>
      <TagPicker
        tags={allTags}
        assignedTags={emp.tags}
        onAssign={(tagId) => onAssignTag(emp.id, tagId)}
        onUnassign={(tagId) => onUnassignTag(emp.id, tagId)}
        align="end"
      />
      {emp.department && (
        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
          {emp.department}
        </Badge>
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

      </div>

      {/* Сотрудники */}
      {showEmployees && hasEmployees && (
        <div className="mt-1 mb-1 space-y-0.5" style={{ paddingLeft: "28px" }}>
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
  const { data: departmentGraph } = useDepartmentGraph()
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

  const tagsByEmployeeId = useMemo(() => {
    const map = new Map<number, { id: number; name: string; color?: string }[]>()
    departmentGraph?.nodes.forEach((node) => {
      node.employees.forEach((employee) => {
        map.set(employee.id, employee.tags)
      })
    })
    return map
  }, [departmentGraph])

  // Группируем по должностям
  const employeesByPosition = useMemo(() => {
    return buildEmployeesByPosition(employeesData?.items, tagsByEmployeeId)
  }, [employeesData, tagsByEmployeeId])

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

  // При поиске — раскрываем должности с совпадениями и поднимаем их вверх
  const visiblePositions = useMemo(() => {
    if (!searchQuery) return positions
    const q = searchQuery.toLowerCase()
    return [...positions].sort((a, b) => {
      const aEmps = employeesByPosition.get(a.id) ?? []
      const bEmps = employeesByPosition.get(b.id) ?? []
      const aMatch = aEmps.some((e) => e.name.toLowerCase().includes(q))
      const bMatch = bEmps.some((e) => e.name.toLowerCase().includes(q))
      return Number(bMatch) - Number(aMatch)
    })
  }, [positions, employeesByPosition, searchQuery])

  useEffect(() => {
    if (searchQuery && positions.length > 0) {
      const q = searchQuery.toLowerCase()
      const matched = positions.filter((p) => {
        const emps = employeesByPosition.get(p.id) ?? []
        return emps.some((e) => e.name.toLowerCase().includes(q))
      })
      setExpandedPositions((prev) => {
        const next = new Set(prev)
        matched.forEach((p) => next.add(p.id))
        return next
      })
    }
  }, [searchQuery, positions, employeesByPosition])

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
          {visiblePositions.map((pos) => (
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
