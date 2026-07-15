import { useMemo, useState } from "react"
import { RefreshCw, Check, Shuffle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { generateRandomSeed } from "@/shared/lib/avatar"

type AvatarPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Текущий сохранённый avatar_seed (null если не задан). */
  currentSeed: string | null
  /** Callback при выборе превью или сбросе. Принимает новый seed (или null для сброса). */
  onPick: (seed: string | null) => void | Promise<void>
  isSaving?: boolean
}

const PREVIEW_COUNT = 12

/**
 * Генерирует PREVIEW_COUNT случайных 8-hex seeds, отличающихся от текущего.
 * useMemo с key=open+seed → новая сетка при каждом открытии.
 */
function usePreviewSeeds(
  open: boolean,
  currentSeed: string | null,
  batch: number,
): string[] {
  return useMemo(() => {
    if (!open) return []
    const out = new Set<string>()
    while (out.size < PREVIEW_COUNT) {
      const s = generateRandomSeed()
      if (s !== currentSeed) out.add(s)
    }
    return Array.from(out)
  }, [open, currentSeed, batch])
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  currentSeed,
  onPick,
  isSaving,
}: AvatarPickerDialogProps) {
  const [batch, setBatch] = useState(0)
  const [hoveredSeed, setHoveredSeed] = useState<string | null>(null)
  const previews = usePreviewSeeds(open, currentSeed, batch)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Выберите аватар</DialogTitle>
          <DialogDescription>
            Сгенерированные варианты. Кликните на понравившийся — выбор сохранится автоматически.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-3 py-2">
          {previews.map((seed) => {
            const isCurrent = currentSeed === seed
            const isHovered = hoveredSeed === seed
            return (
              <button
                key={seed}
                type="button"
                disabled={isSaving}
                onClick={() => onPick(seed)}
                onMouseEnter={() => setHoveredSeed(seed)}
                onMouseLeave={() => setHoveredSeed(null)}
                onFocus={() => setHoveredSeed(seed)}
                onBlur={() => setHoveredSeed(null)}
                className={`group relative aspect-square overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isHovered ? "rounded-2xl" : "rounded-full"
                }`}
                aria-label={`Выбрать аватар ${seed}`}
              >
                <UserAvatar
                  seed={seed}
                  size={200}
                  fit={isHovered ? "contain" : "cover"}
                  className="!w-full !h-full"
                />
                {isCurrent && (
                  <div className="absolute inset-0 ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl flex items-center justify-center bg-primary/10 pointer-events-none">
                    <Check className="h-6 w-6 text-primary" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground text-center -mt-1">
          Наведите на аватар, чтобы увидеть полную иконку
        </p>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSaving || currentSeed === null}
            onClick={() => onPick(null)}
            className="text-xs"
            title="Убрать аватар (пустая заглушка)"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Сбросить
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setBatch((b) => b + 1)}
            disabled={isSaving}
            className="text-xs"
            title="Показать другие 12 случайных вариантов"
          >
            <Shuffle className="h-3.5 w-3.5 mr-1.5" />
            Другие варианты
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Отмена
          </Button>
        </div>

        {currentSeed === null && (
          <p className="text-[11px] text-muted-foreground text-center -mt-1">
            Аватар не задан — показывается пустая заглушка.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
