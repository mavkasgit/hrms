import { ClipboardPaste, Eye, FilePen, Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { DeleteCancelButton } from "@/shared/ui/delete-cancel-button"

interface ServerDraftActionsProps {
  /** Заполняется ли именно этот черновик (спиннер + блокировка его кнопки). */
  filling: boolean
  /** Дополнительная блокировка кнопки «Заполнить» (например, другая строка в полёте). */
  fillDisabled?: boolean
  /** Вооружена ли кнопка удаления. Управляется родителем. */
  armed: boolean
  onArmedChange: (armed: boolean) => void
  onFill: () => void
  onOpenView: () => void
  onOpenEdit: () => void
  onDelete: () => void
  deletePending: boolean
}

/**
 * Единый кластер действий серверного черновика (Заполнить/Открыть/Восстановить/
 * Удалить). Управляемый: filling/armed и колбэки приходят от родителя, поэтому
 * и табличная страница (общий fillingId, Set вооружённых), и попап (per-item
 * состояния) используют одну реализацию (#111).
 *
 * Любое действие кроме удаления (Заполнить/Открыть/Восстановить) снимает
 * вооружение удаления — единый инвариант обоих потребителей.
 *
 * Контекстный рендер (строка попапа vs табличная ячейка) остаётся у потребителя —
 * компонент отдаёт только кнопки.
 */
export function ServerDraftActions({
  filling,
  fillDisabled,
  armed,
  onArmedChange,
  onFill,
  onOpenView,
  onOpenEdit,
  onDelete,
  deletePending,
}: ServerDraftActionsProps) {
  const handleFill = () => {
    onArmedChange(false)
    onFill()
  }
  const handleOpenView = () => {
    onArmedChange(false)
    onOpenView()
  }
  const handleOpenEdit = () => {
    onArmedChange(false)
    onOpenEdit()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Заполнить форму данными черновика"
        aria-label="Заполнить"
        disabled={filling || fillDisabled}
        onClick={handleFill}
      >
        {filling ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ClipboardPaste className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Открыть документ только для чтения"
        aria-label="Открыть"
        onClick={handleOpenView}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Восстановить — открыть в редакторе для доработки и сохранения"
        aria-label="Восстановить"
        onClick={handleOpenEdit}
      >
        <FilePen className="h-4 w-4" />
      </Button>
      <DeleteCancelButton
        armed={armed}
        onArmedChange={onArmedChange}
        onDelete={onDelete}
        isPending={deletePending}
        idleLabel="Удалить черновик"
      />
    </>
  )
}
