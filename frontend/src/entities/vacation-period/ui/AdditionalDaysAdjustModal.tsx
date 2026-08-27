import { useEffect, useMemo, useState } from "react"
import { ListPlus, PlusCircle } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
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
import {
  useVacationPeriods,
  useAdditionalDaysHistory,
  useApplyAdditionalDaysIncrease,
  useAdjustPeriodsAdditionalDays,
} from "../useVacationPeriods"
import type { AdditionalDaysFrom, VacationPeriod, VacationPeriodBulkAdjustItem } from "../types"

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
  return `с выбранного (${formatDate(boundaryDate)})`
}

function formatPeriodRef(p: VacationPeriod | undefined): string {
  if (!p) return ""
  return `${p.year_number}-й г. (${formatDate(p.period_start)} — ${formatDate(p.period_end)})`
}

export function AdditionalDaysAdjustModal({
  employeeId,
  open,
  onOpenChange,
  currentAdditionalDays,
}: AdditionalDaysAdjustModalProps) {
  const { data: periodsRaw } = useVacationPeriods(employeeId)
  const { data: history } = useAdditionalDaysHistory(employeeId)
  const bulkMutation = useApplyAdditionalDaysIncrease()
  const periodMutation = useAdjustPeriodsAdditionalDays()
  const { addToast } = useToast()

  const periods = useMemo<VacationPeriod[]>(() => {
    if (!Array.isArray(periodsRaw)) return []
    return [...periodsRaw].sort(
      (a, b) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime(),
    )
  }, [periodsRaw])

  const currentValue = currentAdditionalDays ?? history?.[0]?.new_value ?? periods[0]?.additional_days ?? 0

  // --- Быстрое применение к диапазону ---
  const [newValue, setNewValue] = useState("")
  const [from, setFrom] = useState<AdditionalDaysFrom>("last")
  const [specificPeriodId, setSpecificPeriodId] = useState<number | null>(null)
  const [reason, setReason] = useState("")

  // --- Ручная корректировка по периодам ---
  const [periodEdits, setPeriodEdits] = useState<Record<number, string>>({})
  const [showPeriods, setShowPeriods] = useState(false)

  useEffect(() => {
    if (open) {
      setNewValue(String(currentValue))
      setFrom("last")
      setSpecificPeriodId(null)
      setReason("")
      setShowPeriods(false)
      const edits: Record<number, string> = {}
      for (const p of periods) edits[p.period_id] = String(p.additional_days)
      setPeriodEdits(edits)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const newValueNum = parseInt(newValue, 10)
  const isValidBulk =
    !isNaN(newValueNum) && newValueNum >= 0 && (from !== "specific" || specificPeriodId !== null)

  const boundaryDate = useMemo(() => {
    if (from === "first") return periods[0]?.period_start
    if (from === "last") return periods[periods.length - 1]?.period_start
    return periods.find((p) => p.period_id === specificPeriodId)?.period_start
  }, [from, periods, specificPeriodId])

  const boundaryPeriod = useMemo(
    () => periods.find((p) => p.period_start === boundaryDate),
    [periods, boundaryDate],
  )

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
    return reopened.reduce((sum, p) => sum + (newValueNum - p.additional_days), 0)
  }, [reopened, newValueNum])

  // Периоды, отсортированные новые → старые, для списка ручной корректировки
  const periodsDesc = useMemo(() => [...periods].reverse(), [periods])

  const dirtyItems = useMemo<VacationPeriodBulkAdjustItem[]>(() => {
    const items: VacationPeriodBulkAdjustItem[] = []
    for (const p of periods) {
      const v = periodEdits[p.period_id]
      const num = parseInt(v ?? "", 10)
      if (!isNaN(num) && num >= 0 && num !== p.additional_days) {
        items.push({ period_id: p.period_id, additional_days: num })
      }
    }
    return items
  }, [periods, periodEdits])

  const handleBulkApply = () => {
    if (!isValidBulk) return
    bulkMutation.mutate(
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
        onSuccess: (data) => {
          // Обновляем список ручной корректировки из ответа сервера
          const edits: Record<number, string> = { ...periodEdits }
          for (const p of data.periods) edits[p.period_id] = String(p.additional_days)
          setPeriodEdits(edits)
          addToast({
            title: "Диапазон обновлён",
            description: `Доп. дни: ${newValueNum} дн., ${formatBoundary(from, boundaryDate)}. Можно откорректировать отдельные периоды ниже.`,
          })
        },
        onError: () => {
          addToast({ title: "Ошибка", description: "Не удалось применить к диапазону" })
        },
      },
    )
  }

  const handleSavePeriods = () => {
    if (dirtyItems.length === 0) return
    periodMutation.mutate(
      { employeeId, items: dirtyItems },
      {
        onSuccess: (updatedPeriods) => {
          const edits: Record<number, string> = { ...periodEdits }
          for (const p of updatedPeriods) edits[p.period_id] = String(p.additional_days)
          setPeriodEdits(edits)
          addToast({
            title: "Изменения сохранены",
            description: `Обновлено периодов: ${dirtyItems.length}`,
          })
        },
        onError: () => {
          addToast({ title: "Ошибка", description: "Не удалось сохранить изменения периодов" })
        },
      },
    )
  }

  const busy = bulkMutation.isPending || periodMutation.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" /> Управление доп. днями отпуска
          </DialogTitle>
          <DialogDescription>
            Текущее значение: <b>{currentValue} дн.</b> Примените к диапазону или раскройте
            периоды и поправьте значение в каждом вручную.
          </DialogDescription>
        </DialogHeader>

        <div className={showPeriods ? "grid gap-4 md:grid-cols-2" : "space-y-4"}>
          {/* Левая колонка: массовое применение к диапазону */}
          <div className="space-y-2">
            <div className="rounded-md border border-muted/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ListPlus className="h-4 w-4 text-muted-foreground" />
                Массовое применение к диапазону
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Новые доп. дни</label>
                  <Input
                    type="number"
                    min={0}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="0"
                    className="w-20"
                  />
                </div>
                <div className="space-y-1.5 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={from === "first"}
                      onChange={() => setFrom("first")}
                      className="accent-blue-600"
                    />
                    <span>
                      С первого периода
                      <span className="text-muted-foreground"> — {formatPeriodRef(periods[0])}</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={from === "last"}
                      onChange={() => setFrom("last")}
                      className="accent-blue-600"
                    />
                    <span>
                      С последнего (текущего)
                      <span className="text-muted-foreground"> — {formatPeriodRef(periods[periods.length - 1])}</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={from === "specific"}
                      onChange={() => setFrom("specific")}
                      className="accent-blue-600"
                    />
                    С выбранного периода
                  </label>
                  {from === "specific" && (
                    <Select
                      value={specificPeriodId ? String(specificPeriodId) : "none"}
                      onValueChange={(v) => setSpecificPeriodId(v !== "none" ? Number(v) : null)}
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue placeholder="Выберите период" />
                      </SelectTrigger>
                      <SelectContent>
                        {periodsDesc.map((p) => (
                          <SelectItem key={p.period_id} value={String(p.period_id)}>
                            {p.year_number}-й г. ({formatDate(p.period_start)} — {formatDate(p.period_end)}) · доп. {p.additional_days} дн.{p.remaining_days === 0 ? " · закрыт" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {isValidBulk && affected.length > 0 && (
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-100 space-y-0.5">
                  <div>
                    Затронуто периодов: <b>{affected.length}</b> (с {formatPeriodRef(boundaryPeriod)})
                  </div>
                  {reopened.length > 0 && (
                    <div className="text-amber-700 dark:text-amber-300">
                      Закрытых будет переоткрыто: <b>{reopened.length}</b> (суммарно +{deltaSum} дн. вернётся в остаток и в очередь списания)
                    </div>
                  )}
                  <div className="text-muted-foreground">Применение — {formatBoundary(from, boundaryDate)}</div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Причина (например: перевод на должность, смена условий труда)"
                  className="flex-1"
                />
                <Button onClick={handleBulkApply} disabled={!isValidBulk || busy} className="shrink-0">
                  {bulkMutation.isPending ? "Применяю..." : "Применить к диапазону"}
                </Button>
              </div>
            </div>

            {/* Раскрытие ручной корректировки по периодам */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowPeriods((v) => !v)}
              disabled={busy}
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              {showPeriods
                ? "Скрыть ручную корректировку периодов"
                : `Показать периоды для ручной правки (${periods.length})`}
              {!showPeriods && dirtyItems.length > 0 && (
                <span className="ml-1 text-xs text-blue-600">· изменено: {dirtyItems.length}</span>
              )}
            </Button>
          </div>

          {/* Правая колонка: таблица периодов (раскрывается по кнопке) */}
          {showPeriods && (
            <div className="space-y-2">
              <div className="rounded-md border border-muted/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <PlusCircle className="h-4 w-4 text-muted-foreground" />
                    Доп. дни по периодам
                  </div>
                  {dirtyItems.length > 0 && (
                    <span className="text-xs text-blue-600">изменено: {dirtyItems.length}</span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto rounded-md border border-muted/30">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/80 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Период</th>
                        <th className="text-right px-2 py-1.5 font-medium w-24">Доп. дни</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-muted/20">
                      {periodsDesc.map((p) => {
                        const editVal = periodEdits[p.period_id]
                        const editNum = parseInt(editVal ?? "", 10)
                        const isDirty = !isNaN(editNum) && editNum >= 0 && editNum !== p.additional_days
                        const isInvalid = editVal !== undefined && editVal !== "" && (isNaN(editNum) || editNum < 0)
                        return (
                          <tr key={p.period_id}>
                            <td className="px-2 py-1.5">
                              <div className="font-medium">{p.year_number}-й г.</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(p.period_start)} — {formatDate(p.period_end)}
                                {p.remaining_days === 0 ? " · закрыт" : ""}
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                type="number"
                                min={0}
                                value={editVal ?? ""}
                                onChange={(e) =>
                                  setPeriodEdits((prev) => ({ ...prev, [p.period_id]: e.target.value }))
                                }
                                className={`w-16 h-7 text-center ml-auto ${isDirty ? "border-blue-500 ring-1 ring-blue-300" : ""} ${isInvalid ? "border-red-500" : ""}`}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Изменение доп. дней у закрытого периода переоткрывает его на разницу и возвращает в очередь списания (FIFO).
                </p>
              </div>
            </div>
          )}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Закрыть
          </Button>
          <Button onClick={handleSavePeriods} disabled={dirtyItems.length === 0 || busy}>
            {periodMutation.isPending ? "Сохранение..." : `Сохранить изменения (${dirtyItems.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}