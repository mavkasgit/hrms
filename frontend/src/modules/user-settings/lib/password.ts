/**
 * Простая оценка надёжности пароля (0..4).
 * Не заменяет серверную политику, но даёт мгновенную обратную связь.
 */

export type PasswordStrength = {
  /** 0 — пустой/очень слабый, 4 — отличный. */
  score: 0 | 1 | 2 | 3 | 4
}

export function estimatePasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0 }

  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-zа-яё]/.test(password) && /[A-ZА-ЯЁ]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^a-zа-яёA-ZА-ЯЁ\d\s]/.test(password)) score += 1

  // Штраф за однообразие (aaaa, 1111, qwerty-подобные повторы).
  if (/^(.)\1+$/.test(password)) score = Math.min(score, 1)

  return { score: Math.min(4, Math.max(1, score)) as PasswordStrength["score"] }
}
