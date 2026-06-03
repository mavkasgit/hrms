import type { FieldSchema } from "@/features/dynamic-form/components/FieldRenderer"
import {
  vacationPeriodFields,
  oldContractFields,
  type QuickOption,
} from "@/features/dynamic-form"

export type { QuickOption } from "@/features/dynamic-form"

/** Группа полей в layout */
export type FieldGroupLayout = {
  title?: string
  fields: (FieldSchema & { quickOptions?: QuickOption[] })[]
  standaloneFields?: (FieldSchema & { quickOptions?: QuickOption[] })[]
}

/** Layout для конкретного типа заявления */
export type StatementTypeLayout = {
  statementTypeCode: string
  groups: FieldGroupLayout[]
  standaloneFields?: (FieldSchema & { quickOptions?: QuickOption[] })[]
}

export const STATEMENT_TYPE_LAYOUTS: StatementTypeLayout[] = [
  {
    statementTypeCode: "transfer",
    groups: [
      {
        fields: [
          { key: "transfer_date", label: "Дата перевода", type: "date", required: false, enabled: true },
        ],
      },
    ],
  },
  {
    statementTypeCode: "dismissal",
    groups: [
      {
        fields: [
          { key: "dismissal_date", label: "Дата увольнения", type: "date", required: true, enabled: true },
        ],
      },
    ],
  },
  {
    statementTypeCode: "vacation",
    groups: [
      {
        title: "Период отпуска",
        fields: vacationPeriodFields({ required: true }) as (FieldSchema & { quickOptions?: QuickOption[] })[],
      },
    ],
  },
  {
    statementTypeCode: "contract_expiry",
    groups: [
      {
        title: "Предыдущий контракт",
        fields: oldContractFields({ required: true }) as (FieldSchema & { quickOptions?: QuickOption[] })[],
      },
    ],
  },
]

export function getStatementTypeLayout(code: string): StatementTypeLayout | undefined {
  return STATEMENT_TYPE_LAYOUTS.find((l) => l.statementTypeCode === code)
}
