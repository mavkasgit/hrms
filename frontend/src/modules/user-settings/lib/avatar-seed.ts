/**
 * Seed-утилиты аватара. 8 hex-символов (4 байта) ≈ 4 млрд вариантов.
 */

/** Сгенерировать случайный seed. */
export function generateAvatarSeed(): string {
  const bytes = new Uint8Array(4)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
