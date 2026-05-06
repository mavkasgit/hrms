import { useState, useEffect, useMemo, Fragment } from "react"
import { RefreshCw, Eye, Download } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { Badge } from "@/shared/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import {
  useEmployeeVacationHistory,
} from "@/entities/vacation"
import { useVacationPeriods, useRecalculateVacationPeriods } from "@/entities/vacation-period"
import { useHireDateAdjustments } from "@/entities/hire-date-adjustment/useHireDateAdjustments"
import type { VacationPeriodVacation } from "@/entities/vacation-period/types"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function formatTransactionType(type: string): string {
  switch (type) {
    case "auto_use": return "Автосписание"
    case "manual_close": return "Ручное закрытие"
    case "partial_close": return "Частичное закрытие"
    case "restore": return "Восстановление"
    default: return type
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

            <div className={`flex gap-2 border border-muted/30 rounded ${isClosed ? 'opacity-60' : ''}`}>
              <div className="w-1/2 min-w-[280px] bg-card py-1.5 px-2 flex items-center gap-2">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 cursor-help rounded hover:ring-1 hover:ring-gray-300 hover:ring-inset transition-shadow">
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 flex-wrap">
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
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" sideOffset={4} avoidCollisions={true} className="bg-white text-gray-900 border border-gray-200 shadow-xl w-max">
                      {p.transactions && p.transactions.length > 0 ? (
                        <div className="space-y-1">
                          {p.transactions.map((tx) => (
                            <div key={tx.id} className="text-xs whitespace-nowrap">
                              <span className="font-medium">{formatTransactionType(tx.transaction_type)}</span>
                              {tx.order_number && <span className="text-muted-foreground"> по приказу №{tx.order_number}</span>}
                              {!tx.order_number && tx.order_id && <span className="text-muted-foreground"> (приказ #{tx.order_id})</span>}
                              <span className="tabular-nums"> — {tx.days_count > 0 ? `+${tx.days_count}` : tx.days_count} дн.</span>
                              {tx.created_at && <span className="text-muted-foreground ml-1">({formatDate(tx.created_at)})</span>}
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Нет операций</span>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="flex-1 bg-muted/30">
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
                      {periodVacations.map((v: VacationPeriodVacation) => (
                        <tr key={v.id} className={`border-b border-muted/30 ${v.is_cancelled ? "opacity-40" : ""} ${v.is_recalled ? "bg-amber-50" : ""}`}>
                          <td className="px-2 py-1">{formatDate(v.start_date)}</td>
                          <td className="px-2 py-1">
                            {formatDate(v.end_date)}
                            {v.is_recalled && v.recall_date && <div className="text-[9px] text-amber-600 mt-0.5">Отозван {formatDate(v.recall_date)}</div>}
                          </td>
                          <td className="px-2 py-1">
                            {v.days_count}
                            {v.is_recalled && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1 bg-amber-100 text-amber-700 border-amber-200">Отозван</Badge>}
                          </td>
                          <td className="px-2 py-1">
                            {v.order_number || "—"}
                            {v.is_recalled && v.recall_order_number && <div className="text-[9px] text-amber-600 mt-0.5">Отзыв: №{v.recall_order_number}</div>}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground text-[10px]">{v.comment || "—"}</td>
                          <td className="px-1 py-1">
                            {v.order_id && (
                              <div className="flex gap-0.5">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400 hover:text-blue-600" onClick={() => handleOrderPreview(v.order_id!)} title="Просмотр приказа"><Eye className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-400 hover:text-green-600" onClick={() => handleOrderDownload(v.order_id!)} title="Скачать приказ"><Download className="h-4 w-4" /></Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Fragment>
        )
      })}

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
