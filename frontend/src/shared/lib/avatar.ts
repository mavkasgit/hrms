/**
 * Утилиты для работы с аватарами пользователей.
 *
 * Multiavatar по seed-строке. Два случая:
 *   1. create — бэкенд выдаёт случайный avatar_seed
 *   2. смена в профиле — пользователь выбирает другой seed
 *
 * Без avatar_seed (null) — пустая заглушка, без привязки к username/tg.
 */

export type UserLike = {
  avatar_seed?: string | null
}

/**
 * Seed для Multiavatar — только явно сохранённый avatar_seed.
 * null → UserAvatar покажет пустую заглушку.
 */
export function getUserSeed(user: UserLike | null | undefined): string | null {
  if (!user?.avatar_seed) return null
  return user.avatar_seed
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
