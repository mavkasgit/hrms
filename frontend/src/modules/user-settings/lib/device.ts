/**
 * Эвристика типа устройства по device_label / user_agent.
 * Сознательно простая: точный парсинг UA — не задача модуля.
 */

export type DeviceKind = "mobile" | "tablet" | "desktop" | "unknown"

export function detectDeviceKind(
  deviceLabel?: string | null,
  userAgent?: string | null,
): DeviceKind {
  const source = `${deviceLabel ?? ""} ${userAgent ?? ""}`.toLowerCase()
  if (!source.trim()) return "unknown"
  if (/ipad|tablet/.test(source)) return "tablet"
  if (/mobile|android|iphone|phone/.test(source)) return "mobile"
  if (/windows|macintosh|mac os|linux|x11|desktop|pc/.test(source)) return "desktop"
  return "unknown"
}
