import { useEffect, useMemo, useState } from "react"
import { PlusCircle } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/use-toast"
import { formatDate, formatDateTime } from "@/shared/utils/date"
import { useVacationPeriods, useAdditionalDaysHistory, useApplyAdditionalDaysIncrease } from "../useVacationPeriods"
import type { AdditionalDaysFrom, VacationPeriod } from "../types"

interface AdditionalDaysAdjustModalProps {
  employeeId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  currentAdditionalDays?: number | null
}

function formatBoundary(from: AdditionalDaysFrom, boundaryDate: string | undefined): string {
  if (!boundaryDate) return "—"
  if (from === "first") return "с первого периода"
  if (from === "last") return "с последнего (текущего)"
  return `с указанного (${formatDate(boundaryDate)})`
}

export function AdditionalDaysAdjustModal({
  employeeId,
  open,
  onOpenChange,
  currentAdditionalDays,
}: AdditionalDaysAdjustModalProps) {
  const { data: periodsRaw } = useVacationPeriods(employeeId)
  const { data: history } = useAdditionalDaysHistory(employeeId)
  const applyMutation = useApplyAdditionalDaysIncrease()
  const { addToast } = useToast()

  const periods = useMemo<VacationPeriod[]>(() => {
    if (!Array.isArray(periodsRaw)) return []
    return [...periodsRaw].sort(
      (a, b) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime(),
    )
  }, [periodsRaw])

  const currentValue = currentAdditionalDays ?? history?.[0]?.new_value ?? periods[0]?.additional_days ?? 0

  const [newValue, setNewValue] = useState("")
  const [from, setFrom] = useState<AdditionalDaysFrom>("last")
  const [specificPeriodId, setSpecificPeriodId] = useState<number | null>(null)
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (open) {
      setNewValue(String(currentValue))
      setFrom("last")
      setSpecificPeriodId(null)
      setReason("")
    }
  }, [open, currentValue])

  const newValueNum = parseInt(newValue, 10)
  const isValid = !isNaN(newValueNum) && newValueNum >= 0 && (from !== "specific" || specificPeriodId !== null)

  const boundaryDate = useMemo(() => {
    if (from === "first") return periods[0]?.period_start
    if (from === "last") return periods[periods.length - 1]?.period_start
    return periods.find((p) => p.period_id === specificPeriodId)?.period_start
  }, [from, periods, specificPeriodId])

  const affected = useMemo(() => {
    if (!boundaryDate || isNaN(newValueNum)) return []
    return periods.filter((p) => p.period_start >= boundaryDate)
  }, [boundaryDate, periods, newValueNum])

const reopened = useMemo(() => {
    if (isNaN(newValueNum)) return []
    return affected.filter((p) => p.remaining_days === 0 && newValueNum > p.additional_days)
  }, [affected, newValueNum])

  const deltaSum = useMemo(() => {
    if (isNaN(newValueNum)) return 0
    // Возвращается в остаток/очередь только у переоткрываемых (полностью закрытых) периодов
    return reopened.reduce((sum, p) => sum + (newValueNum - p.additional_days), 0)
  }, [reopened, newValueNum])

  const handleSubmit = () => {
    if (!isValid) return
    applyMutation.mutate(
      {
        employeeId,
        data: {
          new_value: newValueNum,
          from_period: from,
          period_id: from === "specific" ? specificPeriodId : undefined,
          reason: reason.trim() || null,
        },
      },
      {
        onSuccess: () => {
          addToast({
            title: "Доп. дни обновлены",
            description: `Новое значение: ${newValueNum} дн., ${formatBoundary(from, boundaryDate)}`,
          })
          onOpenChange(false)
        },
        onError: () => {
          addToast({ title: "Ошибка", description: "Не удалось изменить доп. дни" })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !applyMutation.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" /> Управление доп. днями отпуска
          </DialogTitle>
          <DialogDescription>
            Текущее значение: <b>{currentValue} дн.</b>. Выберите, с какого периода применить новое значение.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Новые доп. дни</label>
            <Input
              type="number"
              min={0}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Применить с</label>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={from === "first"}
                  onChange={() => setFrom("first")}
                  className="accent-blue-600"
                />
                С первого периода <span className="text-muted-foreground">(за весь стаж)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={from === "last"}
                  onChange={() => setFrom("last")}
                  className="accent-blue-600"
                />
                С последнего (текущего)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={from === "specific"}
                  onChange={() => setFrom("specific")}
                  className="accent-blue-600"
                />
                С указанного периода
              </label>
              {from === "specific" && (
                <select
                  value={specificPeriodId ?? ""}
                  onChange={(e) => setSpecificPeriodId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Выберите период</option>
                  {[...periods].reverse().map((p) => (
                    <option key={p.period_id} value={p.period_id}>
                      {p.year_number}-й г. ({formatDate(p.period_start)} — {formatDate(p.period_end)}) · доп. {p.additional_days} дн.{p.remaining_days === 0 ? " · закрыт" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {isValid && affected.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-100 space-y-0.5">
              <div>
                Затронуто периодов: <b>{affected.length}</b>
              </div>
              {reopened.length > 0 && (
                <div className="text-amber-700 dark:text-amber-300">
                  Закрытых будет переоткрыто: <b>{reopened.length}</b> (суммарно +{deltaSum} дн. вернётся в остаток и в очередь списания)
                </div>
              )}
              <div className="text-muted-foreground">
                Применение — {formatBoundary(from, boundaryDate)}
              </div>
            </div>
          )}
          {reopened.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Внимание: переоткрытые закрытые периоды снова попадут в очередь списания отпусков (FIFO).
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Причина (необязательно)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: повышение доп. дней по приказу"
            />
          </div>

          {history && history.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium">История изменений</label>
              <div className="max-h-32 overflow-y-auto rounded-md border border-muted/30 divide-y divide-muted/20 text-xs">
                {history.map((h) => (
                  <div key={h.id} className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{h.old_value} → {h.new_value} дн.</span>
                      <span className="text-muted-foreground">с {formatDate(h.effective_from)}</span>
                      {h.created_at && (
                        <span className="text-muted-foreground ml-auto">({formatDateTime(h.created_at)})</span>
                      )}
                    </div>
                    {h.reason && <div className="text-muted-foreground">{h.reason}</div>}
                    {h.created_by && <div className="text-muted-foreground">автор: {h.created_by}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applyMutation.isPending}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || applyMutation.isPending}>
            {applyMutation.isPending ? "Сохранение..." : "Применить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
