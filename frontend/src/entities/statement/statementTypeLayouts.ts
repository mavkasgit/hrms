import type { FieldSchema } from "@/shared/ui/dynamic-field"
import {
  vacationPeriodFields,
} from "@/features/dynamic-form"

/** Группа полей в layout */
export type FieldGroupLayout = {
  title?: string
  fields: FieldSchema[]
}

/** Layout для конкретного типа заявления */
export type StatementTypeLayout = {
  statementTypeCode: string
  groups: FieldGroupLayout[]
}

export const STATEMENT_TYPE_LAYOUTS: StatementTypeLayout[] = [
  {
    statementTypeCode: "transfer",
    groups: [
      {
        fields: [
          { key: "transfer_date", label: "Дата перевода", type: "date", required: false },
          { key: "transfer_reason", label: "Основание", type: "textarea", required: false },
        ],
      },
    ],
  },
  {
    statementTypeCode: "dismissal",
    groups: [
      {
        fields: [
          { key: "dismissal_date", label: "Дата увольнения", type: "date", required: true },
        ],
      },
    ],
  },
  {
    statementTypeCode: "vacation",
    groups: [
      {
        fields: vacationPeriodFields(),
      },
    ],
  },
  {
    statementTypeCode: "contract_expiry",
    groups: [
      {
        fields: [
          { key: "old_contract_start", label: "Дата начала контракта", type: "date", required: true },
          { key: "old_contract_number", label: "Номер контракта", type: "text", required: false },
        ],
      },
    ],
  },
]

export function getStatementTypeLayout(code: string): StatementTypeLayout | undefined {
  return STATEMENT_TYPE_LAYOUTS.find((l) => l.statementTypeCode === code)
}
