import { ru, type UserSettingsDict } from "./ru"

export { ru } from "./ru"
export { en } from "./en"
export type { UserSettingsDict } from "./ru"

/** Глубокий Partial для переопределения словаря хостом. */
export type DeepPartialDict<T> = {
  [K in keyof T]?: T[K] extends Record<string, string>
    ? Record<string, string>
    : T[K] extends object
      ? DeepPartialDict<T[K]>
      : T[K]
}

export type UserSettingsDictOverride = DeepPartialDict<UserSettingsDict>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T)) as T
  }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    const baseValue = (base as Record<string, unknown>)[key]
    out[key] =
      isPlainObject(baseValue) && isPlainObject(value)
        ? deepMerge(baseValue, value)
        : value
  }
  return out as T
}

/** Слияние словаря по умолчанию (ru) с переопределениями хоста. */
export function resolveDict(
  override?: UserSettingsDictOverride,
  base: UserSettingsDict = ru,
): UserSettingsDict {
  if (!override) return base
  return deepMerge(base, override)
}
