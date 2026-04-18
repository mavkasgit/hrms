import { useState, useRef } from "react"
import { Badge } from "@/shared/ui/badge"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { Trash2 } from "lucide-react"
import { OrderNumberField } from "@/features/OrderNumberField"

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

// ─── Variant 7: OrderNumberField ───
function Variant7() {
  const [value, setValue] = useState("")
  return <OrderNumberField value={value} onChange={setValue} />
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
      </div>

      <h2 className="text-xl font-bold border-b pb-2 mt-8">Номер приказа</h2>
      <p className="text-sm text-muted-foreground mb-4">Лейбл сверху, инпут редактируемый, при загрузке авто-подставляется номер. Наведи — покажет последние приказы.</p>

      <div className="space-y-8">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>7</Badge>
            <h3 className="font-semibold">OrderNumberField</h3>
          </div>
          <Variant7 />
        </div>
      </div>
    </div>
  )
}