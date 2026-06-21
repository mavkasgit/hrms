import { useState, useEffect, useId, useRef } from "react"
import { ListFilter } from "lucide-react"
import { Input } from "@/shared/ui/input"

interface DocumentNumberFieldProps {
  value: string
  onChange: (v: string) => void
  useNextNumber: () => { data?: string }
  useRecentItems: () => { data?: { items: { id: number; number: string | null; date: string; employee_name: string | null; title?: string; typeLabel?: string }[] } }
  label: string
  emptyListLabel: string
  popoverTitle: string
  required?: boolean
  error?: string
  renderItem?: (item: { number: string | null; date: string; employee_name: string | null; title?: string; typeLabel?: string }) => React.ReactNode
  displayValue?: string
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  suffixElement?: React.ReactNode
}

function defaultFormatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
}

function defaultRenderItem(item: { number: string | null; date: string; employee_name: string | null; title?: string; typeLabel?: string }) {
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
}: DocumentNumberFieldProps) {
  const id = useId()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [userModified, setUserModified] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: suggestedNumber } = useNextNumber()
  const { data: recentData } = useRecentItems()

  const recentItems = recentData?.items ?? []

  useEffect(() => {
    if (!userModified && suggestedNumber && !value) {
      onChange(suggestedNumber)
    }
  }, [suggestedNumber, value, onChange, userModified])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setUserModified(true)
    onChange(v)
  }

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPopoverOpen(true)
  }

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setPopoverOpen(false), 200)
  }

  const hasError = error || (required && !value)

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
            className="absolute top-full left-0 mt-1 min-w-[420px] border rounded-md bg-background p-2 z-50 shadow-lg"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <p className="text-xs font-semibold mb-2 text-muted-foreground">
              {popoverTitle}
            </p>
            {recentItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{emptyListLabel}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {[...recentItems].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 8).map((item) => (
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
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
