import { addYearsToDate, addMonthsToDate } from "@/shared/utils/date"

type QuickOption = {
  label: string
  years?: number
  months?: number
}

type QuickOptionsProps = {
  options: QuickOption[]
  baseDate: string | undefined
  targetFieldKey: string
  countFieldKey: string
  extraFields: Record<string, string | number>
  onChange: (key: string, value: string | number) => void
  className?: string
}

/**
 * Универсальный компонент quick options.
 * Рендерит кнопки быстрых значений + input для ручного ввода числа.
 * Автоматически рассчитывает целевую дату от baseDate + years/months.
 */
export function QuickOptions({
  options,
  baseDate,
  targetFieldKey,
  countFieldKey,
  extraFields,
  onChange,
  className,
}: QuickOptionsProps) {
  if (!options || options.length === 0) return null

  const unit = options[0]?.years !== undefined ? "years" : "months"
  const countValue = extraFields[countFieldKey]
  const displayValue = countValue !== undefined && countValue !== "" ? String(countValue) : ""

  const applyOption = (opt: QuickOption) => {
    if (!baseDate) return
    const result = opt.years
      ? addYearsToDate(baseDate, opt.years)
      : opt.months
        ? addMonthsToDate(baseDate, opt.months)
        : ""
    if (result) {
      onChange(targetFieldKey, result)
      onChange(countFieldKey, opt.years ?? opt.months ?? "")
    }
  }

  const handleCountInput = (val: string) => {
    const num = Number(val)
    onChange(countFieldKey, val === "" ? "" : num)
    if (num > 0 && baseDate) {
      const result = unit === "years"
        ? addYearsToDate(baseDate, num)
        : addMonthsToDate(baseDate, num)
      onChange(targetFieldKey, result)
    }
  }

  return (
    <div className={`flex gap-2 items-center ${className || ""}`}>
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          className="text-xs px-2 py-0.5 rounded border border-input bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={() => applyOption(opt)}
        >
          {opt.label}
        </button>
      ))}
      <label className="text-xs text-muted-foreground whitespace-nowrap">
        {unit === "years" ? "лет:" : "мес:"}
      </label>
      <input
        type="number"
        min="1"
        max="99"
        value={displayValue}
        onChange={(e) => handleCountInput(e.target.value)}
        className="w-12 h-7 text-xs rounded border border-input bg-background px-1 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  )
}
