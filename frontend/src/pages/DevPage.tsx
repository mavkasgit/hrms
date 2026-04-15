import { useState, useRef } from "react"
import { Badge } from "@/shared/ui/badge"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { Plus, Minus, Trash2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"

const CELL = "w-16 h-8 text-sm text-center rounded-md border border-input transition-colors"

// ─── Variant 1: Click → Input same size ───
function Variant1() {
  const [value, setValue] = useState(24)
  const [editing, setEditing] = useState(false)
  const [temp, setTemp] = useState("")
  const ref = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setTemp(String(value))
    setEditing(true)
    setTimeout(() => ref.current?.focus(), 0)
  }

  const save = () => {
    const num = parseInt(temp, 10)
    if (!isNaN(num) && num >= 0) setValue(num)
    setEditing(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Значение:</span>
        <div className={CELL}>
          {editing ? (
            <Input
              ref={ref}
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
              onBlur={save}
              className="h-full w-full border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-center"
            />
          ) : (
            <button onClick={startEdit} className="h-full w-full font-semibold hover:bg-muted/50 rounded-md">
              {value}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Фиксированный контейнер. Input занимает то же пространство.</p>
    </div>
  )
}

// ─── Variant 2: Spin buttons ───
function Variant2() {
  const [value, setValue] = useState(24)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Значение:</span>
        <div className={`${CELL} flex items-center overflow-hidden p-0`}>
          <button onClick={() => setValue(Math.max(0, value - 1))} className="h-full px-1.5 hover:bg-muted transition-colors shrink-0">
            <Minus className="h-3 w-3" />
          </button>
          <span className="flex-1 text-center font-semibold select-none">{value}</span>
          <button onClick={() => setValue(value + 1)} className="h-full px-1.5 hover:bg-muted transition-colors shrink-0">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Кнопки +/- внутри контейнера. Размер никогда не меняется.</p>
    </div>
  )
}

// ─── Variant 3: Popover input ───
function Variant3() {
  const [value, setValue] = useState(24)
  const [open, setOpen] = useState(false)
  const [temp, setTemp] = useState("")
  const ref = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setTemp(String(value))
    setOpen(true)
    setTimeout(() => ref.current?.focus(), 50)
  }

  const save = () => {
    const num = parseInt(temp, 10)
    if (!isNaN(num) && num >= 0) setValue(num)
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Значение:</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button onClick={startEdit} className={`${CELL} font-semibold hover:bg-muted/50`}>
              {value}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-32 p-1.5">
            <Input
              ref={ref}
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false) }}
              className="h-8 text-sm text-center border-0"
            />
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-xs text-muted-foreground">Popover не влияет на размер ячейки.</p>
    </div>
  )
}

// ─── Variant 4: Quick select ───
function Variant4() {
  const [value, setValue] = useState("0")
  const options = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 30]
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Значение:</span>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className={`${CELL} border-0 font-semibold`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">Select в том же размере. Выбрал — обновилось.</p>
    </div>
  )
}

// ─── Variant 5: Badge style inline ───
function Variant5() {
  const [value, setValue] = useState(24)
  const [editing, setEditing] = useState(false)
  const [temp, setTemp] = useState("")
  const ref = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setTemp(String(value))
    setEditing(true)
    setTimeout(() => ref.current?.focus(), 0)
  }

  const save = () => {
    const num = parseInt(temp, 10)
    if (!isNaN(num) && num >= 0) setValue(num)
    setEditing(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Значение:</span>
        <div className={`${CELL} bg-secondary text-secondary-foreground`}>
          {editing ? (
            <Input
              ref={ref}
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
              onBlur={save}
              className="h-full w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-center"
            />
          ) : (
            <button onClick={startEdit} className="h-full w-full font-semibold hover:opacity-80 transition-opacity">
              {value}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Badge-стиль, но тот же размер. Input поверх badge.</p>
    </div>
  )
}

export function DevPage() {
  return (
    <div className="space-y-8 p-8 max-w-4xl">
      <h1 className="text-2xl font-bold">Dev: Inline-редактирование (фиксированный размер)</h1>
      
      {/* DEV Tools */}
      <div className="border border-red-200 rounded-lg p-4 bg-red-50">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="h-5 w-5 text-red-500" />
          <h3 className="font-semibold text-red-600">Инструменты разработки</h3>
        </div>
        <Button 
          variant="destructive" 
          onClick={async () => {
            if (confirm('Очистить ВСЕ данные? Это удалит все отпуска, приказы, периоды и сотрудников!')) {
              const { default: api } = await import('@/shared/api/axios')
              try {
                await api.post('/dev/clear-all')
                alert('Данные очищены! Обновите страницу.')
                window.location.reload()
              } catch (e: any) {
                alert('Ошибка очистки: ' + (e.message || e))
              }
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Очистить всё
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">Все варианты: ячейка {CELL.replace("transition-colors", "").trim()} — клик → редактирование → сохранение. Размер не меняется.</p>

      <div className="space-y-8">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>1</Badge>
            <h3 className="font-semibold">Клик → Input в том же контейнере</h3>
          </div>
          <Variant1 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>2</Badge>
            <h3 className="font-semibold">Spin кнопки (+/-)</h3>
          </div>
          <Variant2 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>3</Badge>
            <h3 className="font-semibold">Popover</h3>
          </div>
          <Variant3 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>4</Badge>
            <h3 className="font-semibold">Select dropdown</h3>
          </div>
          <Variant4 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>5</Badge>
            <h3 className="font-semibold">Badge-стиль</h3>
          </div>
          <Variant5 />
        </div>
      </div>
    </div>
  )
}
