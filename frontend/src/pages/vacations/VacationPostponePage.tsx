import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { X, FilePen, Info } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip"
import { useAllOrderTypes } from "@/entities/order/useOrders"
import { useHolidays } from "@/entities/vacation"
import { useCreateOrderDraft, useCommitOrderDraft } from "@/entities/order/useOnlyOffice"
import { VacationSelector } from "@/features/VacationSelector"
import { VacationHistoryAndPeriods } from "@/features/VacationHistoryAndPeriods"
import { OrderNumberField } from "@/features/OrderNumberField"
import type { OrderCreate } from "@/entities/order/types"
import type { Vacation } from "@/entities/vacation/types"

const POSTPONE_ORDER_CODE = "vacation_postpone"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export function VacationPostponePage() {
  const navigate = useNavigate()
  const { data: orderTypes = [] } = useAllOrderTypes()
  const postponeOrderType = orderTypes.find((t) => t.code === POSTPONE_ORDER_CODE) ?? null

  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [vacationDays, setVacationDays] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()

  const startYear = selectedVacation ? new Date(selectedVacation.start_date).getFullYear() : undefined
  const endYear = selectedVacation ? new Date(selectedVacation.end_date).getFullYear() : undefined
  const { data: startYearHolidays } = useHolidays(startYear)
  const { data: endYearHolidays } = useHolidays(endYear !== startYear ? endYear : undefined)

  useEffect(() => {
    setVacationDays(""); setOrderNumber(""); setErrors({}); setDraftId(null)
  }, [selectedVacation?.id])

  const selectVacationForPostpone = (v: Vacation) => {
    setSelectedVacation(v)
    setOrderNumber(v.order_number || "")
    if (v.start_date && v.end_date) {
      const days = Math.max(0, Math.round((new Date(v.end_date).getTime() - new Date(v.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
      setVacationDays(String(days))
    }
    setErrors({})
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedVacation) newErrors.vacation = "Выберите отпуск"
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"
    if (!vacationDays || Number(vacationDays) <= 0) newErrors.vacationDays = "Укажите количество дней"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildOrderPayload = (): OrderCreate => ({
    employee_id: selectedVacation!.employee_id,
    order_type_id: postponeOrderType!.id,
    order_date: orderDate,
    order_number: orderNumber || null,
    notes: null,
    extra_fields: { old_vacation_start: selectedVacation!.start_date, old_vacation_end: selectedVacation!.end_date, vacation_days: Number(vacationDays) },
  })

  const handleEditBeforeCreate = () => {
    if (!validate() || !postponeOrderType || !selectedVacation) return
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(buildOrderPayload(), {
      onSuccess: (draft) => {
        setDraftId(draft.draft_id)
        const url = `/orders/drafts/${draft.draft_id}/edit-docx`
        if (editorWindow && !editorWindow.closed) editorWindow.location.href = url
        else window.open(url, "_blank", "noopener,noreferrer")
      },
      onError: () => editorWindow?.close(),
    })
  }

  const handleCommitDraft = () => {
    if (!draftId || !validate()) return
    commitDraftMutation.mutate({ draftId, order: buildOrderPayload() }, {
      onSuccess: () => {
        setSuccessMessage("Приказ о переносе отпуска создан!")
        setTimeout(() => setSuccessMessage(null), 5000)
        setOldStart(""); setOldEnd(""); setVacationDays(""); setOrderNumber(""); setDraftId(null)
        navigate("/vacations")
      },
      onError: () => {
        setSuccessMessage("Ошибка при создании приказа")
        setTimeout(() => setSuccessMessage(null), 5000)
      },
    })
  }

  useEffect(() => {
    const handleDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== draftId) return
      handleCommitDraft()
    }
    window.addEventListener("message", handleDraftSave)
    return () => window.removeEventListener("message", handleDraftSave)
  }, [draftId, orderDate, orderNumber, vacationDays, selectedVacation])

  const isPending = createDraftMutation.isPending || commitDraftMutation.isPending

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
                <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in duration-300 ${successMessage.includes("Ошибка") ? "bg-red-50 border border-red-200 text-red-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
                  <span className="text-sm font-medium">{successMessage}</span>
                  <button onClick={() => setSuccessMessage(null)} className="ml-2 hover:opacity-70"><X className="h-4 w-4" /></button>
                </div>
              )}
              <VacationSelector
                selectedVacation={selectedVacation}
                onSelect={(v) => { if (!v) { setSelectedVacation(null); return } selectVacationForPostpone(v) }}
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
                        <OrderNumberField value={orderNumber} onChange={setOrderNumber} orderTypeId={postponeOrderType?.id} orderTypes={orderTypes} required error={errors.orderNumber} />
                      </div>
                      <div className="flex flex-wrap gap-4 items-end">
                        <div className="w-[130px]"><label className="text-sm font-medium flex items-center gap-1">Период</label><div className="text-sm mt-1">{formatDate(selectedVacation?.start_date || "")} — {formatDate(selectedVacation?.end_date || "")}</div></div>
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><div className="w-[130px]"><label className="text-sm font-medium flex items-center gap-1">Кол-во дней *<Info className="h-3.5 w-3.5 text-muted-foreground" /></label><Input type="number" min={1} value={vacationDays} onChange={(e) => setVacationDays(e.target.value)} className={errors.vacationDays ? "border-red-500 mt-1" : "mt-1"} />{errors.vacationDays && <p className="text-xs text-red-500 mt-1">{errors.vacationDays}</p>}</div></TooltipTrigger><TooltipContent><p>Календарных дней отпуска, переносимых на другой период</p></TooltipContent></Tooltip></TooltipProvider>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" onClick={() => { setSelectedVacation(null); setVacationDays(""); setOrderNumber(""); setDraftId(null); setErrors({}) }} disabled={isPending}>Очистить</Button>
                        {!draftId ? (<Button onClick={handleEditBeforeCreate} disabled={isPending || !selectedVacation}><FilePen className="mr-2 h-4 w-4" />{createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}</Button>) : (<Button onClick={handleCommitDraft} disabled={isPending || !selectedVacation}>{commitDraftMutation.isPending ? "Создание..." : "Создать приказ"}</Button>)}
                      </div>
                      {(createDraftMutation.isError || commitDraftMutation.isError) && (<div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">Ошибка при создании приказа</div>)}
                    </div>
                    <div className="bg-muted/30 border rounded-md p-4 space-y-2 text-sm">
                      {selectedVacation ? (() => {
                        const calendarDays = Math.max(0, Math.round((new Date(selectedVacation.end_date).getTime() - new Date(selectedVacation.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                        const allHolidays = [...(startYearHolidays || []), ...(endYearHolidays || [])]
                        const uniqueHolidays = allHolidays.filter((h, i, arr) => arr.findIndex((t) => t.date === h.date) === i)
                        const holidaysInRange = uniqueHolidays.filter((h) => { const d = new Date(h.date); return d >= new Date(selectedVacation.start_date) && d <= new Date(selectedVacation.end_date) })
                        return (<>
                          <div className="flex gap-2"><span className="text-muted-foreground">Предыдущий период:</span><span className="font-medium">{formatDate(selectedVacation.start_date)} — {formatDate(selectedVacation.end_date)}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground">Календарных дней:</span><span className="font-medium">{calendarDays}</span></div>
                          {holidaysInRange.length > 0 && (<div className="flex gap-2"><span className="text-muted-foreground">Праздники:</span><span className="font-medium">{holidaysInRange.map((h) => `${formatDate(h.date)} ${h.name}`).join(", ")} <span className="text-muted-foreground">({holidaysInRange.length} дн.)</span></span></div>)}
                          <div className="flex gap-2"><span className="text-muted-foreground">Дней в зачет:</span><span className="font-medium">{selectedVacation.days_count}</span></div>
                          {selectedVacation.order_number && (<div className="flex gap-2"><span className="text-muted-foreground">Приказ:</span><span className="font-medium">{selectedVacation.order_number}</span></div>)}
                        </>)
                      })() : (
                        <div className="text-muted-foreground text-sm">Выберите отпуск из списка выше</div>
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
