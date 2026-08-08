import { useEffect, useRef, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/cn"

/** Длительность окна отмены удаления по умолчанию. */
export const DELETE_CANCEL_COUNTDOWN_MS = 5_000

const RADIUS = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface DeleteCancelButtonProps {
  /** Вооружена ли кнопка (окно отмены активно). Управляется родителем. */
  armed: boolean
  /** Родитель меняет вооружение: клик по кнопке (арм/отмена) и истечение таймера. */
  onArmedChange: (armed: boolean) => void
  /** Вызывается, когда окно отмены истекло (удаление подтверждено). */
  onDelete: () => void
  /** Мутация удаления в полёте — показываем спиннер вместо кнопки. */
  isPending?: boolean
  /** Длительность окна отмены, мс. */
  countdownMs?: number
  /** title/aria-label в спокойном состоянии. */
  idleLabel?: string
  /** title/aria-label в вооружённом состоянии. */
  cancelLabel?: string
  className?: string
}

/**
 * Кнопка «Удалить» с окном отмены: первый клик вооружает (SVG-кольцо 16px
 * с числовым отсчётом), повторный клик — отмена; по истечении — спиннер
 * мутации и удаление. Размер кнопки фиксирован (size="icon"), иконка
 * заменяется кольцом без изменения габаритов.
 *
 * Управляемая: вооружение держит родитель (Set вооружённых строк), поэтому
 * параллельные окна и снятие вооружения другими действиями строки бесплатны.
 */
export function DeleteCancelButton({
  armed,
  onArmedChange,
  onDelete,
  isPending = false,
  countdownMs = DELETE_CANCEL_COUNTDOWN_MS,
  idleLabel = "Удалить",
  cancelLabel = "Отменить удаление",
  className,
}: DeleteCancelButtonProps) {
  const [remaining, setRemaining] = useState(countdownMs)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => clearTimer, [])

  // Отсчёт живёт, пока кнопка вооружена; размонтировалась/разуворилась — очистка.
  useEffect(() => {
    if (!armed) {
      clearTimer()
      setRemaining(countdownMs)
      return
    }
    const start = Date.now()
    clearTimer()
    timerRef.current = setInterval(() => {
      const left = Math.max(0, countdownMs - (Date.now() - start))
      setRemaining(left)
      if (left <= 0) {
        clearTimer()
        onArmedChange(false)
        onDelete()
      }
    }, 100)
    return () => {
      clearTimer()
      setRemaining(countdownMs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, countdownMs])

  const handleClick = () => {
    if (isPending) return
    onArmedChange(!armed)
  }

  const seconds = Math.ceil(remaining / 1000)
  const progress = remaining / countdownMs
  const dashOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isPending}
      title={armed ? cancelLabel : idleLabel}
      aria-label={armed ? cancelLabel : idleLabel}
      className={cn("text-red-500 hover:text-red-700", className)}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : armed ? (
        <span className="relative inline-block h-4 w-4">
          <svg viewBox="0 0 16 16" className="h-4 w-4 -rotate-90">
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.3"
            />
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-100 ease-linear"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold leading-none">
            {seconds}
          </span>
        </span>
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  )
}
