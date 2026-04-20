import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
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
import { Plus, Tag as TagIcon } from "lucide-react"
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  type Tag,
} from "@/entities/tag"
import { EntityDialog, type EntityDialogField } from "./shared/EntityDialog"

const TAG_FIELDS: Record<string, EntityDialogField> = {
  name: { type: "text", label: "Название", required: true, placeholder: "Новый тег" },
  category: { type: "text", label: "Категория", placeholder: "Новая категория", rowGroup: "meta" },
  color: { type: "color", label: "Цвет", rowGroup: "meta" },
}

import axios from "axios"

const API_URL = import.meta.env.VITE_API_URL || "/api"

/* ───────── Группировка ───────── */

function groupByCategory(tags: Tag[]): Record<string, Tag[]> {
  const groups: Record<string, Tag[]> = {}
  tags.forEach((tag) => {
    const cat = tag.category || "Без категории"
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(tag)
  })
  return groups
}

/* ───────── Карточка тега ───────── */

function TagChip({
  tag,
  onEdit,
}: {
  tag: Tag
  onEdit: (tag: Tag) => void
}) {
  const color = tag.color ?? "#94a3b8"

  return (
    <div
      className="group/tag flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
      style={{ borderColor: color + "60", backgroundColor: color + "08" }}
      onClick={() => onEdit(tag)}
    >
      <div
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-sm truncate flex-1 min-w-0">{tag.name}</span>
      {tag.employee_count !== undefined && tag.employee_count > 0 && (
        <Badge variant="secondary" className="text-[10px] h-4 px-1 flex-shrink-0">
          {tag.employee_count}
        </Badge>
      )}
    </div>
  )
}

/* ───────── Stats ───────── */

function TagStats({ tags }: { tags: Tag[] }) {
  const total = tags.length
  const categories = new Set(tags.map((t) => t.category || "Без категории")).size
  const totalEmployees = new Set(
    tags.filter((t) => t.employee_count && t.employee_count > 0).map((t) => t.id)
  ).size

  if (total === 0) return null

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-muted/40 rounded-md p-2 text-center">
        <div className="text-lg font-semibold">{total}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Тегов</div>
      </div>
      <div className="bg-muted/40 rounded-md p-2 text-center">
        <div className="text-lg font-semibold">{categories}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Категорий</div>
      </div>
      <div className="bg-muted/40 rounded-md p-2 text-center">
        <div className="text-lg font-semibold">{totalEmployees}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">С привязкой</div>
      </div>
    </div>
  )
}

/* ───────── TagsPanel ───────── */

export function TagsPanel() {
  const { data: tags = [], isLoading } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [tagName, setTagName] = useState("")
  const [tagCategory, setTagCategory] = useState("")
  const [tagColor, setTagColor] = useState("")

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: number
    name: string
    employeeCount: number
    departmentCount: number
  } | null>(null)

  const openAdd = () => {
    setDialogMode("add")
    setEditingTag(null)
    setTagName("")
    setTagCategory("")
    setTagColor("")
    setDialogOpen(true)
  }

  const openEdit = (tag: Tag) => {
    setDialogMode("edit")
    setEditingTag(tag)
    setTagName(tag.name)
    setTagCategory(tag.category ?? "")
    setTagColor(tag.color ?? "")
    setDialogOpen(true)
  }

  const handleDeleteRequest = async () => {
    if (editingTag) {
      try {
        const { data } = await axios.get(`${API_URL}/tags/${editingTag.id}/usage`)
        setDeleteConfirm({
          id: editingTag.id,
          name: editingTag.name,
          employeeCount: data.employee_count,
          departmentCount: data.department_count,
        })
      } catch {
        setDeleteConfirm({
          id: editingTag.id,
          name: editingTag.name,
          employeeCount: 0,
          departmentCount: 0,
        })
      }
    }
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deleteTag.mutate(deleteConfirm.id)
      setDeleteConfirm(null)
      setDialogOpen(false)
    }
  }

  const categories = groupByCategory(tags)
  const hasMultipleCategories = Object.keys(categories).length > 1

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">Теги</h3>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openAdd}>
          <Plus className="h-3 w-3 mr-1" />
          Добавить
        </Button>
      </div>

      <div className="flex-1 overflow-auto space-y-4 px-1 pb-4">
        {/* Статистика */}
        <TagStats tags={tags} />

        {/* Список тегов по категориям */}
        {tags.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground italic">Нет тегов</p>
          </div>
        ) : (
          Object.entries(categories).map(([cat, catTags]) => (
            <div key={cat}>
              {hasMultipleCategories && (
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
                  {cat}
                </h4>
              )}
              <div className="flex flex-wrap gap-1.5">
                {catTags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dialog */}
      <EntityDialog
        fields={TAG_FIELDS}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialValues={{
          name: tagName,
          category: tagCategory,
          color: tagColor,
        }}
        onSave={(v) => {
          const data = {
            name: String(v.name).trim(),
            category: v.category ? String(v.category).trim() || undefined : undefined,
            color: v.color ? String(v.color) : undefined,
          }
          if (dialogMode === "edit" && editingTag) {
            updateTag.mutate({ id: editingTag.id, data })
          } else {
            createTag.mutate(data)
          }
          setDialogOpen(false)
        }}
        addTitle="Новый тег"
        editTitle="Редактировать тег"
        addDescription="Создайте тег для группировки"
        editDescription="Измените название, категорию и цвет"
        addLabel="Создать"
        saveLabel="Сохранить"
        onDelete={handleDeleteRequest}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тег?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteConfirm?.name}</span> будет удалён.
              {deleteConfirm && (deleteConfirm.employeeCount > 0 || deleteConfirm.departmentCount > 0) && (
                <div className="mt-2 text-sm">
                  Тег используется:
                  {deleteConfirm.employeeCount > 0 && (
                    <span> у <strong>{deleteConfirm.employeeCount}</strong> сотрудник{deleteConfirm.employeeCount === 1 ? "а" : deleteConfirm.employeeCount < 5 ? "ов" : "ов"}</span>
                  )}
                  {deleteConfirm.employeeCount > 0 && deleteConfirm.departmentCount > 0 && <span>, </span>}
                  {deleteConfirm.departmentCount > 0 && (
                    <span>в <strong>{deleteConfirm.departmentCount}</strong> подразделени{deleteConfirm.departmentCount === 1 ? "и" : deleteConfirm.departmentCount < 5 ? "ях" : "ях"}</span>
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
