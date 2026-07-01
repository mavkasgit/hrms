import { useMemo, useState } from "react"
import { Check, Search, X } from "lucide-react"
import { Badge } from "@/shared/ui/badge"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/utils/cn"

export interface InlineMultiSelectOption {
  value: string
  label: string
  color?: string
  hint?: string
}

export interface InlineMultiSelectProps {
  label: string
  options: InlineMultiSelectOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  searchPlaceholder?: string
  emptyMessage?: string
  maxChips?: number
  testId?: string
}

export function InlineMultiSelect({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = "Поиск...",
  emptyMessage = "Нет значений",
  maxChips = 4,
  testId,
}: InlineMultiSelectProps) {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false)
    )
  }, [options, search])

  const labelOf = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value
  const colorOf = (value: string) =>
    options.find((o) => o.value === value)?.color

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const selectAllVisible = () => {
    const next = new Set(selected)
    for (const o of filtered) next.add(o.value)
    onChange(next)
  }

  const clear = () => onChange(new Set())

  const chips = Array.from(selected).slice(0, maxChips)
  const overflow = selected.size - chips.length

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
          {selected.size > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] font-semibold text-primary-foreground normal-case tracking-normal">
              {selected.size}
            </span>
          )}
        </p>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] text-muted-foreground hover:text-foreground"
            data-testid={testId ? `${testId}-clear` : undefined}
          >
            Сбросить
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((value) => (
            <Badge
              key={value}
              variant="secondary"
              className="flex items-center gap-1 pr-1 py-0 text-[11px] max-w-full"
              style={
                colorOf(value)
                  ? {
                      backgroundColor: `${colorOf(value)}1A`,
                      color: colorOf(value),
                      borderColor: `${colorOf(value)}40`,
                    }
                  : undefined
              }
            >
              <span className="truncate max-w-[180px]">{labelOf(value)}</span>
              <button
                type="button"
                onClick={() => toggle(value)}
                className="rounded-full p-0.5 hover:bg-black/10 shrink-0"
                aria-label={`Убрать «${labelOf(value)}»`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge variant="outline" className="text-[11px] py-0 text-muted-foreground">
              +{overflow}
            </Badge>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 pl-7 text-xs"
          data-testid={testId ? `${testId}-search` : undefined}
        />
        {search && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => setSearch("")}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <div className="max-h-44 overflow-y-auto rounded border">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-2">{emptyMessage}</p>
        ) : (
          filtered.map((option) => {
            const isSelected = selected.has(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left cursor-pointer transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground"
                )}
                data-testid={testId ? `${testId}-option` : undefined}
              >
                {option.color && (
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: isSelected ? "currentColor" : option.color }}
                  />
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {option.hint && (
                  <span
                    className={cn(
                      "text-[10px]",
                      isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {option.hint}
                  </span>
                )}
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )
          })
        )}
      </div>

      {filtered.length > 0 && selected.size < filtered.length && (
        <button
          type="button"
          onClick={selectAllVisible}
          className="text-[11px] text-primary hover:underline"
        >
          Выбрать все видимые
        </button>
      )}
    </div>
  )
}
