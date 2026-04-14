import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
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
import { Plus, Pencil, Trash2, Tag as TagIcon } from "lucide-react"
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  type Tag,
} from "@/entities/tag"

const COLOR_PRESETS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
  "#06B6D4", "#84CC16", "#F97316", "#6B7280", "#1D4ED8", "#065F46",
]

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
  onDelete,
}: {
  tag: Tag
  onEdit: (tag: Tag) => void
  onDelete: (tag: Tag) => void
}) {
  const color = tag.color ?? "#94a3b8"

  return (
    <div
      className="group/tag flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md hover:bg-accent/50 transition-colors"
      style={{ borderColor: color + "60", backgroundColor: color + "08" }}
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
      <div className="hidden group-hover/tag:flex gap-0.5 flex-shrink-0">
        <button
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:bg-accent"
          onClick={() => onEdit(tag)}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          className="h-5 w-5 flex items-center justify-center rounded text-destructive/60 hover:text-destructive hover:bg-accent"
          onClick={() => onDelete(tag)}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [tagName, setTagName] = useState("")
  const [tagCategory, setTagCategory] = useState("")
  const [tagColor, setTagColor] = useState("")

  const [deleteTarget, setDeleteTarget] = useState<{
    id: number
    name: string
  } | null>(null)

  const openAdd = () => {
    setEditingId(null)
    setTagName("")
    setTagCategory("")
    setTagColor("")
    setDialogOpen(true)
  }

  const openEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setTagName(tag.name)
    setTagCategory(tag.category ?? "")
    setTagColor(tag.color ?? "")
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!tagName.trim()) return
    if (editingId) {
      updateTag.mutate({
        id: editingId,
        data: {
          name: tagName.trim(),
          category: tagCategory.trim() || undefined,
          color: tagColor.trim() || undefined,
        },
      })
    } else {
      createTag.mutate({
        name: tagName.trim(),
        category: tagCategory.trim() || undefined,
        color: tagColor.trim() || undefined,
      })
    }
    setDialogOpen(false)
  }

  const handleDelete = () => {
    if (deleteTarget) {
      deleteTag.mutate(deleteTarget.id)
      setDeleteTarget(null)
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
                    onDelete={(t) => setDeleteTarget({ id: t.id, name: t.name })}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Редактировать тег" : "Новый тег"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Измените название, категорию и цвет"
                : "Создайте тег для группировки"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Название</label>
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Python"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Категория</label>
              <Input
                value={tagCategory}
                onChange={(e) => setTagCategory(e.target.value)}
                placeholder="Навыки, Роли..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Цвет</label>
              <div className="mt-1.5 space-y-3">
                <div className="grid grid-cols-6 gap-1.5">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="h-6 w-6 rounded-full cursor-pointer transition-all ring-2 ring-transparent hover:ring-foreground/30"
                      style={{
                        backgroundColor: color,
                        boxShadow:
                          tagColor === color
                            ? `0 0 0 2px var(--background), 0 0 0 4px ${color}`
                            : undefined,
                      }}
                      onClick={() => setTagColor(color)}
                    />
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    value={tagColor}
                    onChange={(e) => setTagColor(e.target.value)}
                    placeholder="#3B82F6"
                    className="max-w-[140px] text-xs"
                  />
                  {tagColor && /^#[0-9A-Fa-f]{6}$/.test(tagColor) && (
                    <div
                      className="h-6 w-6 rounded border flex-shrink-0"
                      style={{ backgroundColor: tagColor }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave}>
              {editingId ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тег?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> будет удалён у всех сотрудников и подразделений.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
