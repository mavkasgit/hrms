import type { DocumentSectionConfig } from "./DocumentSection"
import {
  useNotifications,
  useCreateNotificationDraft,
  useDeleteNotification,
  useNotificationTypes,
  useNextNotificationNumber,
} from "@/entities/notification/hooks"
import { openNotificationView, openNotificationEdit, openNotificationPrint, downloadNotificationDocx } from "@/entities/notification/api"
import type { Notification, NotificationCreate, NotificationType } from "@/entities/notification/types"
import { getNotificationTypeLayout } from "@/entities/notification/notificationTypeLayouts"
import { getFormDataExtraFields, getFormDataInt, getFormDataValue } from "@/entities/draft"
import type { DraftFormData } from "@/entities/draft"

interface NotificationFormDraft {
  employee_id: number | null
  notification_type_id: number | null
  notification_date: string
  notification_number: string
  extra_fields: Record<string, string | number>
  saved_at: string
}

function notificationHasContent(state: Omit<NotificationFormDraft, "saved_at">): boolean {
  return (
    state.employee_id !== null ||
    state.notification_type_id !== null ||
    state.notification_number.trim() !== "" ||
    Object.values(state.extra_fields).some((v) => v !== "" && v !== null && v !== undefined)
  )
}

/** «Заполнить поля» из попапа черновиков: маппинг form-data серверного черновика. */
function mapNotificationFillDraft(data: DraftFormData): NotificationFormDraft | null {
  if (data.kind !== "notification") return null
  return {
    employee_id: getFormDataInt(data.data, "employee_id"),
    notification_type_id: getFormDataInt(data.data, "notification_type_id"),
    notification_date: getFormDataValue(data.data, "date") || new Date().toISOString().split("T")[0],
    notification_number: getFormDataValue(data.data, "number") || "",
    extra_fields: getFormDataExtraFields(data.data, ["employee_id", "notification_type_id", "number", "date"]),
    saved_at: new Date().toISOString(),
  }
}

export const notificationsConfig: DocumentSectionConfig<
  Notification,
  NotificationType,
  NotificationCreate,
  { draft_id: string; notification_id: number },
  NotificationFormDraft
> = {
  kind: "notification",
  slot: "notifications",
  fillDraftRoute: "/orders/notifications",
  saveMessageType: "hrms:notification-save",
  editorWindowPrefix: "hrms-notification-editor-",

  labels: {
    createHeading: "Создать уведомление",
    createButton: "Создать уведомление",
    dateLabel: "Дата уведомления",
    numberLabel: "Номер уведомления",
    typeLabel: "Тип уведомления",
    emptyListMessage: "Уведомления не найдены",
    emptyListDescription: "Создайте первое уведомление или измените фильтры",
    emptyListLabel: "Уведомлений пока нет",
    popoverTitle: "Последние уведомления",
    deleteTitle: "Удалить уведомление?",
    editorNote: "уведомления",
    titlePrefix: "Уведомление",
  },

  useList: (filters) =>
    useNotifications({
      page: filters.page,
      per_page: filters.per_page,
      number: filters.number,
      date_from: filters.date_from,
      date_to: filters.date_to,
      employee_id: filters.employee_id,
      notification_type_id: filters.typeId,
    }),
  useTypes: (activeOnly) => useNotificationTypes(activeOnly),
  useCreateDraft: () => useCreateNotificationDraft(),
  useDelete: () => useDeleteNotification(),
  useNextNumber: () => useNextNotificationNumber(),
  useRecentItems: () => useNotifications({ page: 1, per_page: 100 }),

  openView: openNotificationView,
  openEdit: openNotificationEdit,
  openPrint: openNotificationPrint,
  downloadDocx: downloadNotificationDocx,
  getTypeLayout: getNotificationTypeLayout,
  typeNameOf: (item) => item.notification_type_name,
  editDraftUrl: (draft) => `/notifications/${draft.notification_id}/edit-docx`,
  buildCreatePayload: ({ title, number, date, employeeId, typeId, extraFields }) => ({
    title,
    number,
    date,
    employee_id: employeeId,
    notification_type_id: typeId,
    extra_fields: extraFields,
  }),

  mapFillDraft: mapNotificationFillDraft,
  draft: {
    hasContent: notificationHasContent,
    fromValues: (values) => ({
      employee_id: values.employee_id,
      notification_type_id: values.type_id,
      notification_date: values.date,
      notification_number: values.number,
      extra_fields: values.extra_fields,
    }),
    toValues: (draft) => ({
      employee_id: draft.employee_id,
      type_id: draft.notification_type_id,
      date: draft.notification_date,
      number: draft.notification_number,
      extra_fields: draft.extra_fields,
    }),
  },
}
