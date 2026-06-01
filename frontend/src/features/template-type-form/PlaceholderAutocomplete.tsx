import { useState, useEffect, useRef } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/shared/utils/cn"
import { Button } from "@/shared/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Input } from "@/shared/ui/input"

export interface PlaceholderOption {
  name: string
  displayName: string
  description: string
  category: string
}

interface PlaceholderAutocompleteProps {
  value: string
  onChange: (value: string) => void
  options: PlaceholderOption[]
  placeholder?: string
}

/**
 * Autocomplete input для выбора плейсхолдеров.
 * Показывает выпадающий список с фильтрацией по вводу.
 */
export function PlaceholderAutocomplete({
  value,
  onChange,
  options,
  placeholder = "Выберите плейсхолдер...",
}: PlaceholderAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Фильтрация опций по поиску
  const filtered = options.filter((opt) => {
    const query = search.toLowerCase()
    return (
      (opt.name || "").toLowerCase().includes(query) ||
      (opt.displayName || "").toLowerCase().includes(query) ||
      (opt.description || "").toLowerCase().includes(query) ||
      (opt.category || "").toLowerCase().includes(query)
    )
  })

  // Группировка по категориям
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, opt) => {
    const cat = opt.category || "Другое"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(opt)
    return acc
  }, {})

  // При открытии фокусируемся на input
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSelect = (name: string) => {
    onChange(name.replace(/^\{/, "").replace(/\}$/, "")) // Убираем фигурные скобки если есть
    setSearch("")
    setOpen(false)
  }

  // Find selected option for display
  const selected = options.find(opt => (opt.key || opt.name.replace(/^\{|\}$/g, "")) === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 font-normal text-xs"
        >
          {selected ? selected.displayName : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[650px] p-0 overflow-hidden"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false)
            }}
          />
        </div>
        <div
          className="max-h-[300px] overflow-y-auto overflow-x-hidden"
          style={{ overscrollBehavior: 'contain' }}
          onWheel={(e) => e.stopPropagation()}
        >
          {Object.keys(grouped).length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </div>
          )}
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="p-1">
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
                {category}
              </div>
              {items.map((opt) => {
                const optKey = opt.key || opt.name.replace(/^\{|\}$/g, "")
                return (
                  <button
                    key={optKey}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent flex items-center gap-2",
                      value === optKey && "bg-accent"
                    )}
                    onClick={() => handleSelect(optKey)}
                  >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === optKey ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0 font-medium">
                    {opt.displayName || ("{" + optKey + "}")}
                  </code>
                  <span className="text-muted-foreground text-xs truncate">
                    {opt.description}
                  </span>
                </button>
              )})}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
