import { useState, useMemo } from "react"
import { Badge } from "@/shared/ui/badge"
import { Input } from "@/shared/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Search, Plus, X, Users, Building2 } from "lucide-react"

export interface TagPickerTag {
  id: number
  name: string
  color?: string
  employee_count?: number
  department_count?: number
}

interface TagPickerProps {
  tags: TagPickerTag[]
  assignedTags: TagPickerTag[]
  onAssign: (tagId: number) => void
  onUnassign: (tagId: number) => void
  align?: "start" | "end" | "center"
  disabled?: boolean
}

function TagDot({ color }: { color?: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color || "#94a3b8" }}
    />
  )
}

function TagCounts({ emp, dept }: { emp?: number; dept?: number }) {
  if (!emp && !dept) return null
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto">
      {!!emp && (
        <span className="flex items-center gap-0.5">
          <Users className="h-3 w-3" />
          {emp}
        </span>
      )}
      {!!dept && (
        <span className="flex items-center gap-0.5">
          <Building2 className="h-3 w-3" />
          {dept}
        </span>
      )}
    </span>
  )
}

export function TagPicker({
  tags,
  assignedTags,
  onAssign,
  onUnassign,
  align = "end",
  disabled,
}: TagPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const assignedIds = useMemo(
    () => new Set(assignedTags.map((t) => t.id)),
    [assignedTags]
  )

  const available = useMemo(() => {
    const q = search.toLowerCase().trim()
    return tags.filter(
      (t) =>
        !assignedIds.has(t.id) &&
        (!q || t.name.toLowerCase().includes(q))
    )
  }, [tags, assignedIds, search])

  const handleAssign = (tagId: number) => {
    onAssign(tagId)
    setSearch("")
    // Не закрываем popover сразу, чтобы можно было выбрать несколько
  }

  const handleUnassign = (tagId: number) => {
    onUnassign(tagId)
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {assignedTags.map((t) => (
        <Badge
          key={t.id}
          variant="outline"
          className="text-[10px] h-5 px-1.5 cursor-pointer hover:bg-destructive/10 transition-colors gap-1 group/tag"
          style={{ borderColor: t.color, color: t.color }}
          onClick={() => handleUnassign(t.id)}
          title="Убрать тег"
        >
          {t.name}
          <X className="h-2.5 w-2.5 opacity-0 group-hover/tag:opacity-100 transition-opacity" />
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Тег
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align={align}>
          <div className="relative mb-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск тегов..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-muted/50"
              autoFocus
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {available.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                {search ? "Ничего не найдено" : "Все теги назначены"}
              </div>
            ) : (
              available.map((t) => (
                <button
                  key={t.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent/80 transition-colors group/item cursor-pointer"
                  onClick={() => handleAssign(t.id)}
                >
                  <TagDot color={t.color} />
                  <span className="flex-1 text-left">{t.name}</span>
                  <TagCounts
                    emp={t.employee_count}
                    dept={t.department_count}
                  />
                  <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
