import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"

interface FormDraftOverwriteDialogProps {
  open: boolean
  /** Лейбл документа в родительном падеже: «формы приказа», «формы уведомления» и т.д. */
  entityLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Диалог подтверждения перезаписи существующего черновика (#49).
 * Показывается, когда подлинный (пред-сессионный) черновик обнаружен,
 * а пользователь начинает новое заполнение формы.
 */
export function FormDraftOverwriteDialog({
  open,
  entityLabel = "формы",
  onCancel,
  onConfirm,
}: FormDraftOverwriteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Перезаписать сохранённое заполнение?</AlertDialogTitle>
          <AlertDialogDescription>
            Уже есть несохранённое заполнение {entityLabel}. Новое заполнение заменит его.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Перезаписать</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
