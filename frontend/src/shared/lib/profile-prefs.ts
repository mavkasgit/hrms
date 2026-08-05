/** Locale / theme prefs from unified profile (IdP cache + localStorage stub). */

export type ProfileLocale = "ru" | "en"
export type ProfileTheme = "system" | "light" | "dark"

const LOCALE_KEY = "profile_locale"
const THEME_KEY = "profile_theme"

export function applyTheme(theme: ProfileTheme | string | null | undefined): void {
  if (typeof document === "undefined") return
  const t = (theme || "light") as ProfileTheme
  const root = document.documentElement
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches

  if (t === "dark" || (t === "system" && prefersDark)) {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
}

export function storeLocale(locale: ProfileLocale | string | null | undefined): void {
  if (!locale) return
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    /* ignore */
  }
}

export function readStoredTheme(): ProfileTheme | null {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === "system" || v === "light" || v === "dark") return v
  } catch {
    /* ignore */
  }
  return null
}
