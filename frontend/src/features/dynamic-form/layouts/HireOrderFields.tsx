import { FieldGroup } from "../components/FieldGroup"
import { FieldRenderer, type FieldSchema } from "../components/FieldRenderer"
import { QuickOptions } from "../components/QuickOptions"

type HireOrderFieldsProps = {
  fieldSchema: FieldSchema[]
  extraFields: Record<string, string | number>
  extraFieldErrors: Record<string, string | undefined>
  onFieldChange: (key: string, value: string | number) => void
}

export function HireOrderFields({ fieldSchema, extraFields, extraFieldErrors, onFieldChange }: HireOrderFieldsProps) {
  const hireDate = fieldSchema.find(f => f.key === "hire_date")
  const contractEnd = fieldSchema.find(f => f.key === "contract_end")
  const trialEnd = fieldSchema.find(f => f.key === "trial_end")
  const otherFields = fieldSchema.filter(f => !["hire_date", "contract_end", "trial_end"].includes(f.key))

  const contractEndWithQuick = contractEnd
    ? { ...contractEnd, quickOptions: [
        { label: "1 год", years: 1, unit: "years" as const },
        { label: "2 года", years: 2, unit: "years" as const },
        { label: "3 года", years: 3, unit: "years" as const },
      ]}
    : null

  const trialEndWithQuick = trialEnd
    ? { ...trialEnd, quickOptions: [
        { label: "2 мес", months: 2, unit: "months" as const },
        { label: "3 мес", months: 3, unit: "months" as const },
      ]}
    : null

  return (
    <div className="space-y-3">
      <FieldGroup>
        {hireDate && (
          <FieldRenderer
            field={{ ...hireDate, quickOptions: undefined }}
            value={extraFields[hireDate.key]}
            error={extraFieldErrors[`extra_${hireDate.key}`]}
            onChange={onFieldChange}
            extraFields={extraFields}
          />
        )}
        {contractEndWithQuick && (
          <FieldRenderer
            field={{ ...contractEndWithQuick, quickOptions: undefined }}
            value={extraFields[contractEndWithQuick.key]}
            error={extraFieldErrors[`extra_${contractEndWithQuick.key}`]}
            onChange={onFieldChange}
            extraFields={extraFields}
          />
        )}
        {otherFields.filter(f => f.type === "date").map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={extraFields[field.key]}
            error={extraFieldErrors[`extra_${field.key}`]}
            onChange={onFieldChange}
            extraFields={extraFields}
          />
        ))}
      </FieldGroup>

      {contractEndWithQuick && (
        <QuickOptions
          options={contractEndWithQuick.quickOptions!}
          baseDate={extraFields["hire_date"] as string | undefined}
          targetFieldKey="contract_end"
          countFieldKey="contract_end_years"
          extraFields={extraFields}
          onChange={onFieldChange}
        />
      )}

      {trialEndWithQuick && (
        <>
          <FieldGroup className="pt-2">
            <FieldRenderer
              field={{ ...trialEndWithQuick, quickOptions: undefined }}
              value={extraFields[trialEndWithQuick.key]}
              error={extraFieldErrors[`extra_${trialEndWithQuick.key}`]}
              onChange={onFieldChange}
              extraFields={extraFields}
            />
          </FieldGroup>
          <QuickOptions
            options={trialEndWithQuick.quickOptions!}
            baseDate={extraFields["hire_date"] as string | undefined}
            targetFieldKey="trial_end"
            countFieldKey="trial_end_months"
            extraFields={extraFields}
            onChange={onFieldChange}
          />
        </>
      )}

      {otherFields.filter(f => f.type !== "date").map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={extraFields[field.key]}
          error={extraFieldErrors[`extra_${field.key}`]}
          onChange={onFieldChange}
          extraFields={extraFields}
        />
      ))}
    </div>
  )
}
