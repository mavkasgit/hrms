import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { FieldGroup } from "../components/FieldGroup"

type StatementContractExpiryFieldsProps = {
  extraFields: Record<string, string | number>
  extraFieldErrors: Record<string, string | undefined>
  onFieldChange: (key: string, value: string | number) => void
}

export function StatementContractExpiryFields({ extraFields, extraFieldErrors, onFieldChange }: StatementContractExpiryFieldsProps) {
  return (
    <FieldGroup>
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
      <div>
        <DatePicker
          label="Дата начала контракта"
          value={(extraFields["old_contract_start"] as string) || ""}
          onChange={(v) => onFieldChange("old_contract_start", v)}
          required
        />
        {extraFieldErrors[`extra_old_contract_start`] && (
          <p className="text-xs text-red-500 mt-1">{extraFieldErrors[`extra_old_contract_start`]}</p>
        )}
      </div>
    </FieldGroup>
  )
}
