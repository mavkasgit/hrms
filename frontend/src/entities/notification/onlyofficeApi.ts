import axios from "@/shared/api/client"

export async function forceSaveNotification(notificationId: number, documentKey: string) {
  const { data } = await axios.post(`/notifications/${notificationId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}

/** Явный commit черновика уведомления из редактора (#86): is_draft=False. */
export async function commitNotificationDraft(notificationId: number) {
  const { data } = await axios.post<{ message: string }>(`/notifications/${notificationId}/commit`)
  return data
}
