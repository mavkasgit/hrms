import { RotateCcw, Trash2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import type { OrderFormDraft } from "./useOrderFormRecovery"

interface OrderFormRecoveryBannerProps {
  draft: OrderFormDraft
  onRestore: () => void
  onDismiss: () => void
  onRemove: () => void
}

/**
 * Уведомление «Найдено несохранённое заполнение формы приказа» (#28).
 * Показывается на странице приказов при обнаружении черновика в localStorage.
 */
export function OrderFormRecoveryBanner({
  draft,
  onRestore,
  onDismiss,
  onRemove,
}: OrderFormRecoveryBannerProps) {
  const savedAt = new Date(draft.saved_at)
  const timeStr = savedAt.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div
      data-testid="order-form-recovery-banner"
      className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <p className="flex-1 text-sm text-amber-900">
        Найдено несохранённое заполнение формы приказа{" "}
        <span className="text-amber-600">({timeStr})</span>
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="default" onClick={onRestore} data-testid="recovery-restore">
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Восстановить
        </Button>
        <Button size="sm" variant="outline" onClick={onDismiss} data-testid="recovery-dismiss">
          Не сейчас
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} data-testid="recovery-remove">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 text-amber-400 hover:text-amber-700"
        aria-label="Закрыть"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
