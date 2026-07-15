import { useEffect, useState } from "react"
import { Eye, EyeOff, Loader2, Save, Trash2 } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { TelegramIcon } from "@/shared/ui/icons"
import { showGlobalToast } from "@/shared/ui/use-toast"
import { adminSettingsApi } from "@/entities/admin-settings/api"
import {
  KNOWN_SETTING_KEYS,
  type SystemSettingItem,
} from "@/entities/admin-settings/types"

const TOKEN_KEY = KNOWN_SETTING_KEYS.TELEGRAM_BOT_TOKEN

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

/** Только ФИО; логин в UI не показываем (он только в настройках пользователя). */
function formatActor(fullName: string | null | undefined): string | null {
  const name = (fullName || "").trim()
  return name || null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TelegramBotModal({ open, onOpenChange }: Props) {
  const [item, setItem] = useState<SystemSettingItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [draft, setDraft] = useState("")
  const [dirty, setDirty] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const res = await adminSettingsApi.fetchAll()
      const found = res.settings.find((s) => s.key === TOKEN_KEY) ?? null
      setItem(found)
      setDraft("")
      setDirty(false)
      setShowToken(false)
    } catch (err) {
      console.error("Failed to load telegram bot settings", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      void reload()
    }
  }, [open])

  const handleSave = async () => {
    if (!dirty || !draft.trim()) return
    setSaving(true)
    try {
      await adminSettingsApi.update({ [TOKEN_KEY]: draft.trim() })
      showGlobalToast({
        title: "Токен сохранён",
        description: "Новый токен будет использован сразу.",
        variant: "default",
      })
      await reload()
    } catch (err) {
      console.error("Failed to save telegram bot token", err)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!item?.has_value) return
    setClearing(true)
    try {
      await adminSettingsApi.update({ [TOKEN_KEY]: null })
      showGlobalToast({
        title: "Токен сброшен",
        description: "Будет использован fallback из .env, если задан.",
        variant: "default",
      })
      await reload()
    } catch (err) {
      console.error("Failed to clear telegram bot token", err)
    } finally {
      setClearing(false)
    }
  }

  const configured = !!item?.has_value
  // Поле только для нового ввода. Глаз маскирует draft, не подставляет старый token из БД
  // (старый уже виден строкой «Маска» ниже — API отдаёт только ****хвост).
  // type="text" + CSS mask: не type="password", чтобы браузер не предлагал «Сохранить пароль».
  const inputValue = draft
  const inputPlaceholder = configured
    ? "Новый токен для замены"
    : "Токен от @BotFather"
  const maskInput = !showToken
  const lastActor = formatActor(item?.updated_by_full_name)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-primary/10 shrink-0">
              <TelegramIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>Telegram Bot</DialogTitle>
              <DialogDescription>
                Токен бота для входа через Telegram (QR / Login).
              </DialogDescription>
            </div>
            <div className="shrink-0 pt-0.5">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : configured ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Настроено
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Не настроено
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-2">
            <label
              htmlFor="hrms-telegram-bot-api-token"
              className="text-sm font-medium leading-none"
            >
              Токен бота
            </label>
            <div className="relative">
              <Input
                id="hrms-telegram-bot-api-token"
                name="hrms-telegram-bot-api-token"
                type="text"
                inputMode="text"
                value={inputValue}
                placeholder={inputPlaceholder}
                disabled={loading || saving}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                data-protonpass-ignore="true"
                onChange={(e) => {
                  setDraft(e.target.value)
                  setDirty(e.target.value.length > 0)
                }}
                className={
                  maskInput && draft.length > 0
                    ? "pr-10 font-mono [-webkit-text-security:disc] [text-security:disc]"
                    : "pr-10 font-mono"
                }
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                disabled={loading || draft.length === 0}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                title={
                  draft.length === 0
                    ? "Сначала введите токен"
                    : showToken
                      ? "Скрыть"
                      : "Показать"
                }
                aria-label={showToken ? "Скрыть токен" : "Показать токен"}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt>Последний ввод</dt>
            <dd className="text-foreground/80">
              {configured ? (
                <>
                  {formatDateTime(item?.updated_at)}
                  {lastActor ? (
                    <span className="text-muted-foreground"> · {lastActor}</span>
                  ) : null}
                </>
              ) : (
                "ещё не сохранялся"
              )}
            </dd>
            {configured && item?.value ? (
              <>
                <dt>Маска</dt>
                <dd className="font-mono text-foreground/80">{item.value}</dd>
              </>
            ) : null}
          </dl>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {configured && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={loading || saving || clearing || dirty}
              title="Сбросить токен в БД"
            >
              {clearing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Сбросить
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={loading || saving || !dirty || !draft.trim()}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
