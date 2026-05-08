import { useState, useEffect, useMemo, Fragment } from "react"
import { RefreshCw, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { Badge } from "@/shared/ui/badge"
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
import {
  useEmployeeVacationHistory,
} from "@/entities/vacation"
import { useVacationPeriods, useRecalculateVacationPeriods, useCancelTransaction } from "@/entities/vacation-period"
import { useHireDateAdjustments } from "@/entities/hire-date-adjustment/useHireDateAdjustments"
import { VacationPeriodVacationRow } from "@/entities/vacation-period/ui/VacationPeriodVacationRow"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return formatDate(dateStr)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`
}

function formatTransactionType(type: string): string {
  switch (type) {
    case "vacation_use": return "Списание отпуска"
    case "vacation_use_adjusted": return "Списание после корректировки"
    case "recalculate_use": return "Списание при пересчете"
    case "vacation_restore": return "Восстановление дней"
    case "manual_close": return "Ручное закрытие"
    case "partial_close": return "Частичное закрытие"
    default: return type
  }
}

function transactionPriority(type: string): number {
  switch (type) {
    case "vacation_use": return 1
    case "vacation_restore": return 2
    case "vacation_use_adjusted": return 3
    case "recalculate_use": return 4
    case "manual_close": return 5
    case "partial_close": return 6
    default: return 99
  }
}

interface VacationHistoryAndPeriodsProps {
  employeeId: number
}

export function VacationHistoryAndPeriods({ employeeId }: VacationHistoryAndPeriodsProps) {
  const { data: history, isLoading } = useEmployeeVacationHistory(employeeId)
  const { data: periodsRaw } = useVacationPeriods(employeeId)
  const { data: adjustments } = useHireDateAdjustments(employeeId)
  const recalculatePeriodsMutation = useRecalculateVacationPeriods()
  const periods = Array.isArray(periodsRaw) ? periodsRaw : []

  const [showClosedPeriods, setShowClosedPeriods] = useState(false)
  const [recalculateAlertOpen, setRecalculateAlertOpen] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [cancelTxId, setCancelTxId] = useState<number | null>(null)
  const cancelTransactionMutation = useCancelTransaction()

  const hasOpenPeriods = periods.filter(p => p.remaining_days > 0).length > 0
  const hasClosedPeriods = periods.filter(p => p.remaining_days === 0).length > 0

  useEffect(() => {
    if (periods && !hasOpenPeriods && hasClosedPeriods) {
      setShowClosedPeriods(true)
    }
  }, [periods, hasOpenPeriods, hasClosedPeriods])

  const handleRecalculateConfirm = () => {
    setIsRecalculating(true)
    const startTime = Date.now()
    const finishRecalculate = () => {
      const elapsed = Date.now() - startTime
      const minDelay = 1500
      const remaining = Math.max(0, minDelay - elapsed)
      setTimeout(() => { setIsRecalculating(false); setRecalculateAlertOpen(false) }, remaining)
    }
    recalculatePeriodsMutation.mutate(employeeId, { onSettled: finishRecalculate })
  }

  const adjustmentDates = useMemo(() => {
    if (!adjustments) return []
    return adjustments.map(a => a.adjustment_date).sort()
  }, [adjustments])

  const getSeriesDivider = (periodStart: string, prevPeriodStart: string | null): string | null => {
    if (!prevPeriodStart) return null
    for (const adjDate of adjustmentDates) {
      if (prevPeriodStart >= adjDate && periodStart < adjDate) return adjDate
    }
    return null
  }

  const handleOrderPreview = (orderId: number) => {
    window.open(`/orders/${orderId}/view-docx`, "_blank", "noopener,noreferrer")
  }
  const handleOrderDownload = (orderId: number) => {
    window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/download`, "_blank")
  }

  if (isLoading) return <div className="px-4 py-3"><Skeleton className="h-20 w-full" /></div>
  if (!history || !periods?.length) return <div className="px-4 py-3 text-sm text-muted-foreground">Нет данных о периодах и истории отпусков</div>

  const sortedPeriods = [...periods].sort((a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime())
  const openPeriods = sortedPeriods.filter(p => p.remaining_days > 0)
  const closedPeriods = sortedPeriods.filter(p => p.remaining_days === 0)
  const displayedPeriods = showClosedPeriods ? sortedPeriods : openPeriods

  return (
    <div className="px-4 py-1.5 space-y-0.5 bg-muted/20 rounded-lg border">
      <div className="flex justify-between items-center mb-2">
        {closedPeriods.length > 0 ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowClosedPeriods(!showClosedPeriods)}>
            {showClosedPeriods ? <>Скрыть закрытые периоды ({closedPeriods.length})</> : <>Показать закрытые периоды ({closedPeriods.length})</>}
          </Button>
        ) : <div />}
        <Button variant="outline" size="sm" className="h-7 text-xs text-slate-500" onClick={() => setRecalculateAlertOpen(true)}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Пересоздать трудовые периоды
        </Button>
      </div>

      {displayedPeriods.map((p, idx) => {
        const periodVacations = p.vacations || []
        const isClosed = p.remaining_days === 0
        const prevPeriod = idx > 0 ? displayedPeriods[idx - 1] : null
        const dividerDate = prevPeriod ? getSeriesDivider(p.period_start, prevPeriod.period_start) : null

        return (
          <Fragment key={p.period_id}>
            {dividerDate && (
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-amber-300" />
                <span className="text-[10px] font-medium text-amber-600 whitespace-nowrap bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Периоды до корректировки от {formatDate(dividerDate)}
                </span>
                <div className="flex-1 h-px bg-amber-300" />
              </div>
            )}

            <div className={`flex gap-3 border border-muted/30 rounded ${isClosed ? 'opacity-60' : ''}`}>
              <div className="basis-[50%] min-w-[320px] bg-card py-1.5 px-2">
                <div className="flex items-start gap-1">
                  <div className="shrink-0 min-w-[185px]">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="font-semibold bg-muted px-1.5 py-0.5 rounded text-[10px]">{p.year_number}-й г.</span>
                          <span className="text-muted-foreground">{formatDate(p.period_start)} — {formatDate(p.period_end)}</span>
                          {isClosed && <Badge variant="secondary" className="text-[10px] px-1 py-0">Закрыт</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <span className="text-muted-foreground">{p.main_days}+{p.additional_days}</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="font-medium text-blue-600 tabular-nums">{p.used_days} исп.</span>
                      <span className="text-muted-foreground">|</span>
                      <span className={`font-semibold ${p.remaining_days < 7 ? "text-red-600" : p.remaining_days < 14 ? "text-amber-600" : "text-green-600"}`}>
                        {p.remaining_days}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 border-l border-muted/40 pl-2">
                  {p.transactions && p.transactions.length > 0 ? (
                    <div className="space-y-1">
                      {[...p.transactions]
                        .sort((a, b) => {
                          const ta = a.created_at ? new Date(a.created_at).getTime() : 0
                          const tb = b.created_at ? new Date(b.created_at).getTime() : 0
                          if (ta !== tb) return ta - tb
                          const pa = transactionPriority(a.transaction_type)
                          const pb = transactionPriority(b.transaction_type)
                          if (pa !== pb) return pa - pb
                          return a.id - b.id
                        })
                        .map((tx, txIndex) => {
                          const isManualClosure = tx.transaction_type === "manual_close" || tx.transaction_type === "partial_close"
                          const isRestored = tx.source_type === "manual_closure_rebuild"
                          return (
                        <div key={tx.id} className={`text-[11px] leading-tight group/tx ${isRestored ? "text-amber-600 dark:text-amber-400" : ""}`}>
                          <span className="text-muted-foreground mr-1">{txIndex + 1}.</span>
                          <span className="font-medium">{formatTransactionType(tx.transaction_type)}</span>
                          {isRestored && <span className="ml-1 text-[10px]">(восстановлено)</span>}
                          {tx.order_number && <span className="text-muted-foreground"> по приказу №{tx.order_number}</span>}
                          <span className="tabular-nums">—{tx.days_count} дн.</span>
                          {tx.created_at && <span className="text-muted-foreground ml-1">({formatDateTime(tx.created_at)})</span>}
                          {isManualClosure && (
                            <button
                              onClick={() => setCancelTxId(tx.id)}
                              className="ml-1 text-red-400 hover:text-red-600 opacity-0 group-hover/tx:opacity-100 transition-opacity"
                              title="Отменить закрытие"
                            >
                              <X className="h-3 w-3 inline" />
                            </button>
                          )}
                          {isManualClosure && tx.description && (
                            <div className="text-[10px] text-muted-foreground ml-4">{tx.description}</div>
                          )}
                        </div>
                          )
                        })}
                    </div>
                  ) : <span className="text-[11px] text-muted-foreground">Нет операций</span>}
                  </div>
                </div>
              </div>

              <div className="basis-[50%] min-w-0 bg-muted/30">
                {periodVacations.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground py-2">Нет отпусков</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-muted/40">
                        <th className="text-left px-2 py-1 font-medium">Начало</th>
                        <th className="text-left px-2 py-1 font-medium">Конец</th>
                        <th className="text-left px-2 py-1 font-medium">Дней</th>
                        <th className="text-left px-2 py-1 font-medium">Приказ</th>
                        <th className="text-left px-2 py-1 font-medium">Комментарий</th>
                        <th className="w-[44px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodVacations.map((v) => (
                        <VacationPeriodVacationRow
                          key={v.id}
                          vacation={v}
                          onPreview={handleOrderPreview}
                          onDownload={handleOrderDownload}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Fragment>
        )
      })}

      {/** Диалог отмены ручного закрытия */}
      <AlertDialog open={cancelTxId !== null} onOpenChange={(open) => !open && setCancelTxId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить ручное закрытие?</AlertDialogTitle>
            <AlertDialogDescription>
              Дни будут возвращены в остаток периода.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelTxId) cancelTransactionMutation.mutate(cancelTxId)
                setCancelTxId(null)
              }}
              className="bg-red-600 hover:bg-red-700"
              autoFocus
            >
              Отменить закрытие
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Диалог пересоздания периодов */}
      {recalculateAlertOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => !isRecalculating && setRecalculateAlertOpen(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Пересоздать трудовые периоды</h3>
            <p className="text-sm text-muted-foreground mb-4">Периоды будут пересозданы и дни отпусков заново распределены по порядку.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRecalculateAlertOpen(false)} disabled={isRecalculating}>Отмена</Button>
              <Button onClick={handleRecalculateConfirm} disabled={isRecalculating}>
                {isRecalculating ? (
                  <span className="flex items-center gap-1.5"><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Пересоздание...</span>
                ) : "Пересоздать"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
