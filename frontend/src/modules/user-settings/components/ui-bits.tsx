import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, CheckCircle2, Copy, Loader2, type LucideIcon } from "lucide-react"
import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from "../ui"

/** Карточка-секция внутри панели. */
export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-muted/5 p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Заголовок внутри карточки: иконка + тайтл + описание + экшены справа. */
export function CardHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {Icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}

/** Подпись поля формы + контрол + подсказка/ошибка. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * Плавающая панель «Сохранить / Отмена» — появляется, когда форма «грязная».
 * Даёт явный affordance вместо скрытого disabled-состояния кнопки.
 */
export function SaveBar({
  visible,
  saving,
  saved,
  saveLabel,
  cancelLabel,
  savingLabel,
  savedLabel,
  onCancel,
}: {
  visible: boolean
  saving: boolean
  saved: boolean
  saveLabel: string
  cancelLabel: string
  savingLabel: string
  savedLabel: string
  onCancel: () => void
}) {
  if (!visible && !saved) return null
  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-hidden transition-all duration-200",
        visible || saved ? "max-h-12 opacity-100" : "max-h-0 opacity-0",
      )}
    >
      <Button type="submit" size="sm" className="rounded-xl" disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            {savingLabel}
          </>
        ) : saved ? (
          <>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            {savedLabel}
          </>
        ) : (
          saveLabel
        )}
      </Button>
      {visible && !saving && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-xl"
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
      )}
    </div>
  )
}

/** Цветная «пилюля» статуса (текущий сеанс / …). */
export function StatusPill({
  tone = "muted",
  icon: Icon,
  children,
  pulse = false,
}: {
  tone?: "success" | "warning" | "muted" | "destructive"
  icon?: LucideIcon
  children: ReactNode
  pulse?: boolean
}) {
  const tones: Record<string, string> = {
    success: "text-green-600 dark:text-green-500 bg-green-500/10",
    warning: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    destructive: "text-destructive bg-destructive/10",
    muted: "text-muted-foreground bg-muted",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
        tones[tone],
      )}
    >
      {pulse && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}

/** Кнопка копирования с галочкой-подтверждением. */
export function CopyButton({
  value,
  label,
  copiedLabel,
}: {
  value: string
  label: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => {
            void navigator.clipboard?.writeText(value)
            setCopied(true)
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => setCopied(false), 1600)
          }}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? copiedLabel : label}</TooltipContent>
    </Tooltip>
  )
}

/** Readonly-поле «как в форме», со значением и опциональным слотом справа. */
export function ReadonlyBox({
  children,
  aside,
  mono = false,
}: {
  children: ReactNode
  aside?: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/40 px-3.5 py-2">
      <span
        className={cn(
          "flex-1 truncate text-sm font-medium text-foreground",
          mono && "font-mono text-[13px]",
        )}
      >
        {children}
      </span>
      {aside}
    </div>
  )
}
