import { useMemo } from "react"
import multiavatar from "@multiavatar/multiavatar/esm"
import { cn } from "@/shared/utils/cn"

type Fit = "cover" | "contain"

type UserAvatarProps = {
  /** Seed для детерминированной генерации. Приоритет: avatar_seed → telegram_id → username → id. */
  seed?: string | number | null
  /** Имя пользователя — используется для fallback-инициалов. */
  name?: string | null
  /** Размер в пикселях. По умолчанию 32. */
  size?: number
  className?: string
  /**
   * Режим вписывания SVG в контейнер:
   * - "cover" (default): xMidYMid slice — обрезает по краям, виден центр.
   *   Подходит для круглого аватара в шапке/sidebar/таблице.
   * - "contain": xMidYMid meet — вписывает целиком, без обрезки.
   *   Используется в picker'е, чтобы видеть всю иконку (лицо + плечи + фон).
   */
  fit?: Fit
}

/**
 * Аватар пользователя.
 *
 * Генерирует уникальный мультяшный SVG-аватар на клиенте по seed
 * (Multiavatar). Один и тот же seed → один и тот же SVG, без хранения
 * картинок. Если seed отсутствует или генерация упала — показывает
 * градиентный круг с инициалами.
 */
export function UserAvatar({ seed, name, size = 32, className, fit = "cover" }: UserAvatarProps) {
  const preserveAspectRatio = fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"
  const isRounded = fit === "cover"

  const svg = useMemo(() => {
    if (seed == null || seed === "") return null
    try {
      // Локальная генерация, XSS-безопасно. Чистим XML-декларацию и
      // комментарии, чтобы React-DOM не ругался при dangerouslySetInnerHTML.
      return multiavatar(String(seed))
        .replace(/<\?xml[^>]*\?>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
    } catch {
      return null
    }
  }, [seed])

  const dim = `${size}px`
  const fontSize = Math.max(10, Math.round(size / 2.6))

  if (svg) {
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center overflow-hidden bg-muted shrink-0",
          isRounded && "rounded-full",
          className,
        )}
        style={{ width: dim, height: dim }}
        dangerouslySetInnerHTML={{
          __html: svg.replace(
            "<svg ",
            `<svg width="${size}" height="${size}" preserveAspectRatio="${preserveAspectRatio}" `,
          ),
        }}
        aria-hidden
      />
    )
  }

  // Fallback с инициалами: первые буквы первых двух слов, uppercase.
  let initials = "?"
  if (name) {
    const parts = name.trim().split(/\s+/)
    initials =
      parts.length >= 2
        ? ((parts[0][0] || "") + (parts[1][0] || "")).toUpperCase()
        : (parts[0][0] || "?").toUpperCase()
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-semibold shrink-0",
        className,
      )}
      style={{ width: dim, height: dim, fontSize }}
      aria-hidden
    >
      {initials}
    </div>
  )
}
