import type { FieldSchema } from "@/shared/ui/dynamic-field"
import {
  oldContractFieldsFull,
  newContractFieldsFull,
} from "@/features/dynamic-form"

/** Группа полей в layout */
export type FieldGroupLayout = {
  title?: string
  fields: FieldSchema[]
}

/** Layout для конкретного типа уведомления */
export type NotificationTypeLayout = {
  notificationTypeCode: string
  groups: FieldGroupLayout[]
}

export const NOTIFICATION_TYPE_LAYOUTS: NotificationTypeLayout[] = [
  {
    notificationTypeCode: "contract_extension",
    groups: [
      {
        title: "Предыдущий контракт",
        fields: oldContractFieldsFull({ required: true }),
      },
      {
        title: "Новый контракт",
        fields: newContractFieldsFull({ required: true }),
      },
    ],
  },
  {
    notificationTypeCode: "new_contract",
    groups: [
      {
        title: "Предыдущий контракт",
        fields: oldContractFieldsFull({ required: true }),
      },
      {
        title: "Новый контракт",
        fields: newContractFieldsFull({ required: true }),
      },
    ],
  },
]

export function getNotificationTypeLayout(code: string): NotificationTypeLayout | undefined {
  return NOTIFICATION_TYPE_LAYOUTS.find((l) => l.notificationTypeCode === code)
}
