/**
 * Утилиты для работы с аватарами пользователей.
 *
 * Multiavatar генерирует уникальный SVG детерминированно по seed-строке.
 * Чтобы аватар был стабильным и уникальным, выбираем seed по приоритету:
 *   1. avatar_seed   — пользователь/админ явно задал (фаза 2)
 *   2. telegram_id   — уникален для привязанных к Telegram
 *   3. username      — уникален, всегда есть
 *   4. id            — крайний fallback для анонимных записей
 */

export type UserLike = {
  avatar_seed?: string | null
  telegram_id?: number | string | null
  username?: string | null
  id?: number | string | null
}

/**
 * Выбрать seed для Multiavatar по приоритету.
 * Возвращает `string` если нашли, иначе `null` (компонент покажет fallback).
 */
export function getUserSeed(user: UserLike | null | undefined): string | null {
  if (!user) return null
  if (user.avatar_seed) return user.avatar_seed
  if (user.telegram_id != null) return String(user.telegram_id)
  if (user.username) return user.username
  if (user.id != null) return String(user.id)
  return null
}

/**
 * Сгенерировать случайный seed для кнопки «обновить аватар».
 * 8 hex-символов (4 байта) — даёт ~4 млрд уникальных аватаров,
 * помещается в VARCHAR(64).
 */
export function generateRandomSeed(): string {
  const bytes = new Uint8Array(4)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Fallback для очень старых сред без crypto
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
