import { DatePicker } from "@/shared/ui/date-picker"
import { Input } from "@/shared/ui/input"

export interface FieldSchema {
  key: string
  label: string
  displayName?: string
  type: "text" | "date" | "number" | "textarea"
  required: boolean
}

interface DynamicFieldProps {
  field: FieldSchema
  value: string | number | undefined
  error?: string
  onChange: (key: string, value: string | number) => void
}

export function DynamicField({ field, value, error, onChange }: DynamicFieldProps) {
  const displayValue = value !== undefined && value !== null ? String(value) : ""
  // Use displayName if available (short name like "Начало ст. контр."), fallback to label
  const displayLabel = field.displayName || field.label

  if (field.type === "date") {
    return (
      <div className="flex flex-col min-w-0">
        <DatePicker
          label={displayLabel}
          value={displayValue}
          onChange={(v) => onChange(field.key, v)}
          required={field.required}
          className="w-full"
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  if (field.type === "textarea") {
    return (
      <div>
        <label className="text-sm font-medium">
          {displayLabel}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-0 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
          placeholder={displayLabel}
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
      <label className="text-sm font-medium">
        {displayLabel}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Input
        type={field.type === "number" ? "number" : "text"}
        placeholder={displayLabel}
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
