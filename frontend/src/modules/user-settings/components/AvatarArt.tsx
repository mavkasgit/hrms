import { useMemo } from "react"
import multiavatar from "@multiavatar/multiavatar/esm"
import { User } from "lucide-react"
import { cn } from "../ui"

type Fit = "cover" | "contain"

type AvatarArtProps = {
  /** Seed генерации. null/пустой → нейтральная заглушка. */
  seed?: string | number | null
  size?: number
  className?: string
  /**
   * cover — круглый аватар (центр иконки);
   * contain — вся иконка целиком (для picker'а).
   */
  fit?: Fit
}

/**
 * Аватар по seed (Multiavatar, локальная генерация, XSS-безопасно).
 *
 * ИЗОЛИРОВАННАЯ ЗАВИСИМОСТЬ: единственное место модуля, где используется
 * @multiavatar/multiavatar. Хотите фото-аватары или initials — замените
 * этот один компонент, остальной модуль не изменится.
 */
export function AvatarArt({ seed, size = 32, className, fit = "cover" }: AvatarArtProps) {
  const preserveAspectRatio = fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"
  const isRounded = fit === "cover"

  const svg = useMemo(() => {
    if (seed == null || seed === "") return null
    try {
      return multiavatar(String(seed))
        .replace(/<\?xml[^>]*\?>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
    } catch {
      return null
    }
  }, [seed])

  const dim = `${size}px`
  const iconSize = Math.max(12, Math.round(size * 0.5))

  if (svg) {
    return (
      <div
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted",
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

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-muted-foreground/60",
        className,
      )}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      <User style={{ width: iconSize, height: iconSize }} strokeWidth={1.75} />
    </div>
  )
}
