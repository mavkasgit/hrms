import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FilePen, X } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { useAllOrderTypes } from "@/entities/order/useOrders"
import { useCreateOrderDraft } from "@/entities/order/useOnlyOffice"
import { openDraftEditorWindow, subscribeDraftOrderSave } from "@/entities/order/draftOrderSaveChannel"
import { openOrderPrint } from "@/entities/order/orderActions"
import { useHolidays, usePostponeVacation } from "@/entities/vacation"
import { VacationSelector } from "@/features/VacationSelector"
import { VacationHistoryAndPeriods } from "@/features/VacationHistoryAndPeriods"
import { OrderNumberField } from "@/features/OrderNumberField"
import { formatDate, parseDate, calculateDaysDifference } from "@/shared/utils/date"
import type { OrderCreate } from "@/entities/order/types"
import type { Holiday, Vacation } from "@/entities/vacation/types"

const POSTPONE_ORDER_CODE = "vacation_postpone"

function calculateDaysWithHolidays(start: string, end: string, holidays: Holiday[]): number {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  if (!startDate || !endDate) return 0
  if (endDate < startDate) return 0

  const calendarDays = calculateDaysDifference(start, end)
  const holidayDays = holidays.filter((h) => {
    const d = parseDate(h.date)
    if (!d) return false
    return d >= startDate && d <= endDate
  }).length
  return Math.max(0, calendarDays - holidayDays)
}

function mergeUniqueHolidays(first: Holiday[] = [], second: Holiday[] = []): Holiday[] {
  return [...first, ...second].filter((h, i, arr) => arr.findIndex((x) => x.date === h.date) === i)
}

export function VacationPostponePage() {
  const navigate = useNavigate()
  const { data: orderTypes = [] } = useAllOrderTypes()
  const postponeOrderType = orderTypes.find((t) => t.code === POSTPONE_ORDER_CODE) ?? null

  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [postponeStartDate, setPostponeStartDate] = useState("")
  const [postponeEndDate, setPostponeEndDate] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  const createDraftMutation = useCreateOrderDraft()
  const postponeMutation = usePostponeVacation()

  const startYear = selectedVacation ? new Date(selectedVacation.start_date).getFullYear() : undefined
  const endYear = selectedVacation ? new Date(selectedVacation.end_date).getFullYear() : undefined
  const { data: startYearHolidays } = useHolidays(startYear)
  const { data: endYearHolidays } = useHolidays(endYear !== startYear ? endYear : undefined)

  const allVacationHolidays = useMemo(
    () => mergeUniqueHolidays(startYearHolidays || [], endYearHolidays || []),
    [startYearHolidays, endYearHolidays]
  )

  const selectedPostponedDays = useMemo(() => {
    if (!postponeStartDate || !postponeEndDate) return 0
    return calculateDaysWithHolidays(postponeStartDate, postponeEndDate, allVacationHolidays)
  }, [postponeStartDate, postponeEndDate, allVacationHolidays])

  const usedDaysAfterPostpone = useMemo(() => {
    if (!selectedVacation) return 0
    const used = selectedVacation.days_count - selectedPostponedDays
    return Number.isFinite(used) ? used : 0
  }, [selectedVacation, selectedPostponedDays])

  useEffect(() => {
    setOrderNumber("")
    setPostponeStartDate("")
    setPostponeEndDate("")
    setErrors({})
    setDraftId(null)
  }, [selectedVacation?.id])

  const selectVacationForPostpone = (vacation: Vacation) => {
    setSelectedVacation(vacation)
    setOrderNumber(vacation.order_number || "")
    setPostponeStartDate(vacation.start_date)
    setPostponeEndDate(vacation.start_date)
    setErrors({})
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!selectedVacation) nextErrors.vacation = "Выберите отпуск"
    if (!orderDate) nextErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) nextErrors.orderNumber = "Укажите номер приказа"
    if (!postponeStartDate) nextErrors.postponeStartDate = "Укажите начало периода переноса"
    if (!postponeEndDate) nextErrors.postponeEndDate = "Укажите конец периода переноса"

    if (selectedVacation && postponeStartDate && postponeEndDate) {
      const vacationStart = parseDate(selectedVacation.start_date)
      const vacationEnd = parseDate(selectedVacation.end_date)
      const rangeStart = parseDate(postponeStartDate)
      const rangeEnd = parseDate(postponeEndDate)
      if (!vacationStart || !vacationEnd || !rangeStart || !rangeEnd) {
        nextErrors.range = "Некорректные даты периода переноса"
      } else {
        if (rangeStart < vacationStart || rangeEnd > vacationEnd) {
          nextErrors.range = "Период переноса должен быть внутри выбранного отпуска"
        }
        if (rangeEnd < rangeStart) {
          nextErrors.range = "Дата конца периода раньше даты начала"
        }
      }

      if (selectedPostponedDays <= 0) {
        nextErrors.rangeDays = "В выбранном диапазоне нет дней для переноса"
      }
      if (selectedPostponedDays >= selectedVacation.days_count) {
        nextErrors.rangeDays = "Нельзя перенести весь отпуск: должен остаться хотя бы 1 день использования"
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const buildOrderPayload = (): OrderCreate => ({
    employee_id: selectedVacation!.employee_id,
    order_type_id: postponeOrderType!.id,
    order_date: orderDate,
    order_number: orderNumber || null,
    notes: null,
    extra_fields: {
      old_vacation_start: selectedVacation!.start_date,
      old_vacation_end: selectedVacation!.end_date,
      postpone_range_start: postponeStartDate,
      postpone_range_end: postponeEndDate,
      old_vacation_days: selectedVacation!.days_count,
      postponed_days: selectedPostponedDays,
      used_days: usedDaysAfterPostpone,
    },
  })

  const handleEditBeforeCreate = () => {
    if (!validate() || !postponeOrderType || !selectedVacation) return
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(buildOrderPayload(), {
      onSuccess: (draft) => {
        setDraftId(draft.draft_id)
        const url = `/orders/drafts/${draft.draft_id}/edit-docx`
        if (editorWindow && !editorWindow.closed) editorWindow.location.href = url
        else openDraftEditorWindow(url)
      },
      onError: () => editorWindow?.close(),
    })
  }

  const handlePostpone = async (openPrint = false, printTarget?: string) => {
    if (!draftId || !validate() || !selectedVacation) return

    try {
      const result = await postponeMutation.mutateAsync({
        vacationId: selectedVacation.id,
        data: {
          vacation_id: selectedVacation.id,
          order_date: orderDate,
          order_number: orderNumber || null,
          start_date: postponeStartDate,
          end_date: postponeEndDate,
          postponed_days: selectedPostponedDays,
          draft_id: draftId,
        },
      })

      if (openPrint && result?.postpone_order_id) {
        openOrderPrint(result.postpone_order_id, printTarget || "_blank")
      }
      setSuccessMessage("Приказ о переносе отпуска создан")
      setTimeout(() => setSuccessMessage(null), 5000)
      setOrderNumber("")
      setPostponeStartDate("")
      setPostponeEndDate("")
      setDraftId(null)
      navigate("/vacations")
    } catch {
      setSuccessMessage("Ошибка при создании приказа")
      setTimeout(() => setSuccessMessage(null), 5000)
    }
  }

  useEffect(() => {
    return subscribeDraftOrderSave(draftId, (message) => {
      void handlePostpone(Boolean(message.openPrint), message.printWindowName)
    })
  }, [draftId, orderDate, orderNumber, postponeStartDate, postponeEndDate, selectedVacation, selectedPostponedDays])

  const isPending =
    createDraftMutation.isPending ||
    postponeMutation.isPending

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Перенос отпуска</h1>
      <div className="border rounded-lg bg-card">
        <Tabs value="postpone" onValueChange={(v) => navigate(v === "vacation" ? "/vacations" : `/vacations/${v}`)}>
          <div className="px-4 py-3 border-b">
            <TabsList>
              <TabsTrigger value="vacation">Создать трудовой отпуск</TabsTrigger>
              <TabsTrigger value="recall">Отзыв из отпуска</TabsTrigger>
              <TabsTrigger value="postpone">Перенос отпуска</TabsTrigger>
              <TabsTrigger value="extension">Продление отпуска</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="postpone" className="px-4 py-4 m-0">
            <div className="space-y-4">
              {successMessage && (
                <div
                  className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in duration-300 ${
                    successMessage.includes("Ошибка")
                      ? "bg-red-50 border border-red-200 text-red-800"
                      : "bg-green-50 border border-green-200 text-green-800"
                  }`}
                >
                  <span className="text-sm font-medium">{successMessage}</span>
                  <button onClick={() => setSuccessMessage(null)} className="ml-2 hover:opacity-70">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <VacationSelector
                selectedVacation={selectedVacation}
                onSelect={(v) => {
                  if (!v) {
                    setSelectedVacation(null)
                    return
                  }
                  selectVacationForPostpone(v)
                }}
                showEmployeeColumn={true}
              >
                <div className="border rounded-lg bg-card px-6 py-6 mt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[130px]">
                          <DatePicker label="Дата приказа *" value={orderDate} onChange={setOrderDate} />
                          {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}
                        </div>
                        <OrderNumberField
                          value={orderNumber}
                          onChange={setOrderNumber}
                          orderTypeId={postponeOrderType?.id}
                          orderTypes={orderTypes}
                          required
                          error={errors.orderNumber}
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Укажите конкретный период внутри отпуска, который нужно перенести.
                        </p>
                        <div className="flex flex-wrap gap-4 items-start">
                          <div className="w-[130px]">
                            <DatePicker
                              label="Начало переноса *"
                              value={postponeStartDate}
                              onChange={setPostponeStartDate}
                            />
                            {errors.postponeStartDate && (
                              <p className="text-xs text-red-500 mt-1">{errors.postponeStartDate}</p>
                            )}
                          </div>
                          <div className="w-[130px]">
                            <DatePicker
                              label="Конец переноса *"
                              value={postponeEndDate}
                              onChange={setPostponeEndDate}
                            />
                            {errors.postponeEndDate && (
                              <p className="text-xs text-red-500 mt-1">{errors.postponeEndDate}</p>
                            )}
                          </div>
                        </div>
                        {(errors.range || errors.rangeDays) && (
                          <p className="text-xs text-red-500">{errors.range || errors.rangeDays}</p>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedVacation(null)
                            setOrderNumber("")
                            setPostponeStartDate("")
                            setPostponeEndDate("")
                            setDraftId(null)
                            setErrors({})
                          }}
                          disabled={isPending}
                        >
                          Очистить
                        </Button>

                        {!draftId ? (
                          <Button onClick={handleEditBeforeCreate} disabled={isPending || !selectedVacation}>
                            <FilePen className="mr-2 h-4 w-4" />
                            {createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                          </Button>
                        ) : (
                          <Button onClick={() => void handlePostpone()} disabled={isPending || !selectedVacation}>
                            {postponeMutation.isPending ? "Создание..." : "Оформить перенос"}
                          </Button>
                        )}
                      </div>

                      {(createDraftMutation.isError || postponeMutation.isError) && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                          Ошибка при создании приказа
                        </div>
                      )}
                    </div>

                    <div className="bg-muted/30 border rounded-md p-4 space-y-2 text-sm">
                      {selectedVacation ? (
                        <>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Период отпуска:</span>
                            <span className="font-medium">
                              {formatDate(selectedVacation.start_date)} — {formatDate(selectedVacation.end_date)}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Дней отпуска:</span>
                            <span className="font-medium">{selectedVacation.days_count}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Период переноса:</span>
                            <span className="font-medium">
                              {postponeStartDate ? formatDate(postponeStartDate) : "—"} —{" "}
                              {postponeEndDate ? formatDate(postponeEndDate) : "—"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Переносится дней:</span>
                            <span className="font-medium">{selectedPostponedDays}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Останется использовано:</span>
                            <span className="font-medium">{Math.max(0, usedDaysAfterPostpone)}</span>
                          </div>
                          {selectedVacation.order_number && (
                            <div className="flex gap-2">
                              <span className="text-muted-foreground">Исходный приказ:</span>
                              <span className="font-medium">{selectedVacation.order_number}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-muted-foreground text-sm">Выберите отпуск</div>
                      )}
                    </div>
                  </div>
                </div>
              </VacationSelector>

              {selectedVacation && <VacationHistoryAndPeriods employeeId={selectedVacation.employee_id} />}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
