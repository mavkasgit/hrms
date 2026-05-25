import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"

type ContractExtensionFieldsProps = {
  extraFields: Record<string, string | number>
  extraFieldErrors: Record<string, string | undefined>
  onFieldChange: (key: string, value: string | number) => void
}

export function ContractExtensionFields({ extraFields, extraFieldErrors, onFieldChange }: ContractExtensionFieldsProps) {
  const handleOldContractEndChange = (val: string) => {
    onFieldChange("old_contract_end", val)
    if (val) {
      const d = new Date(val + "T00:00:00")
      d.setDate(d.getDate() + 1)
      const newStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      onFieldChange("new_contract_start", newStart)
      const years = extraFields["new_contract_years"] as number | undefined
      if (years && years > 0) {
        const endDate = calculateEndDate(newStart, years)
        onFieldChange("new_contract_end", endDate)
      }
    }
  }

  const handleNewStartChange = (val: string) => {
    onFieldChange("new_contract_start", val)
    const years = extraFields["new_contract_years"] as number | undefined
    if (years && years > 0 && val) {
      const endDate = calculateEndDate(val, years)
      onFieldChange("new_contract_end", endDate)
    }
  }

  return (
    <div className="space-y-4">
      {/* Old contract */}
      <div>
        <h4 className="text-sm font-semibold text-muted-foreground mb-2">Предыдущий контракт</h4>
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <DatePicker
              label="Дата начала"
              value={(extraFields["old_contract_start"] as string) || ""}
              onChange={(v) => onFieldChange("old_contract_start", v)}
              required
            />
            {extraFieldErrors[`extra_old_contract_start`] && (
              <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_old_contract_start`]}</p>
            )}
          </div>
          <div>
            <DatePicker
              label="Дата окончания"
              value={(extraFields["old_contract_end"] as string) || ""}
              onChange={handleOldContractEndChange}
              required
            />
            {extraFieldErrors[`extra_old_contract_end`] && (
              <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_old_contract_end`]}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Номер контракта</label>
            <Input
              placeholder="Номер"
              value={(extraFields["old_contract_number"] as string) || ""}
              onChange={(e) => onFieldChange("old_contract_number", e.target.value)}
              className="w-[150px] mt-1"
            />
            {extraFieldErrors[`extra_old_contract_number`] && (
              <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_old_contract_number`]}</p>
            )}
          </div>
        </div>
      </div>

      {/* New contract */}
      <div>
        <h4 className="text-sm font-semibold text-muted-foreground mb-2">Новый контракт</h4>
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <DatePicker
              label="Дата начала"
              value={(extraFields["new_contract_start"] as string) || ""}
              onChange={handleNewStartChange}
              required
            />
            {extraFieldErrors[`extra_new_contract_start`] && (
              <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_new_contract_start`]}</p>
            )}
          </div>
          <div>
            <DatePicker
              label="Дата окончания"
              value={(extraFields["new_contract_end"] as string) || ""}
              onChange={(v) => onFieldChange("new_contract_end", v)}
              required
            />
            {extraFieldErrors[`extra_new_contract_end`] && (
              <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_new_contract_end`]}</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick options for years */}
      <div className="flex gap-2 items-center">
        {[1, 2, 3].map((years) => (
          <button
            key={years}
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-input bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => {
              const startDate = extraFields["new_contract_start"] as string | undefined
              if (startDate) {
                const endDate = calculateEndDate(startDate, years)
                onFieldChange("new_contract_years", years)
                onFieldChange("new_contract_end", endDate)
              }
            }}
          >
            {years === 1 ? "1 год" : years === 2 ? "2 года" : "3 года"}
          </button>
        ))}
        <label className="text-xs text-muted-foreground whitespace-nowrap">лет:</label>
        <input
          type="number"
          min="1"
          max="99"
          value={extraFields["new_contract_years"] !== undefined && extraFields["new_contract_years"] !== "" ? String(extraFields["new_contract_years"]) : ""}
          onChange={(e) => {
            const val = e.target.value
            const years = val ? parseInt(val, 10) : 0
            if (years > 0) {
              const startDate = extraFields["new_contract_start"] as string | undefined
              if (startDate) {
                const endDate = calculateEndDate(startDate, years)
                onFieldChange("new_contract_years", years)
                onFieldChange("new_contract_end", endDate)
              }
            }
          }}
          className="w-12 h-7 text-xs rounded border border-input bg-background px-1 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}

function calculateEndDate(startDate: string, years: number): string {
  const d = new Date(startDate + "T00:00:00")
  d.setFullYear(d.getFullYear() + years)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
