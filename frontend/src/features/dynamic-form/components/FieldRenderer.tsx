import { DatePicker } from "@/shared/ui/date-picker"
import { Input } from "@/shared/ui/input"
import { ComboboxCreate } from "@/shared/ui/combobox-create"
import { addYearsToDate, addMonthsToDate } from "@/shared/utils/date"
import { Briefcase } from "lucide-react"
import { usePositions, useCreatePosition } from "@/entities/position"

/** Универсальная схема поля для любого типа документа */
export type FieldSchema = {
  key: string
  label: string
  type: "date" | "text" | "number" | "textarea" | "select"
  required?: boolean
  enabled?: boolean
  quickOptions?: { label: string; years?: number; months?: number; unit?: "years" | "months" }[]
  entity?: string // e.g., "position" for position selector
  allow_create?: boolean // whether to allow creating new items (default: false)
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

function PositionSelectField({ field, value, error, onChange }: {
  field: FieldSchema
  value: string | number | undefined
  error?: string
  onChange: (key: string, value: string | number) => void
}) {
  const { data: positions = [] } = usePositions()
  const createPos = useCreatePosition()

  const posItems = positions.map((p) => ({ id: p.id, name: p.name }))

  const handleCreatePosition = async (name: string): Promise<number> => {
    const newPos = await createPos.mutateAsync({ name })
    return newPos.id
  }

  const allowCreate = field.allow_create === true // default to false

  return (
    <div className="flex flex-col min-w-0 space-y-1 w-[350px]">
      <label className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="overflow-hidden">
        <ComboboxCreate
          value={value ? Number(value) : null}
          onChange={(id) => onChange(field.key, id ?? "")}
          items={posItems}
          {...(allowCreate ? { onCreate: handleCreatePosition } : {})}
          allowCreate={allowCreate}
          placeholder={field.label}
          icon={<Briefcase className="h-4 w-4" />}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
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

  console.log("[FieldRenderer] Rendering field:", field.key, "type:", field.type, "entity:", field.entity)

  if (field.type === "select" && field.entity === "position") {
    console.log("[FieldRenderer] Rendering PositionSelectField for", field.key)
    return <PositionSelectField field={field} value={value} error={error} onChange={onChange} />
  }

  if (field.type === "date") {
    return (
      <div className="inline-flex flex-col min-w-0">
        <DatePicker
          label={field.label}
          value={displayValue}
          onChange={(v) => onChange(field.key, v)}
          required={field.required}
          className="w-[130px]"
        />
        {field.quickOptions && field.quickOptions.length > 0 && (
          <div className="flex gap-2 mt-1 items-end flex-nowrap">
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

  if (field.type === "select" && field.entity === "position") {
    return <PositionSelectField field={field} value={value} error={error} onChange={onChange} />
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

  // number field with quickOptions (e.g., new_contract_years, contract_years)
  if (field.type === "number" && field.quickOptions && field.quickOptions.length > 0) {
    const unit = field.quickOptions[0]?.unit
    const unitLabel = unit === "years" ? "лет:" : "мес:"

    // Determine which date field to read as base and which to write as result
    const quickOptionMapping: Record<string, { base: string; end: string }> = {
      new_contract_years: { base: "new_contract_start", end: "new_contract_end" },
      contract_years: { base: "hire_date", end: "contract_end" },
    }
    const mapping = quickOptionMapping[field.key]
    const baseDateKey: string = mapping ? mapping.base : "hire_date"
    const endDateKey: string = mapping ? mapping.end : (unit === "years" ? "contract_end" : "trial_end")

    const handleSetYears = (years: number) => {
      onChange(field.key, years)
      const base = getBaseDate(extraFields, baseDateKey)
      if (base && years > 0) {
        const endDate = unit === "years" ? addYearsToDate(base, years) : addMonthsToDate(base, years)
        if (endDate) onChange(endDateKey, endDate)
      }
    }

    return (
      <div className="flex flex-col min-w-0 inline">
        <div className="flex gap-2 items-center flex-wrap">
          {field.quickOptions.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className="text-xs px-2 py-0.5 rounded border border-input bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={() => handleSetYears(opt.years ?? opt.months ?? 0)}
            >
              {opt.label}
            </button>
          ))}
          <label className="text-xs text-muted-foreground whitespace-nowrap">{unitLabel}</label>
          <input
            type="number"
            min="1"
            max="99"
            value={displayValue}
            onChange={(e) => {
              const val = e.target.value
              onChange(field.key, val === "" ? "" : Number(val))
              const num = Number(val)
              if (num > 0) {
                const base = getBaseDate(extraFields, baseDateKey)
                if (base) {
                  const endDate = unit === "years" ? addYearsToDate(base, num) : addMonthsToDate(base, num)
                  if (endDate) onChange(endDateKey, endDate)
                }
              }
            }}
            className="w-12 h-7 text-xs rounded border border-input bg-background px-1 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
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
        className="w-full h-10"
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
