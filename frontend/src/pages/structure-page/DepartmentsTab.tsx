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
  Building2, Plus, ChevronRight, ChevronDown, Users,
  ChevronsDown, ChevronsUp,
} from "lucide-react"
import { TagPicker } from "@/shared/ui/tag-picker"
import {
  useDepartmentGraph,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  type GraphNode,
  type GraphEdge,
} from "@/entities/department"
import { departmentApi } from "@/entities/department/api"
import { useTags } from "@/entities/tag"
import { useAssignDepartmentTag, useUnassignDepartmentTag } from "@/entities/department"
import { useAssignTag, useUnassignTag } from "@/entities/employee/useEmployees"
import { EntityDialog, type EntityDialogField, renderIcon } from "./shared/EntityDialog"
import { SearchInput } from "./shared/SearchInput"
import { createTagAssignmentHandlers } from "./tag-assignment"

const DEPT_FIELDS: Record<string, EntityDialogField> = {
  name: { type: "text", label: "Название", required: true, placeholder: "Новый отдел", testId: "name-input" },
  shortName: { type: "text", label: "Краткое", placeholder: "Краткое", rowGroup: "meta" },
  priority: { type: "number", label: "Приоритет", min: 1, rowGroup: "meta" },
  icon: { type: "icon", label: "Иконка" },
  color: { type: "color", label: "Цвет иконки" },
}

/* ───────── Утилиты графа ───────── */

function getRootNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const childIds = new Set(edges.map((e) => e.child_id))
  return nodes.filter((n) => !childIds.has(n.id))
}

function getChildEdges(headId: number, edges: GraphEdge[]): GraphEdge[] {
  return edges.filter((e) => e.head_id === headId)
}

function getNodeById(id: number, nodesMap: Map<number, GraphNode>): GraphNode | null {
  return nodesMap.get(id) ?? null
}

function filterEmployees(
  employees: { id: number; name: string; position_name?: string; tags: { id: number; name: string; color?: string }[] }[],
  query: string
) {
  if (!query) return employees
  const q = query.toLowerCase()
  return employees.filter((e) => e.name.toLowerCase().includes(q))
}

/* ───────── Строка сотрудника ───────── */

function EmployeeRow({
  emp,
  allTags,
  onAssignTag,
  onUnassignTag,
  highlight,
}: {
  emp: { id: number; name: string; position_name?: string; tags: { id: number; name: string; color?: string }[] }
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
      {emp.position_name && (
        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
          {emp.position_name}
        </Badge>
      )}
    </div>
  )
}

/* ───────── Узел дерева отделов ───────── */

function DepartmentTreeNode({
  node,
  depth = 0,
  nodesMap,
  edges,
  allTags,
  onAddChild,
  onEdit,
  onAssignDepartmentTag,
  onUnassignDepartmentTag,
  onAssignEmployeeTag,
  onUnassignEmployeeTag,
  expandedNodes,
  setExpandedNodes,
  searchQuery,
}: {
  node: GraphNode
  depth?: number
  nodesMap: Map<number, GraphNode>
  edges: GraphEdge[]
  allTags: { id: number; name: string; color?: string }[]
  onAddChild: (parentId: number) => void
  onEdit: (node: GraphNode) => void
  onAssignDepartmentTag: (deptId: number, tagId: number) => void
  onUnassignDepartmentTag: (deptId: number, tagId: number) => void
  onAssignEmployeeTag: (employeeId: number, tagId: number) => void
  onUnassignEmployeeTag: (employeeId: number, tagId: number) => void
  expandedNodes: Set<number>
  setExpandedNodes: (fn: (prev: Set<number>) => Set<number>) => void
  searchQuery: string
}) {
  const isExpanded = expandedNodes.has(node.id)
  const toggleExpand = () => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })
  }

  const verticalEdges = getChildEdges(node.id, edges).filter(
    (e) => e.relation_type === "vertical"
  )
  const hasChildren = verticalEdges.length > 0
  const filteredEmployees = filterEmployees(node.employees, searchQuery)
  const hasEmployees = filteredEmployees.length > 0

  // При поиске автоматически раскрываем узлы с совпадениями
  const showEmployees = searchQuery ? hasEmployees : isExpanded

  return (
    <div>
      {/* Строка отдела */}
      <div
        className="group/dept flex items-center gap-1.5 py-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer flex-wrap"
        style={{
          paddingLeft: `${depth * 20 + 8}px`,
          backgroundColor: node.color ? node.color + "18" : undefined,
        }}
        onClick={() => onEdit(node)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) toggleExpand()
            else if (node.employees.length > 0) toggleExpand()
          }}
          className={`h-5 w-5 flex items-center justify-center text-muted-foreground rounded-sm transition-transform flex-shrink-0 ${
            hasChildren || node.employees.length > 0 ? "hover:bg-accent" : ""
          }`}
        >
          {hasChildren || node.employees.length > 0 ? (
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
          style={{ color: node.color ?? undefined }}
        >
          {node.icon
            ? renderIcon(node.icon) ?? <Building2 className="h-4 w-4" />
            : <Building2 className="h-4 w-4" />}
        </span>

        {node.employees.length > 0 && (
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
            {node.employee_count}
          </button>
        )}

        <span className="font-medium text-sm truncate flex-1 min-w-0">{node.name}</span>

        <span onClick={(e) => e.stopPropagation()}>
          <TagPicker
            tags={allTags}
            assignedTags={node.tags}
            onAssign={(tagId) => onAssignDepartmentTag(node.id, tagId)}
            onUnassign={(tagId) => onUnassignDepartmentTag(node.id, tagId)}
            align="start"
          />
        </span>

        {!hasEmployees && node.employees.length === 0 && (
          <span className="text-[10px] text-muted-foreground/50 w-10 text-right flex-shrink-0">
            пусто
          </span>
        )}

        {/* Подсказка при поиске */}
        {searchQuery && filteredEmployees.length === 0 && node.employees.length > 0 && (
          <span className="text-[10px] text-muted-foreground/40 w-10 text-right flex-shrink-0">
            0 совп.
          </span>
        )}

        <div className="flex gap-0.5 flex-shrink-0 mr-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onAddChild(node.id)
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Подразделение
          </Button>
        </div>
      </div>

      {/* Раскрытые дочерние отделы */}
      {isExpanded &&
        verticalEdges.map((e) => {
          const child = getNodeById(e.child_id, nodesMap)
          if (!child) return null
          return (
            <DepartmentTreeNode
              key={e.child_id}
              node={child}
              depth={depth + 1}
              nodesMap={nodesMap}
              edges={edges}
              allTags={allTags}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onAssignDepartmentTag={onAssignDepartmentTag}
              onUnassignDepartmentTag={onUnassignDepartmentTag}
              onAssignEmployeeTag={onAssignEmployeeTag}
              onUnassignEmployeeTag={onUnassignEmployeeTag}
              expandedNodes={expandedNodes}
              setExpandedNodes={setExpandedNodes}
              searchQuery={searchQuery}
            />
          )
        })}

      {/* Сотрудники */}
      {showEmployees && hasEmployees && (
        <div className="mt-1 mb-1 space-y-0.5" style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">
            Сотрудники ({filteredEmployees.length}{searchQuery ? ` из ${node.employees.length}` : ""})
          </div>
          {filteredEmployees.map((emp) => {
            const isHighlighted = Boolean(searchQuery && emp.name.toLowerCase().includes(searchQuery.toLowerCase()))
            return (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                allTags={allTags}
                onAssignTag={onAssignEmployeeTag}
                onUnassignTag={onUnassignEmployeeTag}
                highlight={isHighlighted}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ───────── DepartmentsTab (дерево) ───────── */

export function DepartmentsTab() {
  const { data: graph, isLoading } = useDepartmentGraph()
  const createDept = useCreateDepartment()
  const updateDept = useUpdateDepartment()
  const deleteDept = useDeleteDepartment()
  const assignTag = useAssignDepartmentTag()
  const unassignTag = useUnassignDepartmentTag()
  const assignEmployeeTag = useAssignTag()
  const unassignEmployeeTag = useUnassignTag()
  const { data: allTags = [] } = useTags()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [parentId, setParentId] = useState<number | null>(null)
  const [editingDept, setEditingDept] = useState<GraphNode | null>(null)
  const [deptName, setDeptName] = useState("")
  const [deptShortName, setDeptShortName] = useState("")
  const [deptPriority, setDeptPriority] = useState(1)
  const [deptIcon, setDeptIcon] = useState("")
  const [deptColor, setDeptColor] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: number
    name: string
    employeeCount: number
    linksCount: number
    tagsCount: number
  } | null>(null)

  // Поиск
  const [searchQuery, setSearchQuery] = useState("")

  // Раскрытые узлы
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(() => {
    // По умолчанию все раскрыты
    return new Set<number>()
  })

  // Инициализируем expandedNodes при загрузке графа
  const nodesMap = useMemo(() => {
    const m = new Map<number, GraphNode>()
    graph?.nodes.forEach((n) => m.set(n.id, n))
    return m
  }, [graph?.nodes])

  const rootNodes = useMemo(() => {
    if (!graph) return []
    return getRootNodes(graph.nodes, graph.edges)
  }, [graph])

  // При загрузке графа — раскрываем все узлы
  useEffect(() => {
    if (graph) {
      setExpandedNodes(new Set(graph.nodes.map((n) => n.id)))
    }
  }, [graph])

  // Раскрыть / скрыть всё
  const expandAll = useCallback(() => {
    if (graph) {
      setExpandedNodes(new Set(graph.nodes.map((n) => n.id)))
    }
  }, [graph])

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  const allExpanded = expandedNodes.size === 0
  const toggleAll = useCallback(() => {
    if (allExpanded) {
      expandAll()
    } else {
      collapseAll()
    }
  }, [allExpanded, expandAll, collapseAll])

  const openAdd = (parentId?: number) => {
    setDialogMode("add")
    setParentId(parentId ?? null)
    setDeptName("")
    setDeptShortName("")
    setDeptPriority(1)
    setDeptColor("")
    setDialogOpen(true)
  }

  const openEdit = (node: GraphNode) => {
    setDialogMode("edit")
    setEditingDept(node)
    setDeptName(node.name)
    setDeptShortName(node.short_name ?? "")
    setDeptPriority(node.rank)
    setDeptIcon(node.icon ?? "")
    setDeptColor(node.color ?? "")
    setDialogOpen(true)
  }

  const handleDeleteRequest = async () => {
    if (editingDept) {
      try {
        const usage = await departmentApi.getUsage(editingDept.id)
        setDeleteConfirm({
          id: editingDept.id,
          name: editingDept.name,
          employeeCount: usage.employee_count,
          linksCount: usage.links_count,
          tagsCount: usage.tags_count,
        })
      } catch {
        setDeleteConfirm({
          id: editingDept.id,
          name: editingDept.name,
          employeeCount: 0,
          linksCount: 0,
          tagsCount: 0,
        })
      }
    }
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deleteDept.mutate(deleteConfirm.id)
      setDeleteConfirm(null)
      setDialogOpen(false)
    }
  }

  const handleAssignDepartmentTag = (deptId: number, tagId: number) => {
    assignTag.mutate({ deptId, data: { tag_id: tagId } })
  }

  const handleUnassignDepartmentTag = (deptId: number, tagId: number) => {
    unassignTag.mutate({ deptId, tagId })
  }

  const handleAssignEmployeeTag = (employeeId: number, tagId: number) => {
    assignEmployeeTag.mutate({ employeeId, tagId })
  }

  const handleUnassignEmployeeTag = (employeeId: number, tagId: number) => {
    unassignEmployeeTag.mutate({ employeeId, tagId })
  }

  const tagHandlers = createTagAssignmentHandlers({
    assignDepartmentTag: handleAssignDepartmentTag,
    unassignDepartmentTag: handleUnassignDepartmentTag,
    assignEmployeeTag: handleAssignEmployeeTag,
    unassignEmployeeTag: handleUnassignEmployeeTag,
  })

  // Подсчёт найденных сотрудников
  const totalMatches = useMemo(() => {
    if (!searchQuery || !graph) return 0
    const q = searchQuery.toLowerCase()
    return graph.nodes.reduce((sum, node) => {
      return sum + node.employees.filter((e) => e.name.toLowerCase().includes(q)).length
    }, 0)
  }, [searchQuery, graph])

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
            Структура подразделений
          </p>
          <Button size="sm" variant="outline" onClick={() => openAdd()}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Подразделение
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

      {/* Дерево */}
      {!graph || graph.nodes.length === 0 ? (
        <EmptyState message="Нет подразделений" description="Добавьте первое подразделение" />
      ) : (
        <div className="border rounded-lg p-2 bg-card">
          {rootNodes.map((node) => (
            <DepartmentTreeNode
              key={node.id}
              node={node}
              nodesMap={nodesMap}
              edges={graph.edges}
              allTags={allTags}
              onAddChild={(id) => openAdd(id)}
              onEdit={openEdit}
              onAssignDepartmentTag={tagHandlers.department.assign}
              onUnassignDepartmentTag={tagHandlers.department.unassign}
              onAssignEmployeeTag={tagHandlers.employee.assign}
              onUnassignEmployeeTag={tagHandlers.employee.unassign}
              expandedNodes={expandedNodes}
              setExpandedNodes={setExpandedNodes}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}

      {/* Dialog add/edit */}
      <EntityDialog
        fields={DEPT_FIELDS}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialValues={{
          name: deptName,
          shortName: deptShortName,
          priority: deptPriority,
          icon: deptIcon,
          color: deptColor,
        }}
        onSave={(v) => {
          if (dialogMode === "add") {
            createDept.mutate({
              name: String(v.name).trim(),
              short_name: v.shortName ? String(v.shortName).trim() : undefined,
              icon: v.icon ? String(v.icon) : undefined,
              color: v.color ? String(v.color) : undefined,
              rank: Number(v.priority) || 1,
            })
          } else if (editingDept) {
            updateDept.mutate({
              id: editingDept.id,
              data: {
                name: String(v.name).trim(),
                short_name: v.shortName ? String(v.shortName).trim() : undefined,
                icon: v.icon ? String(v.icon) : undefined,
                color: v.color ? String(v.color) : undefined,
                rank: Number(v.priority),
              },
            })
          }
          setDialogOpen(false)
        }}
        addTitle="Добавить подразделение"
        editTitle="Редактировать подразделение"
        addDescription={parentId ? "Дочернее подразделение (vertical связь)" : "Корневой узел"}
        editDescription="Измените название и параметры"
        addLabel="Создать"
        saveLabel="Сохранить"
        onDelete={handleDeleteRequest}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подразделение?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteConfirm?.name}</span> будет удалено.
              {deleteConfirm && (deleteConfirm.employeeCount > 0 || deleteConfirm.linksCount > 0 || deleteConfirm.tagsCount > 0) && (
                <div className="mt-2 text-sm">
                  {deleteConfirm.employeeCount > 0 && (
                    <span>Сотрудников: <strong>{deleteConfirm.employeeCount}</strong></span>
                  )}
                  {deleteConfirm.linksCount > 0 && (
                    <span>{deleteConfirm.employeeCount > 0 ? ", " : ""}Связей: <strong>{deleteConfirm.linksCount}</strong></span>
                  )}
                  {deleteConfirm.tagsCount > 0 && (
                    <span>{deleteConfirm.employeeCount > 0 || deleteConfirm.linksCount > 0 ? ", " : ""}Тегов: <strong>{deleteConfirm.tagsCount}</strong></span>
                  )}
                  .
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
