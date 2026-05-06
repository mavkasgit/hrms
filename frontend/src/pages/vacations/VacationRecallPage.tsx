import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { X, FilePen } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { useAllOrderTypes } from "@/entities/order/useOrders"
import { useRecallVacation, useHolidays } from "@/entities/vacation"
import { useCreateOrderDraft } from "@/entities/order/useOnlyOffice"
import { OrderNumberField } from "@/features/OrderNumberField"
import { VacationSelector } from "@/features/VacationSelector"
import { VacationHistoryAndPeriods } from "@/features/VacationHistoryAndPeriods"
import type { OrderCreate } from "@/entities/order/types"
import type { Vacation } from "@/entities/vacation/types"

const RECALL_ORDER_CODE = "vacation_recall"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export function VacationRecallPage() {
  const navigate = useNavigate()
  const { data: orderTypes = [] } = useAllOrderTypes()
  const recallOrderType = orderTypes.find((t) => t.code === RECALL_ORDER_CODE) ?? null

  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null)
  const [recallDate, setRecallDate] = useState("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  const createDraftMutation = useCreateOrderDraft()
  const recallMutation = useRecallVacation()

  const recallYear = recallDate ? new Date(recallDate).getFullYear() : undefined
  const startYear = selectedVacation ? new Date(selectedVacation.start_date).getFullYear() : undefined
  const endYear = selectedVacation ? new Date(selectedVacation.end_date).getFullYear() : undefined
  const { data: recallYearHolidays } = useHolidays(recallYear)
  const { data: startYearHolidays } = useHolidays(startYear)
  const { data: endYearHolidays } = useHolidays(endYear !== startYear ? endYear : undefined)

  useEffect(() => {
    setRecallDate("")
    setOrderNumber("")
    setErrors({})
    setDraftId(null)
  }, [selectedVacation?.id])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedVacation) newErrors.vacation = "Выберите отпуск"
    if (!recallDate) newErrors.recallDate = "Укажите дату отзыва"
    if (selectedVacation && recallDate) {
      if (recallDate < selectedVacation.start_date) newErrors.recallDate = "Дата отзыва раньше даты начала отпуска"
      if (recallDate >= selectedVacation.end_date) newErrors.recallDate = "Дата отзыва должна быть раньше даты окончания"
    }
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildOrderPayload = (): OrderCreate => ({
    employee_id: selectedVacation!.employee_id,
    order_type_id: recallOrderType!.id,
    order_date: orderDate,
    order_number: orderNumber || null,
    notes: null,
    extra_fields: {
      recall_date: recallDate,
      old_vacation_start: selectedVacation!.start_date,
      old_vacation_end: selectedVacation!.end_date,
      old_vacation_days: selectedVacation!.days_count,
    },
  })

  const handleEditBeforeCreate = () => {
    if (!validate() || !recallOrderType || !selectedVacation) return
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
      onError: () => { editorWindow?.close() },
    })
  }

  const handleRecall = () => {
    if (!draftId || !validate() || !selectedVacation) return
    recallMutation.mutate(
      {
        vacationId: selectedVacation.id,
        data: { recall_date: recallDate, order_date: orderDate, order_number: orderNumber || null, draft_id: draftId },
      },
      {
        onSuccess: () => {
          setSuccessMessage("Отзыв из отпуска оформлен успешно!")
          setTimeout(() => setSuccessMessage(null), 5000)
          setSelectedVacation(null)
          setRecallDate("")
          setOrderNumber("")
          setDraftId(null)
          navigate("/vacations")
        },
        onError: () => {
          setSuccessMessage("Ошибка при оформлении отзыва")
          setTimeout(() => setSuccessMessage(null), 5000)
        },
      }
    )
  }

  useEffect(() => {
    const handleDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== draftId) return
      handleRecall()
    }
    window.addEventListener("message", handleDraftSave)
    return () => window.removeEventListener("message", handleDraftSave)
  }, [draftId, selectedVacation, recallDate, orderDate, orderNumber])

  const isPending = createDraftMutation.isPending || recallMutation.isPending

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Отзыв из отпуска</h1>
      <div className="border rounded-lg bg-card">
        <Tabs value="recall" onValueChange={(v) => {
          navigate(v === "vacation" ? "/vacations" : `/vacations/${v}`)
        }}>
          <div className="px-4 py-3 border-b">
            <TabsList>
              <TabsTrigger value="vacation">Создать трудовой отпуск</TabsTrigger>
              <TabsTrigger value="recall">Отзыв из отпуска</TabsTrigger>
              <TabsTrigger value="postpone">Перенос отпуска</TabsTrigger>
              <TabsTrigger value="extension">Продление отпуска</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="recall" className="px-4 py-4 m-0">
            <div className="space-y-4">
              {successMessage && (
                <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in duration-300 ${successMessage.includes("Ошибка") ? "bg-red-50 border border-red-200 text-red-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
                  <span className="text-sm font-medium">{successMessage}</span>
                  <button onClick={() => setSuccessMessage(null)} className="ml-2 hover:opacity-70"><X className="h-4 w-4" /></button>
                </div>
              )}

              <VacationSelector
                selectedVacation={selectedVacation}
                onSelect={(v) => {
                  if (!v) { setSelectedVacation(null); return }
                  setSelectedVacation(v)
                  setRecallDate("")
                  setErrors({})
                  setDraftId(null)
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
                        <OrderNumberField value={orderNumber} onChange={setOrderNumber} orderTypeId={recallOrderType?.id} orderTypes={orderTypes} required error={errors.orderNumber} />
                        <div className="w-[130px]">
                          <DatePicker label="Дата отзыва *" value={recallDate} onChange={setRecallDate} disabled={!selectedVacation} />
                          {errors.recallDate && <p className="text-xs text-red-500 mt-1">{errors.recallDate}</p>}
                        </div>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button variant="outline" onClick={() => { setSelectedVacation(null); setRecallDate(""); setOrderNumber(""); setDraftId(null); setErrors({}) }} disabled={isPending}>Очистить</Button>
                        {!draftId ? (
                          <Button onClick={handleEditBeforeCreate} disabled={isPending || !selectedVacation}><FilePen className="mr-2 h-4 w-4" />{createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}</Button>
                        ) : (
                          <Button onClick={handleRecall} disabled={isPending || !selectedVacation}>{recallMutation.isPending ? "Оформление..." : "Оформить отзыв"}</Button>
                        )}
                      </div>
                      {(createDraftMutation.isError || recallMutation.isError) && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">Ошибка при создании приказа</div>
                      )}
                    </div>

                    <div className="bg-muted/30 border rounded-md p-4 space-y-2 text-sm">
                      {selectedVacation ? (<>
                        {(() => {
                          const prevCalendarDays = Math.max(0, Math.round((new Date(selectedVacation.end_date).getTime() - new Date(selectedVacation.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                          const allPrevHolidays = [...(startYearHolidays || []), ...(endYearHolidays || [])]
                          const uniquePrevHolidays = allPrevHolidays.filter((h, i, arr) => arr.findIndex((t) => t.date === h.date) === i)
                          const holidaysInPrevRange = uniquePrevHolidays.filter((h) => { const d = new Date(h.date); return d >= new Date(selectedVacation.start_date) && d <= new Date(selectedVacation.end_date) })
                          return (<>
                            <div className="flex gap-2"><span className="text-muted-foreground">Предыдущий период:</span><span className="font-medium">{formatDate(selectedVacation.start_date)} — {formatDate(selectedVacation.end_date)}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground">Календарных дней:</span><span className="font-medium">{prevCalendarDays}</span></div>
                            {holidaysInPrevRange.length > 0 && (<div className="flex gap-2"><span className="text-muted-foreground">Праздники:</span><span className="font-medium">{holidaysInPrevRange.map((h) => `${formatDate(h.date)} ${h.name}`).join(", ")} <span className="text-muted-foreground">({holidaysInPrevRange.length} дн.)</span></span></div>)}
                            <div className="flex gap-2"><span className="text-muted-foreground">Было дней:</span><span className="font-medium">{selectedVacation.days_count}</span></div>
                          </>)
                        })()}
                        {recallDate && (() => {
                          const recallDateObj = new Date(recallDate)
                          if (isNaN(recallDateObj.getTime())) return null
                          const vacationEndDate = new Date(recallDateObj.getTime() - (1000 * 60 * 60 * 24))
                          if (isNaN(vacationEndDate.getTime())) return null
                          const endDateStr = vacationEndDate.toISOString().split("T")[0]
                          const calendarDays = Math.max(0, Math.round((vacationEndDate.getTime() - new Date(selectedVacation.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                          const allHolidays = [...(startYearHolidays || []), ...(recallYearHolidays || [])]
                          const uniqueHolidays = allHolidays.filter((h, i, arr) => arr.findIndex((t) => t.date === h.date) === i)
                          const holidaysInRange = uniqueHolidays.filter((h) => { const d = new Date(h.date); return d >= new Date(selectedVacation.start_date) && d <= vacationEndDate })
                          const totalDays = Math.max(0, calendarDays - holidaysInRange.length)
                          return (<>
                            <div className="border-t pt-2 mt-2" />
                            <div className="flex gap-2"><span className="text-muted-foreground">Новый период:</span><span className="font-medium">{formatDate(selectedVacation.start_date)} — {formatDate(endDateStr)}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground">Календарных дней:</span><span className="font-medium">{calendarDays}</span></div>
                            {holidaysInRange.length > 0 && (<div className="flex gap-2"><span className="text-muted-foreground">Праздники:</span><span className="font-medium">{holidaysInRange.map((h) => `${formatDate(h.date)} ${h.name}`).join(", ")} <span className="text-muted-foreground">({holidaysInRange.length} дн.)</span></span></div>)}
                            <div className="flex gap-2"><span className="text-muted-foreground">Станет дней:</span><span className="font-semibold text-foreground">{totalDays}</span></div>
                            <div className="flex gap-2 text-xs text-amber-600 mt-1"><span>Дата отзыва ({formatDate(recallDate)}) — уже рабочий день</span></div>
                          </>)
                        })()}
                        {!recallDate && (<div className="text-muted-foreground text-xs pt-2">Введите дату отзыва, чтобы увидеть пересчет</div>)}
                      </>) : (
                        <div className="text-muted-foreground text-sm">Выберите отпуск</div>
                      )}
                    </div>
                  </div>
                </div>
              </VacationSelector>

              {selectedVacation && (
                <VacationHistoryAndPeriods employeeId={selectedVacation.employee_id} />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
