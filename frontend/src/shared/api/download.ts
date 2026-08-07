import api from "@/shared/api/client"

/** Извлекает имя файла из Content-Disposition (RFC 5987 filename*=UTF-8'' и filename="..."). */
export function extractFilenameFromContentDisposition(
  header: string | null | undefined,
  fallback: string
): string {
  if (!header) return fallback

  const star = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      // повреждённая percent-кодировка — пробуем plain filename ниже
    }
  }

  const plain = header.match(/filename="?([^";]+)"?/i)
  if (plain?.[1]) {
    return plain[1].trim().replace(/^"|"$/g, "")
  }

  return fallback
}

/**
 * Скачивание файла через общий axios-инстанс: токен остаётся в заголовке
 * Authorization (не в URL), как у остальных API-запросов.
 * Имя файла берётся из Content-Disposition, иначе — fallback.
 */
export async function downloadFile(url: string, fallbackFilename: string): Promise<void> {
  const response = await api.get(url, { responseType: "blob" })
  const header = response.headers?.["content-disposition"] as string | undefined
  const filename = extractFilenameFromContentDisposition(header, fallbackFilename)

  const objectUrl = window.URL.createObjectURL(response.data as Blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(objectUrl)
}
