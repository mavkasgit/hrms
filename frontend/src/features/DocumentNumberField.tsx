import { useState, useEffect, useId, useRef } from "react"
import { ListFilter } from "lucide-react"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"

interface RecentItem {
  id: number
  number: string | null
  date: string
  employee_name: string | null
  title?: string
  typeLabel?: string
}

interface RecentSection {
  title: string
  items: RecentItem[]
}

interface DocumentNumberFieldProps {
  value: string
  onChange: (v: string) => void
  useNextNumber: () => { data?: string }
  useRecentItems: () => { data?: { items: RecentItem[] } }
  label: string
  emptyListLabel: string
  popoverTitle: string
  required?: boolean
  error?: string
  renderItem?: (item: RecentItem) => React.ReactNode
  displayValue?: string
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  suffixElement?: React.ReactNode
  /** Дополнительные секции списка последних записей (отдельные «таблицы» в попапе). */
  recentSections?: RecentSection[]
  /** Подставить следующий номер (последний в списке + 1). Кнопка в шапке колонки. */
  onFillNextNumber?: () => void
  /** То же для дополнительной секции (колонки). */
  onFillSectionNextNumber?: (section: RecentSection) => void
  /** Вызывается, когда пользователь вручную меняет значение (не автоподстановка). */
  onUserModified?: (modified: boolean) => void
}

function defaultFormatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
}

function defaultRenderItem(item: RecentItem) {
  const nameParts = (item.employee_name || "").split(" ")
  const lastName = nameParts[0] || ""
  const initials = nameParts.slice(1, 3).map((p) => `${p[0]}.`).join("")
  return (
    <div className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-muted rounded px-1 whitespace-nowrap">
      <span className="font-mono font-semibold shrink-0">№{item.number}</span>
      <span className="text-muted-foreground shrink-0">{defaultFormatDate(item.date)}</span>
      <span className="font-semibold shrink-0">{lastName} {initials}</span>
      {item.typeLabel && (
        <span className="text-muted-foreground truncate max-w-[140px]">{item.typeLabel}</span>
      )}
    </div>
  )
}

export function DocumentNumberField({
  value,
  onChange,
  useNextNumber,
  useRecentItems,
  label,
  emptyListLabel,
  popoverTitle,
  required,
  error,
  renderItem,
  displayValue,
  onBlur,
  suffixElement,
  recentSections,
  onFillNextNumber,
  onFillSectionNextNumber,
  onUserModified,
}: DocumentNumberFieldProps) {
  const id = useId()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [userModified, setUserModified] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: suggestedNumber } = useNextNumber()
  const { data: recentData } = useRecentItems()

  const recentItems = recentData?.items ?? []
  const hasSections = recentSections && recentSections.length > 0

  const renderList = (items: RecentItem[]) => (
    <div className="flex flex-col gap-1">
      {[...items].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 8).map((item) => (
        <div
          key={item.id}
          onClick={() => {
            if (item.number) onChange(item.number)
            setPopoverOpen(false)
          }}
        >
          {renderItem ? renderItem(item) : defaultRenderItem(item)}
        </div>
      ))}
    </div>
  )

  useEffect(() => {
    if (!userModified && suggestedNumber && !value) {
      onChange(suggestedNumber)
    }
  }, [suggestedNumber, value, onChange, userModified])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setUserModified(true)
    onUserModified?.(true)
    onChange(v)
  }

  // По умолчанию: последняя (свежая) строка списка + 1. Можно переопределить через onFillNextNumber.
  const handleFillMain = () => {
    if (onFillNextNumber) {
      onFillNextNumber()
      return
    }
    const row = [...recentItems].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
    if (!row?.number) return
    const m = row.number.match(/^(\d+)(.*)$/)
    if (!m) return
    onChange(`${parseInt(m[1], 10) + 1}${m[2]}`)
  }

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPopoverOpen(true)
  }

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setPopoverOpen(false), 200)
  }

  const hasError = error || (required && !value)

  const renderHeader = (title: string, onFill?: () => void) => (
    <div className="flex items-center justify-between gap-1.5 mb-1">
      <p className="text-xs font-semibold text-muted-foreground">
        {title}
      </p>
      <Button
        type="button"
        size="sm"
        onClick={onFill ?? handleFillMain}
        className="h-6 px-2 text-[11px] shrink-0"
      >
        Заполнить след. номер
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center gap-1">
          <div className="relative">
            <Input
              id={id}
              value={displayValue !== undefined ? displayValue : value}
              onChange={handleChange}
              onBlur={onBlur}
              className={`h-10 text-sm w-[100px] pr-7 ${hasError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              onFocus={(e) => e.target.select()}
            />
            <ListFilter className="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          {suffixElement}
        </div>
        {popoverOpen && (
          <div
            className={`absolute top-full left-0 mt-1 ${hasSections ? "min-w-[760px]" : "min-w-[420px]"} border rounded-md bg-background p-2 z-50 shadow-lg`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {hasSections ? (
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  {renderHeader(popoverTitle, onFillNextNumber)}
                  {recentItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">{emptyListLabel}</p>
                  ) : (
                    renderList(recentItems)
                  )}
                </div>
                {recentSections.map((section) =>
                  section.items.length > 0 ? (
                    <div key={section.title} className="flex-1 min-w-0 border-l pl-4">
                      {renderHeader(section.title, () => onFillSectionNextNumber?.(section))}
                      {renderList(section.items)}
                    </div>
                  ) : null
                )}
              </div>
            ) : (
              <>
                {renderHeader(popoverTitle, onFillNextNumber)}
                {recentItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">{emptyListLabel}</p>
                ) : (
                  renderList(recentItems)
                )}
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
