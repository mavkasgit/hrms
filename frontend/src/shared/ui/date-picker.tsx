import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Calendar } from "lucide-react"
import { Button } from "./button"
import { cn } from "@/shared/utils/cn"

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
  label?: string
  required?: boolean
  className?: string
  disabled?: boolean
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

export function DatePicker({ value, onChange, label, required = false, className, disabled = false }: DatePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value + "T00:00:00") : new Date())
  const [inputValue, setInputValue] = useState(formatDateForDisplay(value))
  const [calendarPosition, setCalendarPosition] = useState({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setInputValue(formatDateForDisplay(value))
  }, [value])

  useEffect(() => {
    setCurrentMonth(value ? new Date(value + "T00:00:00") : new Date())
  }, [value])

  useEffect(() => {
    if (showCalendar && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setCalendarPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      })
    }
  }, [showCalendar])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Проверяем, не клик ли это по календарю в портале
      if (target.closest('[data-calendar-portal]')) {
        return
      }
      // Проверяем, не клик ли это по нашему компоненту
      if (ref.current && !ref.current.contains(target)) {
        setShowCalendar(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
    setShowCalendar(false)
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
    <div className={cn("relative", className)} ref={ref}>
      {label && (
        <label className="text-sm font-medium whitespace-nowrap">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className={cn("flex items-stretch gap-0 rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", disabled && "opacity-50 pointer-events-none")}>
        <input
          type="text"
          placeholder="ДД.ММ.ГГГГ"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
          className="flex h-10 w-full rounded-l-md border-0 bg-background px-3 py-2 text-sm ring-offset-0 placeholder:text-muted-foreground focus-visible:outline-none"
          maxLength={10}
          disabled={disabled}
        />
        <Button
          ref={buttonRef}
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 rounded-l-none px-2.5"
          onClick={() => setShowCalendar(!showCalendar)}
          disabled={disabled}
        >
          <Calendar className="h-4 w-4" />
        </Button>
      </div>

      {showCalendar && createPortal(
        <div 
          data-calendar-portal
          className="fixed z-[99999] w-[260px] border rounded-md bg-popover shadow-lg p-3"
          style={{
            top: `${calendarPosition.top}px`,
            left: `${calendarPosition.left}px`,
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2 pb-2 border-b">
            <button 
              type="button" 
              className="text-primary hover:text-primary/80 text-sm font-medium px-1" 
              onClick={handlePrevMonth}
              onMouseDown={(e) => e.stopPropagation()}
            >
              ‹
            </button>
            <span className="text-sm font-semibold">
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
            <button 
              type="button" 
              className="text-primary hover:text-primary/80 text-sm font-medium px-1" 
              onClick={handleNextMonth}
              onMouseDown={(e) => e.stopPropagation()}
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
        </div>,
        document.body
      )}
    </div>
  )
}
