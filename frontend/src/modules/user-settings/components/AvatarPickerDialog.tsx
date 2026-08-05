import { useMemo, useState } from "react"
import { Check, Loader2, RefreshCw, Shuffle } from "lucide-react"
import { useUserSettings } from "../context"
import { generateAvatarSeed } from "../lib/avatar-seed"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "../ui"
import { AvatarArt } from "./AvatarArt"

const PREVIEW_COUNT = 12

type AvatarPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Выбор аватара: сетка случайных seed'ов, «Другие варианты», сброс.
 * Выбор применяется мгновенно (клик = сохранение через api.updateAvatar).
 */
export function AvatarPickerDialog({ open, onOpenChange }: AvatarPickerDialogProps) {
  const { api, dict, profile, refreshProfile, notify } = useUserSettings()
  const [batch, setBatch] = useState(0)
  const [hoveredSeed, setHoveredSeed] = useState<string | null>(null)
  const [savingSeed, setSavingSeed] = useState<string | null | "reset">(null)
  const [error, setError] = useState<string | null>(null)

  const currentSeed = profile?.avatar_seed ?? null
  const saving = savingSeed !== null

  const previews = useMemo(() => {
    if (!open) return []
    const out = new Set<string>()
    while (out.size < PREVIEW_COUNT) {
      const s = generateAvatarSeed()
      if (s !== currentSeed) out.add(s)
    }
    return Array.from(out)
    // batch — ключ перегенерации сетки по кнопке «Другие варианты»
  }, [open, currentSeed, batch])

  const pick = async (seed: string | null) => {
    if (saving) return
    setSavingSeed(seed === null ? "reset" : seed)
    setError(null)
    try {
      await api.updateAvatar(seed)
      // refresh=1: после смены аватара синхронизируем с IdP немедленно
      // (обход TTL-кэша бэкенда — выбор должен быть виден во всех приложениях).
      await refreshProfile(true)
      onOpenChange(false)
    } catch {
      setError(dict.avatar.error)
      notify?.({ title: dict.avatar.error, variant: "destructive" })
    } finally {
      setSavingSeed(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.avatar.title}</DialogTitle>
          <DialogDescription>{dict.avatar.description}</DialogDescription>
        </DialogHeader>

        <div className="relative grid grid-cols-4 gap-3 py-2">
          {previews.map((seed) => {
            const isHovered = hoveredSeed === seed
            const isSavingThis = savingSeed === seed
            return (
              <button
                key={seed}
                type="button"
                disabled={saving}
                onClick={() => void pick(seed)}
                onMouseEnter={() => setHoveredSeed(seed)}
                onMouseLeave={() => setHoveredSeed(null)}
                onFocus={() => setHoveredSeed(seed)}
                onBlur={() => setHoveredSeed(null)}
                className={cn(
                  "group relative aspect-square overflow-hidden bg-muted transition-all",
                  "hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  isHovered ? "rounded-2xl" : "rounded-full",
                )}
                aria-label={`${dict.avatar.pickAriaLabel} ${seed}`}
              >
                <AvatarArt
                  seed={seed}
                  size={200}
                  fit={isHovered ? "contain" : "cover"}
                  className="!h-full !w-full"
                />
                {isSavingThis && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/60">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                {currentSeed === seed && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background">
                    <Check className="h-6 w-6 text-primary" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <p className="-mt-1 text-center text-[11px] text-muted-foreground">
          {dict.avatar.hoverHint}
        </p>

        {error && <p className="text-center text-xs text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving || currentSeed === null}
            onClick={() => void pick(null)}
            className="text-xs"
          >
            {savingSeed === "reset" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {dict.avatar.reset}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setBatch((b) => b + 1)}
            disabled={saving}
            className="text-xs"
          >
            <Shuffle className="mr-1.5 h-3.5 w-3.5" />
            {dict.avatar.shuffle}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {dict.common.cancel}
          </Button>
        </div>

        {currentSeed === null && (
          <p className="-mt-1 text-center text-[11px] text-muted-foreground">
            {dict.avatar.emptyHint}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
