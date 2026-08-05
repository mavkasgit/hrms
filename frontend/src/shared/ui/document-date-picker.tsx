import { DatePicker } from "./date-picker"

interface DocumentDatePickerProps {
  value: string
  onChange: (date: string) => void
  label?: string
  placeholder?: string
  required?: boolean
  className?: string
  disabled?: boolean
  autoFocus?: boolean
  /** Показывать предупреждение при будущей дате (по умолчанию false) */
  warnIfFuture?: boolean
}

/** Сегодняшняя дата в локальном часовом поясе (ISO yyyy-mm-dd). */
function todayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * DatePicker для дат приказов/документов.
 * Пассивное предупреждение при будущей дате — не блокирует отправку.
 * Включается явно через warnIfFuture.
 */
export function DocumentDatePicker(props: DocumentDatePickerProps) {
  const { warnIfFuture = false, ...datePickerProps } = props
  const isFuture = warnIfFuture && props.value !== "" && props.value > todayIso()

  return (
    <div>
      <DatePicker {...datePickerProps} />
      {isFuture && (
        <p role="status" className="text-xs text-yellow-600 mt-1 whitespace-nowrap">
          Дата указана в будущем
        </p>
      )}
    </div>
  )
}
