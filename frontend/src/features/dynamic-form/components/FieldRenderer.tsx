import { DatePicker } from "@/shared/ui/date-picker"
import { Input } from "@/shared/ui/input"
import { addYearsToDate, addMonthsToDate } from "@/shared/utils/date"

/** Универсальная схема поля для любого типа документа */
export type FieldSchema = {
  key: string
  label: string
  type: "date" | "text" | "number" | "textarea"
  required?: boolean
  quickOptions?: { label: string; years?: number; months?: number; unit?: "years" | "months" }[]
}

type FieldRendererProps = {
  field: FieldSchema
  value: string | number | undefined
  error?: string
  onChange: (key: string, value: string | number) => void
  extraFields: Record<string, string | number>
  /** Для date-полей с quick options: от какой даты рассчитывать (по умолчанию — hire_date или первое date-поле в extraFields) */
  baseDateKey?: string
}

function getBaseDate(extraFields: Record<string, string | number>, baseDateKey?: string): string | undefined {
  if (baseDateKey && typeof extraFields[baseDateKey] === "string") {
    return extraFields[baseDateKey] as string
  }
  // Fallback: hire_date для hire/contract, new_contract_start для contract_extension
  if (typeof extraFields["hire_date"] === "string") return extraFields["hire_date"] as string
  if (typeof extraFields["new_contract_start"] === "string") return extraFields["new_contract_start"] as string
  if (typeof extraFields["old_contract_end"] === "string") return extraFields["old_contract_end"] as string
  return undefined
}

function getCountKey(fieldKey: string): string {
  if (fieldKey === "contract_end") return "contract_end_years"
  if (fieldKey === "trial_end") return "trial_end_months"
  if (fieldKey === "new_contract_end") return "new_contract_years"
  return `${fieldKey}_count`
}

/**
 * Универсальный рендерер поля.
 * Поддерживает date, text, number, textarea.
 * Для date-полей с quickOptions рендерит кнопки + input числа.
 */
export function FieldRenderer({ field, value, error, onChange, extraFields, baseDateKey }: FieldRendererProps) {
  const displayValue = value !== undefined && value !== null ? String(value) : ""
  const baseDate = getBaseDate(extraFields, baseDateKey)

  if (field.type === "date") {
    return (
      <div className="flex flex-col min-w-0">
        <DatePicker
          label={field.label}
          value={displayValue}
          onChange={(v) => onChange(field.key, v)}
          required={field.required}
          className="w-full"
        />
        {field.quickOptions && field.quickOptions.length > 0 && (
          <div className="flex gap-2 mt-1 items-end flex-wrap">
            {field.quickOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="text-xs px-2 py-0.5 rounded border border-input bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                onClick={() => {
                  if (baseDate) {
                    const result = opt.years
                      ? addYearsToDate(baseDate, opt.years)
                      : opt.months
                        ? addMonthsToDate(baseDate, opt.months)
                        : ""
                    if (result) {
                      onChange(field.key, result)
                      onChange(getCountKey(field.key), opt.years ?? opt.months ?? "")
                    }
                  }
                }}
              >
                {opt.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">
                {field.quickOptions[0]?.unit === "years" ? "лет:" : "мес:"}
              </label>
              <input
                type="number"
                min="1"
                max="99"
                value={(() => {
                  const countKey = getCountKey(field.key)
                  const v = extraFields[countKey]
                  return v !== undefined && v !== null && v !== "" ? String(v) : ""
                })()}
                onChange={(e) => {
                  const val = e.target.value
                  const countKey = getCountKey(field.key)
                  onChange(countKey, val === "" ? "" : Number(val))
                  if (val && Number(val) > 0 && baseDate) {
                    const unit = field.quickOptions![0]?.unit
                    const result = unit === "years"
                      ? addYearsToDate(baseDate, Number(val))
                      : addMonthsToDate(baseDate, Number(val))
                    if (result) onChange(field.key, result)
                  }
                }}
                className="w-12 h-7 text-xs rounded border border-input bg-background px-1 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  if (field.type === "textarea") {
    return (
      <div>
        <label className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-0 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
          placeholder={field.label}
          value={displayValue}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  // text / number
  return (
    <div className="flex flex-col min-w-0 space-y-1">
      <label className="text-sm font-medium">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <Input
        type={field.type === "number" ? "number" : "text"}
        placeholder={field.label}
        value={displayValue}
        onChange={(e) =>
          onChange(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)
        }
        required={field.required}
        className="w-full"
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
