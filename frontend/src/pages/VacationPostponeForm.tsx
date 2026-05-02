import { useState, useEffect } from "react"
import { X, FilePen, Check, Info } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip"
import { useCreateOrderDraft, useCommitOrderDraft } from "@/entities/order/useOnlyOffice"
import { useEmployeeAllVacations } from "@/entities/vacation"
import { OrderNumberField } from "@/features/OrderNumberField"
import type { Employee } from "@/entities/employee/types"
import type { OrderType, OrderCreate } from "@/entities/order/types"

const POSTPONE_ORDER_CODE = "vacation_postpone"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

interface VacationPostponeFormProps {
  employee: Employee | null
  orderTypes: OrderType[]
  onSuccess: () => void
}

export function VacationPostponeForm({ employee, orderTypes, onSuccess }: VacationPostponeFormProps) {
  const postponeOrderType = orderTypes.find((t) => t.code === POSTPONE_ORDER_CODE) ?? null

  const { data: employeeVacations = [] } = useEmployeeAllVacations(employee?.id ?? null)
  const [selectedVacation, setSelectedVacation] = useState<any | null>(null)

  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [oldStart, setOldStart] = useState("")
  const [oldEnd, setOldEnd] = useState("")
  const [vacationDays, setVacationDays] = useState("")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()

  useEffect(() => {
    setSelectedVacation(null)
    setOldStart("")
    setOldEnd("")
    setVacationDays("")
    setReason("")
    setOrderNumber("")
    setErrors({})
    setDraftId(null)
  }, [employee?.id])

  const selectVacationForPostpone = (v: any) => {
    setSelectedVacation(v)
    setOldStart(v.start_date || "")
    setOldEnd(v.end_date || "")
    setOrderNumber(v.order_number || "")
    // Автоподсчет дней
    if (v.start_date && v.end_date) {
      const days = Math.max(0, Math.round((new Date(v.end_date).getTime() - new Date(v.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
      setVacationDays(String(days))
    }
    setErrors({})
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!employee) newErrors.employee = "Выберите сотрудника"
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"
    if (!oldStart) newErrors.oldStart = "Укажите старую дату начала"
    if (!oldEnd) newErrors.oldEnd = "Укажите старую дату окончания"
    if (!vacationDays || Number(vacationDays) <= 0) newErrors.vacationDays = "Укажите количество дней"
    if (oldStart && oldEnd && oldEnd < oldStart) newErrors.oldEnd = "Дата окончания раньше даты начала"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildOrderPayload = (): OrderCreate => ({
    employee_id: employee!.id,
    order_type_id: postponeOrderType!.id,
    order_date: orderDate,
    order_number: orderNumber || null,
    notes: reason || null,
    extra_fields: {
      old_vacation_start: oldStart,
      old_vacation_end: oldEnd,
      vacation_days: Number(vacationDays),
      reason: reason || "",
    },
  })

  const handleEditBeforeCreate = () => {
    if (!validate() || !postponeOrderType || !employee) return
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
      onError: () => {
        editorWindow?.close()
      },
    })
  }

  const handleCommitDraft = () => {
    if (!draftId || !validate()) return
    commitDraftMutation.mutate(
      { draftId, order: buildOrderPayload() },
      {
        onSuccess: () => {
          setSuccessMessage("Приказ о переносе отпуска создан!")
          setTimeout(() => setSuccessMessage(null), 5000)
          setOldStart("")
          setOldEnd("")
          setVacationDays("")
          setReason("")
          setOrderNumber("")
          setDraftId(null)
          onSuccess()
        },
        onError: (error: any) => {
          console.error("[PostponeForm] commit error:", error)
          setSuccessMessage("Ошибка при создании приказа")
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
      handleCommitDraft()
    }

    window.addEventListener("message", handleDraftSave)
    return () => window.removeEventListener("message", handleDraftSave)
  }, [draftId, employee, orderDate, orderNumber, oldStart, oldEnd, vacationDays, reason])

  const isPending = createDraftMutation.isPending || commitDraftMutation.isPending

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in duration-300 ${successMessage.includes("Ошибка") ? "bg-red-50 border border-red-200 text-red-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
          <span className="text-sm font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="ml-2 hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="border rounded-lg bg-card px-6 py-6">
        <h2 className="text-lg font-semibold mb-4">Создать приказ о переносе отпуска</h2>

        {!selectedVacation ? (
          <div className="text-sm text-muted-foreground py-2">
            {employee ? "Выберите отпуск из таблицы ниже для автоподстановки данных" : "Выберите сотрудника"}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Левая колонка — поля ввода */}
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

              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <DatePicker label="Старая дата начала *" value={oldStart} onChange={setOldStart} />
                  {errors.oldStart && <p className="text-xs text-red-500 mt-1">{errors.oldStart}</p>}
                </div>
                <div>
                  <DatePicker label="Старая дата окончания *" value={oldEnd} onChange={setOldEnd} />
                  {errors.oldEnd && <p className="text-xs text-red-500 mt-1">{errors.oldEnd}</p>}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 items-end">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-[200px]">
                        <label className="text-sm font-medium flex items-center gap-1">
                          Кол-во дней *
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={vacationDays}
                          onChange={(e) => setVacationDays(e.target.value)}
                          className={errors.vacationDays ? "border-red-500 mt-1" : "mt-1"}
                        />
                        {errors.vacationDays && <p className="text-xs text-red-500 mt-1">{errors.vacationDays}</p>}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Календарных дней отпуска, переносимых на другой период</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="w-full max-w-lg flex-1">
                  <label className="text-sm font-medium">Основание</label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Например: листок нетрудоспособности"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedVacation(null)
                    setOldStart("")
                    setOldEnd("")
                    setVacationDays("")
                    setReason("")
                    setOrderNumber("")
                    setDraftId(null)
                    setErrors({})
                  }}
                  disabled={isPending}
                >
                  Очистить
                </Button>
                {!draftId ? (
                  <Button onClick={handleEditBeforeCreate} disabled={isPending || !employee}>
                    <FilePen className="mr-2 h-4 w-4" />
                    {createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                  </Button>
                ) : (
                  <Button onClick={handleCommitDraft} disabled={isPending}>
                    {commitDraftMutation.isPending ? "Создание..." : "Создать приказ"}
                  </Button>
                )}
              </div>

              {(createDraftMutation.isError || commitDraftMutation.isError) && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Ошибка при создании приказа
                </div>
              )}
            </div>

            {/* Правая колонка — информация об отпуске */}
            <div className="bg-muted/30 border rounded-md p-4 space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">Предыдущий период:</span>
                <span className="font-medium">{formatDate(selectedVacation.start_date)} — {formatDate(selectedVacation.end_date)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">Дней:</span>
                <span className="font-medium">{selectedVacation.days_count}</span>
              </div>
              {selectedVacation.order_number && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Приказ:</span>
                  <span className="font-medium">{selectedVacation.order_number}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {employee && (
        <div className="border rounded-lg bg-card">
          <div className="px-4 py-3 border-b">
            <h2 className="text-lg font-semibold">Активные отпуски сотрудника</h2>
          </div>
          {employeeVacations.length === 0 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">У выбранного сотрудника нет активных отпусков</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Начало</th>
                  <th className="text-left px-4 py-3 font-medium">Конец</th>
                  <th className="text-left px-4 py-3 font-medium">Тип</th>
                  <th className="text-left px-4 py-3 font-medium">Приказ</th>
                  <th className="w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {employeeVacations.map((v) => (
                  <tr
                    key={v.id}
                    className={`border-t cursor-pointer hover:bg-muted/30 ${selectedVacation?.id === v.id ? "bg-blue-50" : ""}`}
                    onClick={() => selectVacationForPostpone(v)}
                  >
                    <td className="px-4 py-3">{formatDate(v.start_date)}</td>
                    <td className="px-4 py-3">{formatDate(v.end_date)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{v.vacation_type}</Badge>
                    </td>
                    <td className="px-4 py-3">{v.order_number || "—"}</td>
                    <td className="px-4 py-3">
                      {selectedVacation?.id === v.id && (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
