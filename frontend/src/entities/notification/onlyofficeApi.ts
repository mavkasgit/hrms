import axios from "@/shared/api/client"
import type { OnlyOfficeForceSaveResponse, OnlyOfficeSaveStatusResponse } from "@/entities/order/onlyofficeTypes"

export async function forceSaveNotification(
  notificationId: number,
  documentKey: string,
  saveId?: string,
) {
  const { data } = await axios.post<OnlyOfficeForceSaveResponse>(
    `/notifications/${notificationId}/onlyoffice/forcesave`,
    { document_key: documentKey, save_id: saveId },
    { skipGlobalToast: true },
  )
  return data
}

export async function fetchNotificationSaveStatus(notificationId: number, saveId: string) {
  const { data } = await axios.get<OnlyOfficeSaveStatusResponse>(
    `/notifications/${notificationId}/onlyoffice/save-status/${saveId}`,
    { skipGlobalToast: true },
  )
  return data
}

/** Явный commit черновика уведомления из редактора (#86): is_draft=False. */
export async function commitNotificationDraft(notificationId: number) {
  const { data } = await axios.post<{ message: string }>(`/notifications/${notificationId}/commit`)
  return data
}
