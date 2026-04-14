import { useState, useRef, useEffect, useCallback, type ReactNode } from "react"
import { Check, Plus, ChevronDown, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"

interface ComboboxCreateItem {
  id: number
  name: string
}

interface ComboboxProps {
  value: number | null
  onChange: (id: number) => void
  items: ComboboxCreateItem[]
  onCreate: (name: string) => Promise<number>
  placeholder: string
  icon?: ReactNode
  error?: string
}

export function ComboboxCreate({
  value,
  onChange,
  items,
  onCreate,
  placeholder,
  icon,
  error,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Фокус на инпут при открытии
  useEffect(() => {
    if (open) {
      const selected = items.find((i) => i.id === value)
      setSearch(selected?.name ?? "")
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setSearch("")
    }
  }, [open])

  const selected = items.find((i) => i.id === value)
  const filtered = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items
  const showCreate = search.trim().length > 0 && !items.some(
    (i) => i.name.toLowerCase() === search.trim().toLowerCase()
  )

  const handleSelect = useCallback((item: ComboboxCreateItem) => {
    onChange(item.id)
    setSearch(item.name)
    setOpen(false)
  }, [onChange])

  const handleCreate = useCallback(async () => {
    const name = search.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const newId = await onCreate(name)
      onChange(newId)
      setSearch(name)
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }, [search, onCreate, onChange, creating])

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={`w-full justify-between text-left font-normal ${
              error ? "border-red-500" : ""
            } ${!selected ? "text-muted-foreground" : ""}`}
          >
            {icon && <span className="mr-2 flex-shrink-0">{icon}</span>}
            <span className="truncate">{selected?.name ?? placeholder}</span>
            <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="flex flex-col max-h-[280px]">
            {/* Поле ввода / поиска */}
            <div className="relative border-b px-2 py-1.5">
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && showCreate) handleCreate()
                }}
                placeholder="Найти или создать..."
                className="border-0 h-8 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Список */}
            <div className="overflow-auto flex-1">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => handleSelect(item)}
                >
                  <Check
                    className={`h-4 w-4 flex-shrink-0 ${
                      value === item.id ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}

              {/* «Создать» если нет совпадений */}
              {showCreate && (
                <>
                  {filtered.length > 0 && <div className="border-t mx-2" />}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-primary hover:bg-accent transition-colors"
                    onClick={handleCreate}
                  >
                    <Plus className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">
                      {creating ? "Создание..." : `Создать «${search.trim()}»`}
                    </span>
                  </button>
                </>
              )}

              {/* Пусто */}
              {filtered.length === 0 && !showCreate && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Нет результатов
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
