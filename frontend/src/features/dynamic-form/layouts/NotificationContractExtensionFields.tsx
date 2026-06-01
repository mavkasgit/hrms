import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { addYearsToDate } from "@/shared/utils/date"
import { FieldGroup } from "../components/FieldGroup"
import { QuickOptions } from "../components/QuickOptions"

type NotificationContractExtensionFieldsProps = {
  extraFields: Record<string, string | number>
  extraFieldErrors: Record<string, string | undefined>
  onFieldChange: (key: string, value: string | number) => void
}

export function NotificationContractExtensionFields({ extraFields, extraFieldErrors, onFieldChange }: NotificationContractExtensionFieldsProps) {
  const handleOldContractEndChange = (val: string) => {
    onFieldChange("old_contract_end", val)
    if (val) {
      const d = new Date(val + "T00:00:00")
      d.setDate(d.getDate() + 1)
      const newStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      onFieldChange("new_contract_start", newStart)
      const years = extraFields["new_contract_years"] as number | undefined
      if (years && years > 0) {
        const endDate = addYearsToDate(newStart, years)
        onFieldChange("contract_new_end", endDate)
      }
    }
  }

  const handleStartDateChange = (val: string) => {
    const years = extraFields["new_contract_years"] as number | undefined
    onFieldChange("new_contract_start", val)
    if (years && years > 0 && val) {
      const endDate = addYearsToDate(val, years)
      onFieldChange("contract_new_end", endDate)
    }
  }

  const newStartValue = extraFields["new_contract_start"] as string | undefined

  return (
    <div className="space-y-3">
      {/* Old contract */}
      <FieldGroup title="Предыдущий контракт">
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
            placeholder="Номер контракта"
            value={(extraFields["old_contract_number"] as string) || ""}
            onChange={(e) => onFieldChange("old_contract_number", e.target.value)}
            className="w-[130px] mt-1"
          />
          {extraFieldErrors[`extra_old_contract_number`] && (
            <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_old_contract_number`]}</p>
          )}
        </div>
      </FieldGroup>

      {/* New contract */}
      <FieldGroup title="Новый контракт" className="pt-2">
        <div>
          <DatePicker
            label="Дата начала"
            value={(extraFields["new_contract_start"] as string) || ""}
            onChange={handleStartDateChange}
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
        <div>
          <label className="text-sm font-medium">Номер контракта</label>
          <Input
            placeholder="Номер контракта"
            value={(extraFields["new_contract_number"] as string) || ""}
            onChange={(e) => onFieldChange("new_contract_number", e.target.value)}
            className="w-[130px] mt-1"
          />
          {extraFieldErrors[`extra_new_contract_number`] && (
            <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_new_contract_number`]}</p>
          )}
        </div>
      </FieldGroup>

      {/* Quick options for years */}
      <QuickOptions
        options={[
          { label: "1 год", years: 1 },
          { label: "2 года", years: 2 },
          { label: "3 года", years: 3 },
        ]}
        baseDate={newStartValue}
        targetFieldKey="new_contract_end"
        countFieldKey="new_contract_years"
        extraFields={extraFields}
        onChange={onFieldChange}
      />
    </div>
  )
}
