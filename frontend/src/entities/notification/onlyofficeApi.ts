import axios from "@/shared/api/axios"

export async function forceSaveNotification(notificationId: number, documentKey: string) {
  const { data } = await axios.post(`/notifications/${notificationId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}
