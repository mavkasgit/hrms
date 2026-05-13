import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { X, FilePen } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { useAllOrderTypes } from "@/entities/order/useOrders"
import { useExtendVacation } from "@/entities/vacation"
import { useCreateOrderDraft } from "@/entities/order/useOnlyOffice"
import { openOrderPrint } from "@/entities/order/orderActions"
import { OrderNumberField } from "@/features/OrderNumberField"
import { VacationSelector } from "@/features/VacationSelector"
import { VacationHistoryAndPeriods } from "@/features/VacationHistoryAndPeriods"
import type { OrderCreate } from "@/entities/order/types"
import type { Vacation } from "@/entities/vacation/types"

const EXTENSION_ORDER_CODE = "vacation_extension"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function parseIsoDate(value: string): Date | null {
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function VacationExtensionPage() {
  const navigate = useNavigate()
  const { data: orderTypes = [] } = useAllOrderTypes()
  const extensionOrderType = orderTypes.find((t) => t.code === EXTENSION_ORDER_CODE) ?? null

  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null)
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  const createDraftMutation = useCreateOrderDraft()
  const extendMutation = useExtendVacation()

  useEffect(() => {
    setPeriodStart(""); setPeriodEnd(""); setOrderNumber(""); setErrors({}); setDraftId(null)
  }, [selectedVacation?.id])

  const getNextDayAfterVacation = (vacationEnd: string): string => {
    const d = parseIsoDate(vacationEnd)
    if (!d) return ""
    d.setDate(d.getDate() + 1)
    return d.toISOString().split("T")[0]
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedVacation) newErrors.vacation = "Выберите отпуск"
    if (!periodStart) newErrors.periodStart = "Укажите начало периода продления"
    if (!periodEnd) newErrors.periodEnd = "Укажите конец периода продления"
    if (periodStart && periodEnd && periodEnd < periodStart) newErrors.periodEnd = "Дата конца раньше даты начала"
    if (selectedVacation && periodStart) {
      const minStart = getNextDayAfterVacation(selectedVacation.end_date)
      if (minStart && periodStart < minStart) {
        newErrors.periodStart = "Период продления должен начинаться после окончания отпуска"
      }
    }
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildOrderPayload = (): OrderCreate => ({
    employee_id: selectedVacation!.employee_id,
    order_type_id: extensionOrderType!.id,
    order_date: orderDate,
    order_number: orderNumber || null,
    notes: null,
    extra_fields: { vacation_start: selectedVacation!.start_date, vacation_end: selectedVacation!.end_date, vacation_days: selectedVacation!.days_count, period_start: periodStart, period_end: periodEnd },
  })

  const handleEditBeforeCreate = () => {
    if (!validate() || !extensionOrderType || !selectedVacation) return
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(buildOrderPayload(), {
      onSuccess: (draft) => {
        setDraftId(draft.draft_id)
        const url = `/orders/drafts/${draft.draft_id}/edit-docx`
        if (editorWindow && !editorWindow.closed) editorWindow.location.href = url
        else window.open(url, "_blank", "noopener,noreferrer")
      },
      onError: () => { editorWindow?.close(); setSuccessMessage("Ошибка при подготовке DOCX-черновика"); setTimeout(() => setSuccessMessage(null), 3000) },
    })
  }

  const handleCreate = async (openPrint = false, printTarget?: string) => {
    if (!draftId || !validate() || !selectedVacation) return
    try {
      const result = await extendMutation.mutateAsync({
        vacationId: selectedVacation.id,
        data: {
          vacation_id: selectedVacation.id,
          order_date: orderDate,
          order_number: orderNumber || null,
          start_date: periodStart,
          end_date: periodEnd,
          sick_start_date: periodStart,
          sick_end_date: periodEnd,
          draft_id: draftId,
        },
      })
      if (openPrint && result?.extension_order_id) {
        openOrderPrint(result.extension_order_id, printTarget || "_blank")
      }
      setSuccessMessage("Продление отпуска оформлено успешно!")
      setTimeout(() => setSuccessMessage(null), 5000)
      setSelectedVacation(null); setPeriodStart(""); setPeriodEnd(""); setOrderNumber(""); setDraftId(null)
      navigate("/vacations")
    } catch {
      setSuccessMessage("Ошибка при оформлении продления")
      setTimeout(() => setSuccessMessage(null), 5000)
    }
  }

  useEffect(() => {
    const handleDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string; openPrint?: boolean; printWindowName?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== draftId) return
      void handleCreate(Boolean(message.openPrint), message.printWindowName)
    }
    window.addEventListener("message", handleDraftSave)
    return () => window.removeEventListener("message", handleDraftSave)
  }, [draftId, selectedVacation, periodStart, periodEnd, orderDate, orderNumber])

  const isPending = createDraftMutation.isPending || extendMutation.isPending

  const calculateExtensionInfo = () => {
    if (!selectedVacation || !periodStart || !periodEnd) return null
    const vacationEnd = parseIsoDate(selectedVacation.end_date)
    const pStart = parseIsoDate(periodStart)
    const pEnd = parseIsoDate(periodEnd)
    if (!vacationEnd || !pStart || !pEnd) return null
    const calendarDays = Math.max(0, Math.round((pEnd.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const extensionDays = calendarDays
    return { extensionDays, calendarDays, newVacationEnd: formatDate(periodEnd) }
  }

  const extensionInfo = calculateExtensionInfo()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Продление отпуска</h1>
      <div className="border rounded-lg bg-card">
        <Tabs value="extension" onValueChange={(v) => navigate(v === "vacation" ? "/vacations" : `/vacations/${v}`)}>
          <div className="px-4 py-3 border-b">
            <TabsList>
              <TabsTrigger value="vacation">Создать трудовой отпуск</TabsTrigger>
              <TabsTrigger value="recall">Отзыв из отпуска</TabsTrigger>
              <TabsTrigger value="postpone">Перенос отпуска</TabsTrigger>
              <TabsTrigger value="extension">Продление отпуска</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="extension" className="px-4 py-4 m-0">
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
                  const defaultStart = getNextDayAfterVacation(v.end_date)
                  setPeriodStart(defaultStart)
                  setPeriodEnd(defaultStart)
                  setErrors({})
                  setDraftId(null)
                }}
                showEmployeeColumn={true}
              >
                <div className="border rounded-lg bg-card px-6 py-6 mt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[130px]"><DatePicker label="Дата приказа *" value={orderDate} onChange={setOrderDate} />{errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}</div>
                        <OrderNumberField value={orderNumber} onChange={setOrderNumber} orderTypeId={extensionOrderType?.id} orderTypes={orderTypes} required error={errors.orderNumber} />
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[130px]"><DatePicker label="Начало продления *" value={periodStart} onChange={setPeriodStart} />{errors.periodStart && <p className="text-xs text-red-500 mt-1">{errors.periodStart}</p>}</div>
                        <div className="w-[130px]"><DatePicker label="Конец продления *" value={periodEnd} onChange={setPeriodEnd} />{errors.periodEnd && <p className="text-xs text-red-500 mt-1">{errors.periodEnd}</p>}</div>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button variant="outline" onClick={() => { setSelectedVacation(null); setPeriodStart(""); setPeriodEnd(""); setOrderNumber(""); setDraftId(null); setErrors({}) }} disabled={isPending}>Очистить</Button>
                        {!draftId ? (<Button onClick={handleEditBeforeCreate} disabled={isPending || !selectedVacation}><FilePen className="mr-2 h-4 w-4" />{createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}</Button>) : (<Button onClick={() => void handleCreate()} disabled={isPending || !selectedVacation}>{extendMutation.isPending ? "Оформление..." : "Оформить продление"}</Button>)}
                      </div>
                      {(createDraftMutation.isError || extendMutation.isError) && (<div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">Ошибка при создании приказа</div>)}
                    </div>
                    <div className="bg-muted/30 border rounded-md p-4 space-y-2 text-sm">
                      {selectedVacation ? (<>
                        <div className="flex gap-2"><span className="text-muted-foreground">Отпуск:</span><span className="font-medium">{formatDate(selectedVacation.start_date)} — {formatDate(selectedVacation.end_date)}</span></div>
                        <div className="flex gap-2"><span className="text-muted-foreground">Дней в отпуске:</span><span className="font-medium">{selectedVacation.days_count}</span></div>
                        {periodStart && periodEnd && (<>
                          <div className="border-t pt-2 mt-2" />
                          <div className="flex gap-2"><span className="text-muted-foreground">Период продления:</span><span className="font-medium">{formatDate(periodStart)} — {formatDate(periodEnd)}</span></div>
                          {extensionInfo && (<>
                            <div className="flex gap-2"><span className="text-muted-foreground">Дней продления:</span><span className="font-medium">{extensionInfo.extensionDays}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground">Конец продленного периода:</span><span className="font-semibold text-foreground">{extensionInfo.newVacationEnd}</span></div>
                          </>)}
                        </>)}
                        {!periodStart && !periodEnd && (<div className="text-muted-foreground text-xs pt-2">Укажите период продления</div>)}
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
