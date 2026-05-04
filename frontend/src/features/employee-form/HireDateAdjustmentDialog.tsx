import { useState, useEffect, useRef } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/ui/dialog"
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
import { useCreateHireDateAdjustment, useHireDateAdjustments, useDeleteHireDateAdjustment } from "@/entities/hire-date-adjustment/useHireDateAdjustments"

interface HireDateAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: number
  hireDate: string | null
  onSuccess?: () => void
}

export function HireDateAdjustmentDialog({
  open,
  onOpenChange,
  employeeId,
  hireDate,
  onSuccess,
}: HireDateAdjustmentDialogProps) {
  const [adjustmentDate, setAdjustmentDate] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  const { data: adjustments } = useHireDateAdjustments(employeeId)
  const createMutation = useCreateHireDateAdjustment()
  const deleteMutation = useDeleteHireDateAdjustment()

  const [deleteId, setDeleteId] = useState<number | null>(null)
  const dialogContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      // Фокусим input внутри DatePicker после открытия диалога
      setTimeout(() => {
        const input = dialogContentRef.current?.querySelector('input[type="text"]')
        input?.focus()
      }, 100)
    }
  }, [open])

  const handleSave = () => {
    if (!adjustmentDate) {
      setError("Укажите дату")
      return
    }
    if (!reason.trim()) {
      setError("Укажите причину")
      return
    }
    setError("")

    createMutation.mutate(
      { employeeId, data: { adjustment_date: adjustmentDate, reason: reason.trim() } },
      {
        onSuccess: () => {
          // Backend уже вызвал ensure_periods_for_employee с обрезкой периодов
          setAdjustmentDate("")
          setReason("")
          onOpenChange(false)
          onSuccess?.()
        },
      },
    )
  }

  const handleClose = () => {
    setAdjustmentDate("")
    setReason("")
    setError("")
    onOpenChange(false)
  }

  const isPending = createMutation.isPending || deleteMutation.isPending

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ""
    const [y, m, d] = dateStr.split("-")
    return `${d}.${m}.${y}`
  }

  // Формируем список всех серий (только корректировки можно удалить)
  const seriesItems: { date: string; label: string; id?: number }[] = []
  if (hireDate) {
    seriesItems.push({ date: hireDate, label: "Дата приёма" })
  }
  if (adjustments) {
    for (const adj of adjustments) {
      seriesItems.push({ date: adj.adjustment_date, label: adj.reason, id: adj.id })
    }
  }
  seriesItems.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" ref={dialogContentRef}>
        <DialogHeader>
          <DialogTitle>Корректировка рабочего года</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Все предыдущие периоды сохранятся. Новые периоды будут созданы от указанной даты (год 1, 2, 3...).
          </p>

          {/* История серий */}
          {seriesItems.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1.5">Текущие серии периодов:</div>
              <div className="space-y-1">
                {seriesItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs group">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                      {item.id ? (i) + "-я корр." : `${i + 1}-я серия`}
                    </Badge>
                    <span className="text-muted-foreground shrink-0">{formatDate(item.date)}</span>
                    <span className="text-muted-foreground shrink-0">—</span>
                    <span className="flex-1">{item.label}</span>
                    {item.id && (
                      <button
                        type="button"
                        onClick={() => setDeleteId(item.id!)}
                        className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                        title="Удалить корректировку"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="w-[130px]">
            <DatePicker
              label="Дата начала нового периода *"
              value={adjustmentDate}
              onChange={setAdjustmentDate}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Причина *</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Декретный отпуск, длительная болезнь и т.д."
              className="mt-1"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить корректировку?</AlertDialogTitle>
          <AlertDialogDescription>
            Периоды будут пересозданы без этой корректировки. Предыдущие периоды восстановятся.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (deleteId) {
                deleteMutation.mutate({ employeeId, adjustmentId: deleteId })
                setDeleteId(null)
              }
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
