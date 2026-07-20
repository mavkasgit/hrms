import { useEffect, useState } from "react"
import { Check, Loader2, Monitor, Moon, Palette, Sun } from "lucide-react"
import { useUserSettings } from "../context"
import type { UserLocale, UserTheme } from "../types"
import { cn } from "../ui"
import { Card, CardHeader } from "./ui-bits"

const THEMES: Array<{ value: UserTheme; icon: typeof Sun }> = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
]

/**
 * Панель «Внешний вид»: тема (мгновенный optimistic-apply) и язык.
 * Автосохранение при выборе — без кнопки «Сохранить».
 */
export function AppearancePanel() {
  const { api, dict, profile, refreshProfile, applyTheme, applyLocale, notify } =
    useUserSettings()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const theme: UserTheme = profile?.theme ?? "system"
  const locale: UserLocale = profile?.locale ?? "ru"

  const themeLabels: Record<UserTheme, string> = {
    light: dict.appearance.themeLight,
    dark: dict.appearance.themeDark,
    system: dict.appearance.themeSystem,
  }

  // Ошибку показываем недолго — следующий клик её сбросит.
  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => setError(null), 5000)
    return () => window.clearTimeout(t)
  }, [error])

  const selectTheme = async (next: UserTheme) => {
    if (pending || next === theme) return
    setPending(`theme:${next}`)
    setError(null)
    applyTheme(next) // мгновенный визуальный отклик
    try {
      await api.updateProfile({ theme: next })
      await refreshProfile()
    } catch {
      applyTheme(theme) // откат
      setError(dict.errors.profile)
      notify?.({ title: dict.errors.profile, variant: "destructive" })
    } finally {
      setPending(null)
    }
  }

  const selectLocale = async (next: UserLocale) => {
    if (pending || next === locale) return
    setPending(`locale:${next}`)
    setError(null)
    applyLocale(next)
    try {
      await api.updateProfile({ locale: next })
      await refreshProfile()
    } catch {
      applyLocale(locale)
      setError(dict.errors.profile)
      notify?.({ title: dict.errors.profile, variant: "destructive" })
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={Palette}
          title={dict.appearance.themeLabel}
          description={dict.appearance.hint}
        />
        <div
          role="radiogroup"
          aria-label={dict.appearance.themeLabel}
          className="grid grid-cols-3 gap-2"
        >
          {THEMES.map(({ value, icon: Icon }) => {
            const active = theme === value
            const isPending = pending === `theme:${value}`
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending !== null}
                onClick={() => void selectTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-primary bg-primary/5 text-foreground shadow-sm shadow-primary/10"
                    : "border-border/80 bg-background text-muted-foreground hover:border-border hover:bg-accent/50",
                  pending !== null && "opacity-60",
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {isPending && (
                    <Loader2 className="absolute -right-3 -top-1 h-3.5 w-3.5 animate-spin text-primary" />
                  )}
                </span>
                <span className="flex items-center gap-1 text-xs font-medium">
                  {themeLabels[value]}
                  {active && !isPending && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
              </button>
            )
          })}
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </Card>

      <Card>
        <CardHeader title={dict.appearance.localeLabel} />
        <div
          role="radiogroup"
          aria-label={dict.appearance.localeLabel}
          className="grid grid-cols-2 gap-2"
        >
          {(["ru", "en"] as const).map((value) => {
            const active = locale === value
            const isPending = pending === `locale:${value}`
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending !== null}
                onClick={() => void selectLocale(value)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-primary bg-primary/5 text-foreground shadow-sm shadow-primary/10"
                    : "border-border/80 bg-background text-muted-foreground hover:border-border hover:bg-accent/50",
                  pending !== null && "opacity-60",
                )}
              >
                {value === "ru" ? "Русский" : "English"}
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : active ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : null}
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
