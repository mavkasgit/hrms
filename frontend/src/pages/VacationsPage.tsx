import { useState, useEffect, useMemo, Fragment } from "react"
import { ChevronDown, ChevronRight, Trash2, X, ScrollText, RefreshCw, Eye, Download, Pencil, ArrowUp, ArrowDown, ArrowUpDown, Printer, FilePen } from "lucide-react"
import { renderIcon } from "@/pages/structure-page/shared/EntityDialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/tabs"
import {
  useCreateVacation,
  useDeleteVacation,
  useCancelVacation,
  useVacationEmployeesSummary,
  useEmployeeVacationHistory,
  useHolidays,
} from "@/entities/vacation"
import { useVacationPeriods, useClosePeriod, usePartialClosePeriod, useRecalculateVacationPeriods, VacationPeriodVacation } from "@/entities/vacation-period"
import { useUpdateEmployee } from "@/entities/employee/useEmployees"
import { EmployeeSearch } from "@/features/employee-search"
import { useAllOrderTypes } from "@/entities/order/useOrders"
import { useCreateOrderDraft } from "@/entities/order/useOnlyOffice"
import { useTags } from "@/entities/tag/useTags"
import type { OrderCreate } from "@/entities/order/types"
import { OrderNumberField } from "@/features/OrderNumberField"
import { GlobalAuditLog } from "@/features/global-audit-log"
import type { Employee } from "@/entities/employee/types"
import { VacationRecallForm } from "./VacationRecallForm"
import { VacationPostponeForm } from "./VacationPostponeForm"

const VACATION_ORDER_CODE = "vacation_paid"

const DEFAULT_VACATION_TYPE = "Трудовой"

// Convert ISO date (YYYY-MM-DD) to DD.MM.YYYY
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10) // обрезаем время если есть
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

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Expandable history row
interface EmployeeHistoryRowProps {
  employeeId: number
  partialClosePeriodId: number | null
  setPartialClosePeriodId: (value: number | null) => void
  partialCloseRemaining: string
  setPartialCloseRemaining: (value: string) => void
  handlePartialClosePeriod: () => void
  closePeriodMutation: any
  setSuccessMessage: (msg: string | null) => void
  closingPeriodId: number | null
  setClosingPeriodId: (id: number | null) => void
  recalculatePeriodsMutation: any
}

function EmployeeHistoryRow({ 
  employeeId,
  partialClosePeriodId,
  setPartialClosePeriodId,
  partialCloseRemaining,
  setPartialCloseRemaining,
  handlePartialClosePeriod,
  closePeriodMutation,
  setSuccessMessage,
  closingPeriodId,
  setClosingPeriodId,
  recalculatePeriodsMutation,
}: EmployeeHistoryRowProps) {
  const { data: history, isLoading } = useEmployeeVacationHistory(employeeId)
  const { data: periodsRaw } = useVacationPeriods(employeeId)
  const periods = Array.isArray(periodsRaw) ? periodsRaw : []
  const deleteVacationMutation = useDeleteVacation()
  const cancelVacationMutation = useCancelVacation()

  const [cancelId, setCancelId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showClosedPeriods, setShowClosedPeriods] = useState(false)
  const [recalculateAlertOpen, setRecalculateAlertOpen] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)

  // Определяем, есть ли открытые периоды (до early return для соблюдения Rules of Hooks)
  const hasOpenPeriods = periods.filter(p => p.remaining_days > 0).length > 0
  const hasClosedPeriods = periods.filter(p => p.remaining_days === 0).length > 0

  useEffect(() => {
    if (periods && !hasOpenPeriods && hasClosedPeriods) {
      setShowClosedPeriods(true)
    }
  }, [periods, hasOpenPeriods, hasClosedPeriods])

  const handleCancelConfirm = () => {
    if (cancelId) cancelVacationMutation.mutate(cancelId)
    setCancelId(null)
  }

  const handleDeleteConfirm = () => {
    if (deleteId) deleteVacationMutation.mutate(deleteId)
    setDeleteId(null)
  }

  const handleOrderPreview = (orderId: number) => {
    window.open(`/orders/${orderId}/view-docx`, "_blank", "noopener,noreferrer")
  }

  const handleOrderDownload = (orderId: number) => {
    window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/download`, "_blank")
  }

  const handleRecalculateConfirm = () => {
    setIsRecalculating(true)
    const startTime = Date.now()

    const finishRecalculate = () => {
      const elapsed = Date.now() - startTime
      const minDelay = 1500
      const remaining = Math.max(0, minDelay - elapsed)
      setTimeout(() => {
        setIsRecalculating(false)
        setRecalculateAlertOpen(false)
      }, remaining)
    }

    recalculatePeriodsMutation.mutate(employeeId, {
      onSettled: finishRecalculate,
      onSuccess: () => {
        setSuccessMessage("Периоды пересозданы")
        setTimeout(() => setSuccessMessage(null), 3000)
      }
    })
  }

  if (isLoading) return <div className="px-4 py-3"><Skeleton className="h-20 w-full" /></div>
  if (!history || !periods) return <div className="px-4 py-3 text-sm text-muted-foreground">Нет данных</div>
  
  // Разделяем периоды на открытые и закрытые
  // Сортируем от новых к старым (год по убыванию)
  const sortedPeriods = [...periods].sort((a, b) => b.year_number - a.year_number)
  const openPeriods = sortedPeriods.filter(p => p.remaining_days > 0)
  const closedPeriods = sortedPeriods.filter(p => p.remaining_days === 0)

  const displayedPeriods = showClosedPeriods ? sortedPeriods : openPeriods

  return (
    <>
    <div className="px-4 py-1.5 space-y-0.5 bg-muted/20">
      {/* Кнопка показа закрытых периодов - слева под ФИО */}
      <div className="flex justify-between items-center mb-2">
        {closedPeriods.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowClosedPeriods(!showClosedPeriods)}
          >
            {showClosedPeriods ? (
              <>Скрыть закрытые периоды ({closedPeriods.length})</>
            ) : (
              <>Показать закрытые периоды ({closedPeriods.length})</>
            )}
          </Button>
        ) : (
          <div />
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-slate-500"
          onClick={() => setRecalculateAlertOpen(true)}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Пересоздать трудовые периоды
        </Button>
      </div>
      
      {displayedPeriods.map((p) => {
        const periodVacations = p.vacations || []
        const isClosed = p.remaining_days === 0
        const isClosing = closingPeriodId === p.period_id
        
        return (
          <div key={p.period_id} className={`flex gap-2 border border-muted/30 rounded ${isClosed ? 'opacity-60' : ''} ${isClosing ? 'border-blue-400 bg-blue-50' : ''}`}>
            {/* Левая часть — период */}
<div className="w-1/2 min-w-[280px] bg-card py-1.5 px-2 flex items-center gap-2">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1 cursor-help rounded hover:ring-1 hover:ring-gray-300 hover:ring-inset transition-shadow">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold bg-muted px-1.5 py-0.5 rounded text-[10px]">{p.year_number}-й г.</span>
                            <span className="text-muted-foreground">{formatDate(p.period_start)} — {formatDate(p.period_end)}</span>
                            {isClosed && <Badge variant="secondary" className="text-[10px] px-1 py-0">Закрыт</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-1">
                        <span className="text-muted-foreground">
                          {p.main_days}+{p.additional_days}
                        </span>
                        <span className="text-muted-foreground">|</span>
                        <span className="font-medium text-blue-600 tabular-nums">{p.used_days} исп.</span>
                        <span className="text-muted-foreground">|</span>
                        <span className={`font-semibold ${p.remaining_days < 7 ? "text-red-600" : p.remaining_days < 14 ? "text-amber-600" : "text-green-600"}`}>
                          {p.remaining_days}
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    avoidCollisions={true}
                    className="bg-white text-gray-900 border border-gray-200 shadow-xl w-max"
                  >
                    {p.transactions && p.transactions.length > 0 ? (
                      <div className="space-y-1">
                        {p.transactions.map((tx) => (
                          <div key={tx.id} className="text-xs whitespace-nowrap">
                            <span className="font-medium">{formatTransactionType(tx.transaction_type)}</span>
                            {tx.order_number && (
                              <span className="text-muted-foreground"> по приказу №{tx.order_number}</span>
                            )}
                            {!tx.order_number && tx.order_id && (
                              <span className="text-muted-foreground"> (приказ #{tx.order_id})</span>
                            )}
                            <span className="tabular-nums"> — {tx.days_count > 0 ? `+${tx.days_count}` : tx.days_count} дн.</span>
                            {tx.created_at && (
                              <span className="text-muted-foreground ml-1">({formatDate(tx.created_at)})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Нет операций</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Кнопки управления периодом */}
              {
                <>
                  {isClosed ? (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 whitespace-nowrap"
                        onClick={() => {
                          setPartialClosePeriodId(p.period_id)
                          setPartialCloseRemaining(String(p.remaining_days))
                        }}
                      >
                        Восстановить период
</Button>
                    </div>
                  ) : (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 whitespace-nowrap"
                        disabled={closingPeriodId === p.period_id}
                        onClick={() => {
                          setClosingPeriodId(p.period_id)
                          closePeriodMutation.mutate(p.period_id, {
                            onSuccess: () => {
                              // Задержка 1 сек чтобы успеть увидеть анимацию
                              setTimeout(() => {
                                setClosingPeriodId(null)
                                setSuccessMessage("Период полностью закрыт")
                                setTimeout(() => setSuccessMessage(null), 3000)
                              }, 1000)
                            },
                            onError: () => {
                              setClosingPeriodId(null)
                            }
                          })
                        }}
                      >
                        {closingPeriodId === p.period_id ? (
                          <span className="flex items-center gap-1">
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span>Закрытие...</span>
                          </span>
                        ) : (
                          "Закрыть период"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 whitespace-nowrap"
                        onClick={() => {
                          setPartialClosePeriodId(p.period_id)
                          setPartialCloseRemaining(String(p.remaining_days))
                        }}
                      >
                        Частично закрыть
                      </Button>
                    </div>
                  )}
                </>
              }
            </div>

            {/* Правая часть — отпуска за период */}
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
                      <tr key={v.id} className={`border-b border-muted/30 ${v.is_cancelled ? "opacity-40" : ""}`}>
                        <td className="px-2 py-1">{formatDate(v.start_date)}</td>
                        <td className="px-2 py-1">{formatDate(v.end_date)}</td>
                        <td className="px-2 py-1">{v.days_count}</td>
                        <td className="px-2 py-1">{v.order_number || "—"}</td>
                        <td className="px-2 py-1 text-muted-foreground text-[10px]">{v.comment || "—"}</td>
                        <td className="px-1 py-1">
                          <div className="flex gap-0.5">
                            {v.order_id && (
                              <>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400 hover:text-blue-600" onClick={() => handleOrderPreview(v.order_id!)} title="Просмотр приказа">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-400 hover:text-green-600" onClick={() => handleOrderDownload(v.order_id!)} title="Скачать приказ">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {!v.is_cancelled && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-500 hover:text-amber-700" onClick={() => setCancelId(v.id)} title="Отменить">
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => setDeleteId(v.id)} title="Удалить">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })}
    </div>

    <AlertDialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить отпуск?</AlertDialogTitle>
          <AlertDialogDescription>
            Дни будут возвращены в остаток.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleCancelConfirm} className="bg-amber-600 hover:bg-amber-700" autoFocus>
            Отменить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить отпуск безвозвратно?</AlertDialogTitle>
          <AlertDialogDescription>
            Отпуск будет удален безвозвратно. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700" autoFocus>
            Удалить навсегда
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Диалог пересоздания периодов */}
    <AlertDialog open={recalculateAlertOpen} onOpenChange={setRecalculateAlertOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Пересоздать трудовые периоды</AlertDialogTitle>
          <AlertDialogDescription>
            Периоды будут пересозданы и дни отпусков заново распределены по порядку.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setRecalculateAlertOpen(false)} disabled={isRecalculating}>Отмена</AlertDialogCancel>
          <Button
            onClick={handleRecalculateConfirm}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isRecalculating}
          >
            {isRecalculating ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Пересоздание...
              </span>
            ) : (
              "Пересоздать"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Диалог частичного закрытия периода */}
    <AlertDialog open={partialClosePeriodId !== null} onOpenChange={(open) => !open && setPartialClosePeriodId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Частично закрыть период</AlertDialogTitle>
          <AlertDialogDescription>
            Укажите сколько дней должно остаться в периоде. Остальные дни будут списаны.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium">Остаток дней</label>
          <Input
            type="number"
            min="0"
            value={partialCloseRemaining}
            onChange={(e) => setPartialCloseRemaining(e.target.value)}
            placeholder="Введите количество дней"
            className="mt-2"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handlePartialClosePeriod} autoFocus>
            Применить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

export function VacationsPage() {
  // --- Form state ---
  const [activeTab, setActiveTab] = useState<"vacation" | "recall" | "postpone">("vacation")
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [orderNumber, setOrderNumber] = useState("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Holidays for vacation calculation
  const startYear = startDate ? new Date(startDate).getFullYear() : undefined
  const endYear = endDate ? new Date(endDate).getFullYear() : undefined
  const { data: startYearHolidays } = useHolidays(startYear)
  const { data: endYearHolidays } = useHolidays(endYear !== startYear ? endYear : undefined)
  
  // Period management state
  const [partialClosePeriodId, setPartialClosePeriodId] = useState<number | null>(null)
  const [partialCloseRemaining, setPartialCloseRemaining] = useState("")
  const [closingPeriodId, setClosingPeriodId] = useState<number | null>(null)

  // Print preview state
  const [printOpen, setPrintOpen] = useState(false)
  const [printSelectedTagIds, setPrintSelectedTagIds] = useState<number[]>([])
  const [printSelectedDeptIds, setPrintSelectedDeptIds] = useState<number[]>([])

  const [draftId, setDraftId] = useState<string | null>(null)
  const [preselectedRecallVacationId, setPreselectedRecallVacationId] = useState<number | null>(null)

  const { data: allTags } = useTags()
  const { data: orderTypes = [] } = useAllOrderTypes()
  const createMutation = useCreateVacation()
  const createDraftMutation = useCreateOrderDraft()
  const vacationOrderType = orderTypes.find((item) => item.code === VACATION_ORDER_CODE) ?? null

  // Получаем остаток дней сотрудников для поиска
  const { data: employeesSummary } = useVacationEmployeesSummary()

  const handleEmployeeChange = (emp: Employee | null) => {
    setSelectedEmployee(emp)
    setErrors({})
    setPreselectedRecallVacationId(null)
    if (emp) {
      setExpandedRows(new Set([emp.id]))
    } else {
      setExpandedRows(new Set())
    }
  }

  const resetForm = () => {
    setSelectedEmployee(null)
    setStartDate("")
    setEndDate("")
    setOrderNumber("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setErrors({})
    setDraftId(null)
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedEmployee) newErrors.employee = "Выберите сотрудника"
    if (!startDate) newErrors.startDate = "Укажите дату начала"
    if (!endDate) newErrors.endDate = "Укажите дату конца"
    if (startDate && endDate && endDate < startDate) newErrors.endDate = "Дата конца раньше даты начала"
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isPending = createMutation.isPending || createDraftMutation.isPending

  const buildOrderPayload = (): OrderCreate => ({
    employee_id: selectedEmployee!.id,
    order_type_id: vacationOrderType!.id,
    order_date: orderDate,
    order_number: orderNumber || null,
    extra_fields: {
      vacation_start: startDate,
      vacation_end: endDate,
      vacation_days: 0,
      vacation_type: DEFAULT_VACATION_TYPE,
    },
  })

  const buildVacationPayload = (overrides: Record<string, unknown> = {}) => ({
    employee_id: selectedEmployee!.id,
    start_date: startDate,
    end_date: endDate,
    vacation_type: DEFAULT_VACATION_TYPE,
    order_date: orderDate,
    order_number: orderNumber || undefined,
    ...overrides,
  })

  const handleEditBeforeCreate = () => {
    if (!validate() || !vacationOrderType || !selectedEmployee) return
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(buildOrderPayload(), {
      onSuccess: (draft) => {
        setDraftId(draft.draft_id)
        const url = `/orders/drafts/${draft.draft_id}/edit-docx`
        if (editorWindow && !editorWindow.closed) {
          editorWindow.location.href = url
        } else {
          window.open(url, "_blank", "noopener,noreferrer")
        }
      },
      onError: (err: any) => {
        editorWindow?.close()
        console.error("[VacationsPage] draft error:", err)
        setSuccessMessage("Ошибка при подготовке DOCX-черновика")
        setTimeout(() => setSuccessMessage(null), 3000)
      },
    })
  }

  const handleCreateFromDraft = () => {
    if (!draftId || !validate()) return
    createMutation.mutate(
      buildVacationPayload({ draft_id: draftId }),
      { 
        onSuccess: () => {
          setSuccessMessage("Отпуск успешно создан!")
          setTimeout(() => setSuccessMessage(null), 5000)
          resetForm()
        },
        onError: (error: any) => {
          console.error("[VacationsPage] mutation error:", error)
        }
      }
    )
  }

  useEffect(() => {
    const handleDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== draftId) return
      handleCreateFromDraft()
    }

    window.addEventListener("message", handleDraftSave)
    return () => window.removeEventListener("message", handleDraftSave)
  }, [draftId, selectedEmployee, startDate, endDate, orderDate, orderNumber])

  // --- Vacation periods for selected employee ---
  const closePeriodMutation = useClosePeriod()
  const partialClosePeriodMutation = usePartialClosePeriod()
  const recalculatePeriodsMutation = useRecalculateVacationPeriods()

  const handlePartialClosePeriod = () => {
    if (partialClosePeriodId) {
      const remaining = parseInt(partialCloseRemaining, 10)
      if (!isNaN(remaining) && remaining >= 0) {
        partialClosePeriodMutation.mutate(
          { periodId: partialClosePeriodId, remainingDays: remaining },
          {
            onSuccess: () => {
              setSuccessMessage("Период частично закрыт")
              setTimeout(() => setSuccessMessage(null), 3000)
            }
          }
        )
      }
    }
    setPartialClosePeriodId(null)
    setPartialCloseRemaining("")
  }

  // --- Main table state ---
  const [searchName, setSearchName] = useState("")
  const debouncedSearch = useDebounce(searchName, 300)
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">("active")
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [editingAddDays, setEditingAddDays] = useState<number | null>(null)
  const [editingAddDaysValue, setEditingAddDaysValue] = useState("")
  const updateAddDaysMutation = useUpdateEmployee()

  // Сортировка
  type SortField = "name" | "tab_number" | "department" | "tags" | "position" | "remaining_days" | "additional_vacation_days" | "hire_date"
  type SortOrder = "asc" | "desc"
  interface SortConfig { field: SortField; order: SortOrder }
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([])

  const handleSort = (field: SortField) => {
    setSortConfigs((prev) => {
      const existing = prev.find((c) => c.field === field)
      if (!existing) return [...prev, { field, order: "asc" }]
      if (existing.order === "asc") return prev.map((c) => c.field === field ? { ...c, order: "desc" } : c)
      return prev.filter((c) => c.field !== field)
    })
  }

  const renderSortIcon = (field: SortField) => {
    const config = sortConfigs.find((c) => c.field === field)
    const sortIndex = sortConfigs.findIndex((c) => c.field === field) + 1
    if (!config) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline" />
    return (
      <span className="inline-flex items-center ml-1">
        <span className="text-xs text-muted-foreground">{sortIndex}</span>
        {config.order === "asc" ? <ArrowUp className="h-3 w-3 ml-0.5" /> : <ArrowDown className="h-3 w-3 ml-0.5" />}
      </span>
    )
  }

  const { data: employees, isLoading: employeesLoading } = useVacationEmployeesSummary(
    debouncedSearch || undefined,
    archiveFilter
  )

  const toggleRow = (empId: number) => {
    // Переключаем только для выбранного сотрудника - все остальные схлопываем
    setExpandedRows((prev) => {
      const next = new Set<number>()
      if (!prev.has(empId)) {
        next.add(empId)
      }
      return next
    })
  }

  const filteredEmployees = employees?.filter((emp) => {
    // Если выбран сотрудник - показываем только его
    if (selectedEmployee) {
      return emp.id === selectedEmployee.id
    }
    // Иначе фильтруем по поиску
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      emp.name.toLowerCase().includes(q) ||
      (emp.tab_number && String(emp.tab_number).toLowerCase().includes(q))
    )
  })

  const sortedEmployees = useMemo(() => {
    if (!filteredEmployees || sortConfigs.length === 0) return filteredEmployees ?? []
    return [...filteredEmployees].sort((a, b) => {
      for (const { field, order } of sortConfigs) {
        let aVal: string | number
        let bVal: string | number
        if (field === "department") {
          aVal = a.department ?? ""
          bVal = b.department ?? ""
        } else if (field === "tags") {
          aVal = a.tags?.[0]?.name ?? ""
          bVal = b.tags?.[0]?.name ?? ""
        } else if (field === "remaining_days") {
          aVal = a.remaining_days ?? -999999
          bVal = b.remaining_days ?? -999999
        } else if (field === "tab_number") {
          aVal = a.tab_number ?? 0
          bVal = b.tab_number ?? 0
        } else if (field === "position") {
          aVal = a.position ?? ""
          bVal = b.position ?? ""
        } else if (field === "additional_vacation_days") {
          aVal = a.additional_vacation_days ?? 0
          bVal = b.additional_vacation_days ?? 0
        } else if (field === "hire_date") {
          aVal = a.hire_date ?? ""
          bVal = b.hire_date ?? ""
        } else {
          aVal = (a[field] ?? "") as string | number
          bVal = (b[field] ?? "") as string | number
        }
        if (aVal < bVal) return order === "asc" ? -1 : 1
        if (aVal > bVal) return order === "asc" ? 1 : -1
      }
      return 0
    })
  }, [filteredEmployees, sortConfigs])

  const printFilteredEmployees = useMemo(() => {
    return sortedEmployees.filter((emp) => {
      const tagMatch =
        printSelectedTagIds.length === 0 ||
        printSelectedTagIds.some((tagId) => emp.tags?.some((t) => t.id === tagId))
      const deptMatch =
        printSelectedDeptIds.length === 0 ||
        printSelectedDeptIds.includes(emp.department_id ?? -1)
      return tagMatch && deptMatch
    })
  }, [sortedEmployees, printSelectedTagIds, printSelectedDeptIds])

  return (
    <div className="space-y-4">
      {/* Success Alert */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <svg className="h-5 w-5 text-green-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Трудовой отпуск</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Печать
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAuditLogOpen(true)}>
            <ScrollText className="mr-2 h-4 w-4" />
            Журнал
          </Button>
        </div>
      </div>

{/* --- Vacation periods block removed --- */}
      {/* removed: periods now shown in employee table */}

      {/* --- Create vacation form with tabs --- */}
      <div className="border rounded-lg bg-card">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "vacation" | "recall" | "postpone")}>
          <div className="px-4 py-3 border-b">
            <TabsList>
              <TabsTrigger value="vacation">Создать трудовой отпуск</TabsTrigger>
              <TabsTrigger value="recall">Отзыв из отпуска</TabsTrigger>
              <TabsTrigger value="postpone">Перенос отпуска</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="vacation" className="px-4 py-4 m-0">
            <div className="grid gap-4">
              <EmployeeSearch
                value={selectedEmployee}
                onChange={handleEmployeeChange}
                error={errors.employee}
                required
                renderOptionExtra={(emp) => {
                  const summary = employeesSummary?.find((e) => e.id === emp.id)
                  const remaining = summary?.remaining_days
                  if (remaining === null || remaining === undefined) return null
                  return (
                    <span className={`font-semibold text-xs ${
                      remaining < 7 ? "text-red-600" : remaining < 14 ? "text-amber-600" : "text-green-600"
                    }`}>
                      {remaining} дн.
                    </span>
                  )
                }}
                renderValueExtra={(emp) => {
                  const summary = employeesSummary?.find((e) => e.id === emp.id)
                  const remaining = summary?.remaining_days
                  if (remaining === null || remaining === undefined) return null
                  return (
                    <span className={`text-sm font-semibold shrink-0 ${
                      remaining < 7 ? "text-red-600" : remaining < 14 ? "text-amber-600" : "text-green-600"
                    }`}>
                      {remaining} дн.
                    </span>
                  )
                }}
              />

              <div className="flex gap-4 items-end">
                <div className="w-[130px]">
                  <DatePicker label="Дата приказа *" value={orderDate} onChange={setOrderDate} />
                  {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}
                </div>
                <OrderNumberField
                  value={orderNumber}
                  onChange={setOrderNumber}
                  orderTypeId={vacationOrderType?.id}
                  orderTypes={orderTypes}
                  required
                  error={errors.orderNumber}
                />
                <div className="w-[130px]">
                  <DatePicker label="Дата начала *" value={startDate} onChange={setStartDate} />
                  {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
                </div>
                <div className="w-[130px]">
                  <DatePicker label="Дата конца *" value={endDate} onChange={setEndDate} />
                  {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
                </div>
                {startDate && endDate && (
                  <div className="flex-1 min-w-[200px]">
                    {(() => {
                      const allHolidays = [...(startYearHolidays || []), ...(endYearHolidays || [])]
                      const uniqueHolidays = allHolidays.filter((h, i, arr) =>
                        arr.findIndex((t) => t.date === h.date) === i
                      )
                      const holidaysInRange = uniqueHolidays.filter((h) => {
                        const d = h.date.slice(0, 10)
                        return d >= startDate && d <= endDate
                      })
                      const calendarDays =
                        Math.round(
                          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        ) + 1
                      const totalDays = Math.max(0, calendarDays - holidaysInRange.length)
                      return (
                        <div className="text-xs space-y-0.5">
                          {holidaysInRange.length > 0 && (
                            <>
                              <div className="flex gap-2">
                                <span className="text-muted-foreground">Календарных дней:</span>
                                <span className="font-medium">{calendarDays}</span>
                              </div>
                              <div className="flex gap-2">
                                <span className="text-muted-foreground">Праздники:</span>
                                <span className="font-medium">
                                  {holidaysInRange.map((h) => `${formatDate(h.date)} ${h.name}`).join(", ")}
                                  {" "}
                                  <span className="text-muted-foreground">({holidaysInRange.length} дн.)</span>
                                </span>
                              </div>
                            </>
                          )}
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Итого дней отпуска:</span>
                            <span className="font-semibold text-foreground">{totalDays}</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => resetForm()}
                  disabled={isPending}
                >
                  Очистить
                </Button>
                {!draftId ? (
                  <Button
                    onClick={() => handleEditBeforeCreate()}
                    disabled={isPending}
                  >
                    <FilePen className="mr-2 h-4 w-4" />
                    {createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleCreateFromDraft()}
                    disabled={isPending}
                  >
                    {createMutation.isPending ? "Создание..." : "Создать приказ"}
                  </Button>
                )}
              </div>
              {createMutation.isError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Ошибка: {(createMutation.error as any)?.response?.data?.detail || (createMutation.error as any)?.message || "Неизвестная ошибка"}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="recall" className="m-0">
            <div className="px-4 py-4">
              <EmployeeSearch
                value={selectedEmployee}
                onChange={handleEmployeeChange}
                error={errors.employee}
                required
                renderOptionExtra={(emp) => {
                  const summary = employeesSummary?.find((e) => e.id === emp.id)
                  const remaining = summary?.remaining_days
                  if (remaining === null || remaining === undefined) return null
                  return (
                    <span className={`font-semibold text-xs ${
                      remaining < 7 ? "text-red-600" : remaining < 14 ? "text-amber-600" : "text-green-600"
                    }`}>
                      {remaining} дн.
                    </span>
                  )
                }}
                renderValueExtra={(emp) => {
                  const summary = employeesSummary?.find((e) => e.id === emp.id)
                  const remaining = summary?.remaining_days
                  if (remaining === null || remaining === undefined) return null
                  return (
                    <span className={`text-sm font-semibold shrink-0 ${
                      remaining < 7 ? "text-red-600" : remaining < 14 ? "text-amber-600" : "text-green-600"
                    }`}>
                      {remaining} дн.
                    </span>
                  )
                }}
              />
              <div className="mt-4">
                <VacationRecallForm
                  employee={selectedEmployee}
                  orderTypes={orderTypes}
                  onSuccess={() => {
                    setActiveTab("vacation")
                    setPreselectedRecallVacationId(null)
                  }}
                  onSelectEmployee={(emp) => {
                    handleEmployeeChange(emp)
                  }}
                  preselectedVacationId={preselectedRecallVacationId}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="postpone" className="m-0">
            <div className="px-4 py-4">
              <EmployeeSearch
                value={selectedEmployee}
                onChange={handleEmployeeChange}
                error={errors.employee}
                required
                renderOptionExtra={(emp) => {
                  const summary = employeesSummary?.find((e) => e.id === emp.id)
                  const remaining = summary?.remaining_days
                  if (remaining === null || remaining === undefined) return null
                  return (
                    <span className={`font-semibold text-xs ${
                      remaining < 7 ? "text-red-600" : remaining < 14 ? "text-amber-600" : "text-green-600"
                    }`}>
                      {remaining} дн.
                    </span>
                  )
                }}
                renderValueExtra={(emp) => {
                  const summary = employeesSummary?.find((e) => e.id === emp.id)
                  const remaining = summary?.remaining_days
                  if (remaining === null || remaining === undefined) return null
                  return (
                    <span className={`text-sm font-semibold shrink-0 ${
                      remaining < 7 ? "text-red-600" : remaining < 14 ? "text-amber-600" : "text-green-600"
                    }`}>
                      {remaining} дн.
                    </span>
                  )
                }}
              />
              <div className="mt-4">
                <VacationPostponeForm
                  employee={selectedEmployee}
                  orderTypes={orderTypes}
                  onSuccess={() => {
                    setActiveTab("vacation")
                  }}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* --- Main employees table --- */}
      <div className="flex gap-1 items-center">
        <div className="relative">
          <Input
            placeholder="Поиск по ФИО или таб.№..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-64 h-9 text-sm pr-8"
          />
          {searchName && (
            <button
              onClick={() => setSearchName("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => {
            setSearchName("")
            setSortConfigs([])
            setArchiveFilter("active")
            setSelectedEmployee(null)
            setExpandedRows(new Set())
          }}
        >
          Очистить
        </Button>
        <div className="flex gap-1">
          {(["active", "archived", "all"] as const).map((f) => (
            <Button
              key={f}
              variant={archiveFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setArchiveFilter(f)}
              className="text-xs"
            >
              {f === "active" ? "Активные" : f === "archived" ? "В архиве" : "Все"}
            </Button>
          ))}
        </div>
      </div>

      {employeesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !sortedEmployees.length ? (
        <EmptyState message="Нет сотрудников" description="Нет сотрудников, соответствующих фильтру" />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-[30px] px-2 py-2"></th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("tab_number")}
                >
                  Таб.№ {renderSortIcon("tab_number")}
                </th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  ФИО {renderSortIcon("name")}
                </th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("department")}
                >
                  Подразделение {renderSortIcon("department")}
                </th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("tags")}
                >
                  Теги {renderSortIcon("tags")}
                </th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("position")}
                >
                  Должность {renderSortIcon("position")}
                </th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("remaining_days")}
                >
                  Остаток (период) {renderSortIcon("remaining_days")}
                </th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("additional_vacation_days")}
                >
                  Доп. дни {renderSortIcon("additional_vacation_days")}
                </th>
                <th
                  className="text-left px-4 py-2 font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort("hire_date")}
                >
                  Дата приема {renderSortIcon("hire_date")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp) => {
                const isExpanded = expandedRows.has(emp.id)

                return (
                  <Fragment key={emp.id}>
                    <tr
                      className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => toggleRow(emp.id)}
                    >
                      <td className="px-2 py-2 text-center">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 mx-auto" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{emp.tab_number ?? "—"}</td>
                      <td className="px-4 py-2 font-medium">{emp.name}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          {emp.department_icon
                            ? renderIcon(emp.department_icon, "h-4 w-4 flex-shrink-0", { color: emp.department_color || undefined })
                            : emp.department_color && (
                              <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: emp.department_color }} />
                            )}
                          <span className="truncate">{emp.department}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(emp.tags || []).map((t) => (
                            <TooltipProvider key={t.id} delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-block h-3 w-3 rounded-full cursor-default"
                                    style={{ backgroundColor: t.color || "#94a3b8" }}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  {t.name}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">{emp.position}</td>
                      <td className="px-4 py-2">
                        {emp.remaining_days !== null ? (
                          <span>
                            <span
                              className={
                                emp.remaining_days < 7
                                  ? "text-red-600 font-semibold"
                                  : emp.remaining_days < 14
                                  ? "text-amber-600 font-semibold"
                                  : "text-green-600 font-semibold"
                              }
                            >
                              {emp.remaining_days}
                            </span>
                            {emp.current_period_remaining !== null && emp.current_period_total !== null && emp.current_period_end !== null && (
                              <span className="text-foreground">
                                -({emp.current_period_remaining}/{emp.current_period_total})-{formatDate(emp.current_period_end)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        {editingAddDays === emp.id ? (
                          <div className="w-16 h-8 rounded-md border border-input overflow-hidden">
                            <Input
                              autoFocus
                              value={editingAddDaysValue}
                              onChange={(e) => setEditingAddDaysValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  const num = parseInt(editingAddDaysValue, 10)
                                  if (!isNaN(num) && num >= 0) {
                                    updateAddDaysMutation.mutate({ employeeId: emp.id, data: { additional_vacation_days: num } })
                                  }
                                  setEditingAddDays(null)
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault()
                                  setEditingAddDays(null)
                                }
                              }}
                              onBlur={(e) => {
                                // Не закрываем если это вызвано фокусом на кнопках ✓/✗
                                if (!e.relatedTarget || !e.relatedTarget.closest('button')) {
                                  const num = parseInt(editingAddDaysValue, 10)
                                  if (!isNaN(num) && num >= 0) {
                                    updateAddDaysMutation.mutate({ employeeId: emp.id, data: { additional_vacation_days: num } })
                                  }
                                  setEditingAddDays(null)
                                }
                              }}
                              className="h-full w-full border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-center text-sm"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingAddDays(emp.id); setEditingAddDaysValue(String(emp.additional_vacation_days ?? 0)) }}
                            className="w-16 h-8 rounded-md border border-dashed border-gray-300 hover:border-solid hover:border-gray-400 text-sm font-semibold text-center hover:bg-muted/50 transition-colors flex items-center justify-center gap-1 group"
                            title="Нажмите для редактирования"
                          >
                            {emp.additional_vacation_days ?? 0}
                            <Pencil className="h-3 w-3 text-gray-400" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDate(emp.hire_date)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${emp.id}-history`}>
                        <td colSpan={9} className="p-0">
                          <EmployeeHistoryRow 
                            employeeId={emp.id}
                            partialClosePeriodId={partialClosePeriodId}
                            setPartialClosePeriodId={setPartialClosePeriodId}
                            partialCloseRemaining={partialCloseRemaining}
                            setPartialCloseRemaining={setPartialCloseRemaining}
                            handlePartialClosePeriod={handlePartialClosePeriod}
                            closePeriodMutation={closePeriodMutation}
                            setSuccessMessage={setSuccessMessage}
                            closingPeriodId={closingPeriodId}
                            setClosingPeriodId={setClosingPeriodId}
                            recalculatePeriodsMutation={recalculatePeriodsMutation}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <GlobalAuditLog open={auditLogOpen} onOpenChange={setAuditLogOpen} initialActionFilter="vacation" />

      {/* --- Print preview dialog --- */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="print-preview max-w-4xl max-h-[90vh] overflow-y-auto p-4">
          <style>{`
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                height: auto !important;
                min-height: auto !important;
                overflow: visible !important;
              }
              body * {
                visibility: hidden;
              }
              .print-preview, .print-preview * {
                visibility: visible;
              }
              /* Скрываем всё лишнее в body */
              body > *:not(.print-preview):not([data-radix-focus-guard]) {
                display: none !important;
              }
              /* Скрываем оверлей модалки полностью */
              [data-radix-dialog-overlay],
              [role="presentation"] {
                display: none !important;
                visibility: hidden !important;
              }
              /* Сброс стилей модалки для печати */
              [data-state="open"] > div,
              .print-preview,
              [role="dialog"] {
                position: static !important;
                left: auto !important;
                top: auto !important;
                right: auto !important;
                bottom: auto !important;
                transform: none !important;
                max-width: none !important;
                max-height: none !important;
                min-height: auto !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                outline: none !important;
              }
              .print-preview button,
              .print-preview [role="button"] {
                display: none !important;
              }
              .print-preview .no-print {
                display: none !important;
              }
              .print-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
                font-size: 9px;
              }
              .print-table th,
              .print-table td {
                border: 0.5px solid #000;
                padding: 1px 3px;
                text-align: left;
                vertical-align: top;
                word-wrap: break-word;
                overflow-wrap: break-word;
              }
              .print-table th {
                font-weight: bold;
                background: #e5e5e5;
              }
              .print-table td {
                line-height: 1.2;
              }
              .print-header {
                margin-bottom: 4px;
                text-align: center;
              }
              .print-header span {
                display: inline;
                font-size: 11px;
                margin: 0;
                padding: 0;
              }
            }
          `}</style>
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center justify-between">
              <span>Предпросмотр печати</span>
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" />
                Печать
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-1 mt-1">
            {/* Header */}
            <div className="text-center print-header">
              <span className="text-base font-bold uppercase tracking-wide">Отпуска</span>
              {" "}
              <span className="text-[10px] text-muted-foreground ml-2">
                Дата формирования: {new Date().toLocaleDateString("ru-RU")}
              </span>
            </div>

            {/* Filters (hidden in print) */}
            <div className="no-print space-y-2">
              {/* Department filter */}
              {(() => {
                const deptMap = new Map<number, string>()
                sortedEmployees.forEach((emp) => {
                  if (emp.department_id != null && emp.department) {
                    deptMap.set(emp.department_id, emp.department)
                  }
                })
                const depts = Array.from(deptMap.entries()).sort((a, b) => a[1].localeCompare(b[1], "ru"))
                if (depts.length === 0) return null
                return (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Фильтр по подразделениям:</p>
                    <div className="flex flex-wrap gap-1">
                      {depts.map(([id, name]) => {
                        const isSelected = printSelectedDeptIds.includes(id)
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              setPrintSelectedDeptIds((prev) =>
                                prev.includes(id)
                                  ? prev.filter((d) => d !== id)
                                  : [...prev, id]
                              )
                            }}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-muted-foreground border-border hover:bg-accent"
                            }`}
                          >
                            {name}
                          </button>
                        )
                      })}
                      {printSelectedDeptIds.length > 0 && (
                        <button
                          onClick={() => setPrintSelectedDeptIds([])}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border border-dashed border-gray-400 text-muted-foreground hover:bg-accent transition-colors"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Tag filter */}
              {allTags && allTags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Фильтр по тегам:</p>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((tag) => {
                      const isSelected = printSelectedTagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          onClick={() => {
                            setPrintSelectedTagIds((prev) =>
                              prev.includes(tag.id)
                                ? prev.filter((id) => id !== tag.id)
                                : [...prev, tag.id]
                            )
                          }}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border hover:bg-accent"
                          }`}
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                    {printSelectedTagIds.length > 0 && (
                      <button
                        onClick={() => setPrintSelectedTagIds([])}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border border-dashed border-gray-400 text-muted-foreground hover:bg-accent transition-colors"
                      >
                        Сбросить
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Table */}
            <table className="print-table w-full text-[10px]">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "30%" }} />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left px-0.5 py-0 font-semibold">ФИО</th>
                  <th className="text-left px-0.5 py-0 font-semibold">Остаток (период)</th>
                  <th className="text-left px-0.5 py-0 font-semibold">Теги</th>
                  <th className="text-left px-0.5 py-0 font-semibold">Должность</th>
                </tr>
              </thead>
              <tbody>
                {printSelectedTagIds.length > 0 ? (
                  printSelectedTagIds.map((tagId) => {
                    const tag = allTags?.find((t) => t.id === tagId)
                    const tagEmployees = printFilteredEmployees.filter((emp) =>
                      emp.tags?.some((t) => t.id === tagId)
                    )
                    if (tagEmployees.length === 0) return null
                    return (
                      <Fragment key={tagId}>
                        <tr className="border-b border-gray-300 bg-gray-100">
                          <td colSpan={4} className="px-0.5 py-0 font-bold text-[10px]">
                            {tag?.name}
                          </td>
                        </tr>
                        {tagEmployees.map((emp) => (
                          <tr key={`${tagId}-${emp.id}`} className="border-b border-gray-300">
                            <td className="px-0.5 py-0">{emp.name}</td>
                            <td className="px-0.5 py-0">
                              {emp.remaining_days !== null
                                ? `${emp.remaining_days}${emp.current_period_remaining !== null && emp.current_period_total !== null && emp.current_period_end !== null
                                  ? `-${emp.current_period_remaining}/${emp.current_period_total}-${formatDate(emp.current_period_end)}`
                                  : ""}`
                                : "—"}
                            </td>
                            <td className="px-0.5 py-0">
                              {(emp.tags || []).map((t) => t.name).join(", ") || "—"}
                            </td>
                            <td className="px-0.5 py-0">{emp.position}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })
                ) : (
                  printFilteredEmployees.map((emp) => (
                    <tr key={emp.id} className="border-b border-gray-300">
                      <td className="px-0.5 py-0">{emp.name}</td>
                      <td className="px-0.5 py-0">
                        {emp.remaining_days !== null
                          ? `${emp.remaining_days}${emp.current_period_remaining !== null && emp.current_period_total !== null && emp.current_period_end !== null
                            ? `-${emp.current_period_remaining}/${emp.current_period_total}-${formatDate(emp.current_period_end)}`
                            : ""}`
                          : "—"}
                      </td>
                      <td className="px-0.5 py-0">
                        {(emp.tags || []).map((t) => t.name).join(", ") || "—"}
                      </td>
                      <td className="px-0.5 py-0">{emp.position}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {printFilteredEmployees.length === 0 && (
              <p className="text-center text-muted-foreground py-2 text-xs">Нет данных для печати</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
