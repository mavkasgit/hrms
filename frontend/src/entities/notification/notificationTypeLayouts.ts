import type { FieldSchema } from "@/features/dynamic-form/components/FieldRenderer"
import {
  oldContractFields,
  newContractFields,
  type QuickOption,
} from "@/features/dynamic-form"

export type { QuickOption } from "@/features/dynamic-form"

/** Группа полей в layout */
export type FieldGroupLayout = {
  title?: string
  fields: (FieldSchema & { quickOptions?: QuickOption[] })[]
  standaloneFields?: (FieldSchema & { quickOptions?: QuickOption[] })[]
}

/** Layout для конкретного типа уведомления */
export type NotificationTypeLayout = {
  notificationTypeCode: string
  groups: FieldGroupLayout[]
  standaloneFields?: (FieldSchema & { quickOptions?: QuickOption[] })[]
}

export const NOTIFICATION_TYPE_LAYOUTS: NotificationTypeLayout[] = [
  {
    notificationTypeCode: "contract_extension",
    groups: [
      {
        title: "Предыдущий контракт",
        fields: oldContractFields({ required: true }) as (FieldSchema & { quickOptions?: QuickOption[] })[],
      },
      {
        title: "Новый контракт",
        fields: newContractFields({ required: true }) as (FieldSchema & { quickOptions?: QuickOption[] })[],
      },
    ],
    standaloneFields: [],
  },
  {
    notificationTypeCode: "new_contract",
    groups: [
      {
        title: "Предыдущий контракт",
        fields: oldContractFields({ required: true }) as (FieldSchema & { quickOptions?: QuickOption[] })[],
      },
      {
        title: "Новый контракт",
        fields: newContractFields({ required: true }) as (FieldSchema & { quickOptions?: QuickOption[] })[],
      },
    ],
    standaloneFields: [],
  },
]

export function getNotificationTypeLayout(code: string): NotificationTypeLayout | undefined {
  return NOTIFICATION_TYPE_LAYOUTS.find((l) => l.notificationTypeCode === code)
}
