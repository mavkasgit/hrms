import { useState, useEffect, useId } from "react"
import { Calendar } from "lucide-react"
import { Button } from "./button"
import { Popover, PopoverTrigger, PopoverContent } from "./popover"
import { cn } from "@/shared/utils/cn"

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
  label?: string
  placeholder?: string
  required?: boolean
  className?: string
  disabled?: boolean
  autoFocus?: boolean
}

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
]

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

function formatDateForDisplay(isoDate: string): string {
  if (!isoDate) return ""
  const [year, month, day] = isoDate.split("-")
  return `${day}.${month}.${year}`
}

function formatDateForStorage(displayDate: string): string {
  if (!displayDate) return ""
  const parts = displayDate.split(".")
  if (parts.length !== 3) return ""
  const [day, month, year] = parts
  return `${year}-${month}-${day}`
}

export function DatePicker({ value, onChange, label, placeholder, required = false, className, disabled = false, autoFocus = false }: DatePickerProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value) {
      const d = new Date(value + "T00:00:00")
      return isNaN(d.getTime()) ? new Date() : d
    }
    return new Date()
  })
  const [inputValue, setInputValue] = useState(formatDateForDisplay(value))

  useEffect(() => {
    setInputValue(formatDateForDisplay(value))
  }, [value])

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00")
      setCurrentMonth(isNaN(d.getTime()) ? new Date() : d)
    } else {
      setCurrentMonth(new Date())
    }
  }, [value])

  const formatDisplayDate = (raw: string): string => {
    const digits = raw.replace(/\D/g, "").slice(0, 8)
    let result = ""
    for (let i = 0; i < digits.length; i++) {
      if (i === 2 || i === 4) result += "."
      result += digits[i]
    }
    return result
  }

  const handleInputChange = (raw: string) => {
    const formatted = formatDisplayDate(raw)
    setInputValue(formatted)
    const isoDate = formatDateForStorage(formatted)
    if (isoDate) {
      onChange(isoDate)
    }
  }

  const handleCalendarDateClick = (day: number) => {
    const year = currentMonth.getFullYear()
    const month = String(currentMonth.getMonth() + 1).padStart(2, "0")
    const dayStr = String(day).padStart(2, "0")
    const isoDate = `${year}-${month}-${dayStr}`
    onChange(isoDate)
    setInputValue(`${dayStr}.${month}.${year}`)
    setOpen(false)
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay()
    return day === 0 ? 6 : day - 1
  }

  const renderCalendar = () => {
    if (isNaN(currentMonth.getTime())) {
      setCurrentMonth(new Date())
      return null
    }
    const daysInMonth = getDaysInMonth(currentMonth)
    const firstDay = getFirstDayOfMonth(currentMonth)
    const days: React.ReactNode[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-full aspect-square" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const year = currentMonth.getFullYear()
      const month = String(currentMonth.getMonth() + 1).padStart(2, "0")
      const dayStr = String(day).padStart(2, "0")
      const isoDate = `${year}-${month}-${dayStr}`
      const isSelected = value === isoDate

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => handleCalendarDateClick(day)}
          className={cn(
            "w-full aspect-square flex items-center justify-center rounded-md text-xs cursor-pointer transition-all border border-transparent hover:bg-accent hover:border-border",
            isSelected && "bg-primary text-primary-foreground font-semibold border-primary"
          )}
        >
          {day}
        </button>
      )
    }

    return days
  }

  return (
    <div className={cn("relative", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium whitespace-nowrap">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className={cn("flex items-stretch gap-0 rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", disabled && "opacity-50 pointer-events-none")}>
        <input
          id={id}
          type="text"
          placeholder={placeholder || "ДД.ММ.ГГГГ"}
          aria-label={label || placeholder || "ДД.ММ.ГГГГ"}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
          className="flex h-10 w-full rounded-l-md border-0 bg-background px-3 py-2 text-sm ring-offset-0 placeholder:text-muted-foreground focus-visible:outline-none"
          maxLength={10}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 rounded-l-none px-2.5"
              disabled={disabled}
            >
              <Calendar className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-3" align="end" sideOffset={4}>
            <div className="flex items-center justify-between mb-2 pb-2 border-b">
              <button
                type="button"
                className="text-primary hover:text-primary/80 text-sm font-medium px-1"
                onClick={handlePrevMonth}
              >
                ‹
              </button>
              <span className="text-sm font-semibold">
                {(() => {
                  const m = currentMonth.getMonth()
                  const y = currentMonth.getFullYear()
                  return isNaN(m) || isNaN(y) ? new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) : `${MONTH_NAMES[m]} ${y}`
                })()}
              </span>
              <button
                type="button"
                className="text-primary hover:text-primary/80 text-sm font-medium px-1"
                onClick={handleNextMonth}
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1 text-center">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-xs font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {renderCalendar()}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
