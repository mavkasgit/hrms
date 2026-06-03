import type { FieldSchema } from "@/features/dynamic-form"
import {
  oldContractFields,
  vacationPeriodFields,
  oldVacationFields,
  trialEndQuickOptions,
  newContractYearsQuickOptions,
  type QuickOption,
} from "@/features/dynamic-form/sharedFieldGroups"

export type { QuickOption } from "@/features/dynamic-form/sharedFieldGroups"

/** Группа полей в layout */
export type FieldGroupLayout = {
  title?: string
  fields: (FieldSchema & { quickOptions?: QuickOption[] })[]
}

/** Layout для конкретного типа приказа */
export type OrderTypeLayout = {
  orderTypeCode: string
  groups: FieldGroupLayout[]
  standaloneFields?: (FieldSchema & { quickOptions?: QuickOption[] })[]
}

export const ORDER_TYPE_LAYOUTS: OrderTypeLayout[] = [
  {
    orderTypeCode: "hire",
    groups: [
      {
        fields: [
          { key: "hire_date", label: "Дата приема", type: "date", required: false, enabled: true },
        ],
      },
      {
        title: "Новый контракт",
        fields: [
          { key: "contract_start", label: "Начало", type: "date", required: false, enabled: true },
          { key: "contract_end", label: "Конец", type: "date", required: false, enabled: true },
          { key: "contract_number", label: "Номер", type: "text", required: false, enabled: true },
        ],
      },
    ],
    standaloneFields: [
      { key: "contract_years", label: "Срок (лет)", type: "number", required: false, enabled: true, quickOptions: newContractYearsQuickOptions },
      { key: "trial_end", label: "Конец испытательного срока", type: "date", required: false, enabled: true, quickOptions: trialEndQuickOptions },
    ],
  },
  {
    orderTypeCode: "dismissal",
    groups: [
      {
        fields: [
          { key: "dismissal_date", label: "Дата увольнения", type: "date", required: false, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "transfer",
    groups: [
      {
        fields: [
          { key: "new_position", label: "Новая должность", type: "select", required: false, enabled: true, entity: "position", allow_create: false },
        ],
      },
      {
        title: "Новый контракт",
        fields: [
          { key: "new_contract_start", label: "Начало", type: "date", required: false, enabled: true },
          { key: "new_contract_end", label: "Конец", type: "date", required: false, enabled: true },
          { key: "new_contract_number", label: "Номер", type: "text", required: false, enabled: true },
        ],
      },
    ],
    standaloneFields: [
      { key: "new_contract_years", label: "Срок (лет)", type: "number", required: false, enabled: true, quickOptions: newContractYearsQuickOptions },
    ],
  },
  {
    orderTypeCode: "contract_extension",
    groups: [
      {
        title: "Предыдущий контракт",
        fields: oldContractFields(),
      },
      {
        title: "Новый контракт",
        fields: [
          { key: "new_contract_start", label: "Начало", type: "date", required: false, enabled: true },
          { key: "new_contract_end", label: "Конец", type: "date", required: false, enabled: true },
          { key: "new_contract_number", label: "Номер", type: "text", required: false, enabled: true },
          { key: "new_contract_years", label: "Срок (лет)", type: "number", required: false, enabled: true, quickOptions: newContractYearsQuickOptions },
        ],
      },
    ],
    standaloneFields: [],
  },
  {
    orderTypeCode: "new_contract",
    groups: [
      {
        title: "Предыдущий контракт",
        fields: oldContractFields(),
      },
      {
        title: "Новый контракт",
        fields: [
          { key: "new_contract_start", label: "Начало", type: "date", required: false, enabled: true },
          { key: "new_contract_end", label: "Конец", type: "date", required: false, enabled: true },
          { key: "new_contract_number", label: "Номер", type: "text", required: false, enabled: true },
          { key: "new_contract_years", label: "Срок (лет)", type: "number", required: false, enabled: true, quickOptions: newContractYearsQuickOptions },
        ],
      },
    ],
    standaloneFields: [],
  },
  {
    orderTypeCode: "vacation_paid",
    groups: [
      {
        fields: vacationPeriodFields(),
      },
    ],
  },
  {
    orderTypeCode: "vacation_unpaid",
    groups: [
      {
        fields: vacationPeriodFields(),
      },
    ],
  },
  {
    orderTypeCode: "vacation_unpaid_group",
    groups: [
      {
        fields: [
          { key: "vacation_start", label: "Дата начала", type: "date", required: true, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "weekend_call",
    groups: [
      {
        fields: [
          { key: "call_date", label: "Дата вызова", type: "date", required: false, enabled: true },
          { key: "call_date_start", label: "Дата начала", type: "date", required: false, enabled: true },
          { key: "call_date_end", label: "Дата окончания", type: "date", required: false, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "weekend_call_group",
    groups: [
      {
        fields: [
          { key: "call_date_start", label: "Дата начала", type: "date", required: true, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "vacation_recall",
    groups: [
      {
        fields: [
          { key: "recall_date", label: "Дата отзыва", type: "date", required: true, enabled: true },
          ...oldVacationFields(),
          { key: "reason", label: "Основание", type: "text", required: false, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "vacation_postpone",
    groups: [
      {
        fields: [
          { key: "old_vacation_start", label: "Старая дата начала", type: "date", required: true, enabled: true },
          { key: "old_vacation_end", label: "Старая дата окончания", type: "date", required: true, enabled: true },
          { key: "new_vacation_start", label: "Новая дата начала", type: "date", required: true, enabled: true },
          { key: "new_vacation_end", label: "Новая дата окончания", type: "date", required: true, enabled: true },
          { key: "vacation_days", label: "Количество дней", type: "number", required: true, enabled: true },
          { key: "reason", label: "Основание", type: "text", required: false, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "vacation_extension",
    groups: [
      {
        fields: [
          ...vacationPeriodFields(),
          { key: "sick_start_date", label: "Дата начала больничного", type: "date", required: true, enabled: true },
          { key: "sick_end_date", label: "Дата окончания больничного", type: "date", required: true, enabled: true },
          { key: "comment", label: "Комментарий", type: "text", required: false, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "work_release",
    groups: [
      {
        fields: [
          { key: "event_date", label: "Дата освобождения", type: "date", required: true, enabled: true },
        ],
      },
    ],
  },
  {
    orderTypeCode: "cancel_full_workday",
    groups: [
      {
        fields: [
          { key: "event_date", label: "Дата события", type: "date", required: true, enabled: true },
        ],
      },
    ],
  },
]

export function getOrderTypeLayout(orderTypeCode: string): OrderTypeLayout | undefined {
  return ORDER_TYPE_LAYOUTS.find((l) => l.orderTypeCode === orderTypeCode)
}
