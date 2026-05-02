import { useState, useEffect } from "react"
import { Check, X, FilePen, Search, CornerUpLeft } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import {
  useEmployeeAllVacations,
  useAllActiveVacations,
  useRecallVacation,
  useHolidays,
} from "@/entities/vacation"
import { useCreateOrderDraft } from "@/entities/order/useOnlyOffice"
import { OrderNumberField } from "@/features/OrderNumberField"
import type { Employee } from "@/entities/employee/types"
import type { OrderType, OrderCreate } from "@/entities/order/types"

const RECALL_ORDER_CODE = "vacation_recall"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

interface VacationRecallFormProps {
  employee: Employee | null
  orderTypes: OrderType[]
  onSuccess: () => void
  onSelectEmployee?: (employee: Employee | null) => void
  preselectedVacationId?: number | null
}

export function VacationRecallForm({ employee, orderTypes, onSuccess, onSelectEmployee, preselectedVacationId }: VacationRecallFormProps) {
  const recallOrderType = orderTypes.find((t) => t.code === RECALL_ORDER_CODE) ?? null

  const { data: employeeVacations = [] } = useEmployeeAllVacations(employee?.id ?? null)
  const { data: allActiveVacations = [], isLoading: isLoadingAll } = useAllActiveVacations()
  const [selectedVacation, setSelectedVacation] = useState<any | null>(null)
  const [tableFilter, setTableFilter] = useState("")

  const [recallDate, setRecallDate] = useState("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  const createDraftMutation = useCreateOrderDraft()
  const recallMutation = useRecallVacation()

  // Holidays for day calculation
  const recallYear = recallDate ? new Date(recallDate).getFullYear() : undefined
  const startYear = selectedVacation ? new Date(selectedVacation.start_date).getFullYear() : undefined
  const endYear = selectedVacation ? new Date(selectedVacation.end_date).getFullYear() : undefined
  const { data: recallYearHolidays } = useHolidays(recallYear)
  const { data: startYearHolidays } = useHolidays(startYear)
  const { data: endYearHolidays } = useHolidays(endYear !== startYear ? endYear : undefined)

  // Если сотрудник выбран — показываем только его отпуски, иначе все
  const displayedVacations = employee
    ? employeeVacations
    : allActiveVacations.filter((v) => {
        if (!tableFilter.trim()) return true
        const query = tableFilter.trim().toLowerCase()
        return (
          (v.employee_name || "").toLowerCase().includes(query) ||
          String(v.employee_id).includes(query)
        )
      })

  useEffect(() => {
    // При смене сотрудника сбрасываем только поля формы, но НЕ выбор отпуска
    // (чтобы кнопка "Отозвать" сразу подставляла всё)
    setRecallDate("")
    setOrderNumber("")
    setReason("")
    setErrors({})
    setDraftId(null)
  }, [employee?.id])

  // Автовыбор отпуска если передан preselectedVacationId
  useEffect(() => {
    if (preselectedVacationId && displayedVacations.length > 0) {
      const found = displayedVacations.find((v) => v.id === preselectedVacationId)
      if (found) {
        setSelectedVacation(found)
        setErrors({})
        setDraftId(null)
      }
    }
  }, [preselectedVacationId, displayedVacations])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!employee) newErrors.employee = "Выберите сотрудника"
    if (!selectedVacation) newErrors.vacation = "Выберите отпуск"
    if (!recallDate) newErrors.recallDate = "Укажите дату отзыва"
    if (selectedVacation && recallDate) {
      if (recallDate < selectedVacation.start_date) {
        newErrors.recallDate = "Дата отзыва раньше даты начала отпуска"
      }
      if (recallDate >= selectedVacation.end_date) {
        newErrors.recallDate = "Дата отзыва должна быть раньше даты окончания"
      }
    }
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildOrderPayload = (): OrderCreate => ({
    employee_id: employee!.id,
    order_type_id: recallOrderType!.id,
    order_date: orderDate,
    order_number: orderNumber || null,
    notes: reason || null,
    extra_fields: {
      recall_date: recallDate,
      old_vacation_start: selectedVacation!.start_date,
      old_vacation_end: selectedVacation!.end_date,
      old_vacation_days: selectedVacation!.days_count,
      reason: reason || "",
    },
  })

  const handleEditBeforeCreate = () => {
    if (!validate() || !recallOrderType || !employee || !selectedVacation) return
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
        console.error("[RecallForm] draft error:", err)
        setSuccessMessage("Ошибка при подготовке DOCX-черновика")
        setTimeout(() => setSuccessMessage(null), 3000)
      },
    })
  }

  const handleRecall = () => {
    if (!draftId || !validate() || !selectedVacation) return
    recallMutation.mutate(
      {
        vacationId: selectedVacation.id,
        data: {
          recall_date: recallDate,
          order_date: orderDate,
          order_number: orderNumber || null,
          comment: reason || null,
          draft_id: draftId,
        },
      },
      {
        onSuccess: () => {
          setSuccessMessage("Отзыв из отпуска оформлен успешно!")
          setTimeout(() => setSuccessMessage(null), 5000)
          setSelectedVacation(null)
          setRecallDate("")
          setOrderNumber("")
          setReason("")
          setDraftId(null)
          onSuccess()
        },
        onError: (error: any) => {
          console.error("[RecallForm] recall error:", error)
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
  }, [draftId, employee, selectedVacation, recallDate, orderDate, orderNumber, reason])

  const isPending = createDraftMutation.isPending || recallMutation.isPending

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
            <h2 className="text-lg font-semibold mb-4">Оформить отзыв из отпуска</h2>

            {!selectedVacation ? (
              <div className="text-sm text-muted-foreground py-2">Выберите отпуск из таблицы ниже, чтобы оформить отзыв</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Левая колонка — поля ввода */}
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="w-[140px]">
                      <DatePicker label="Дата приказа *" value={orderDate} onChange={setOrderDate} />
                      {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}
                    </div>
                    <OrderNumberField
                      value={orderNumber}
                      onChange={setOrderNumber}
                      orderTypeId={recallOrderType?.id}
                      orderTypes={orderTypes}
                      required
                      error={errors.orderNumber}
                    />
                    <div className="w-[140px]">
                      <DatePicker label="Дата отзыва *" value={recallDate} onChange={setRecallDate} />
                      {errors.recallDate && <p className="text-xs text-red-500 mt-1">{errors.recallDate}</p>}
                    </div>
                  </div>

                  <div className="w-full max-w-lg">
                    <label className="text-sm font-medium">Основание</label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Например: производственная необходимость"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedVacation(null)
                        setRecallDate("")
                        setOrderNumber("")
                        setReason("")
                        setDraftId(null)
                        setErrors({})
                      }}
                      disabled={isPending}
                    >
                      Очистить
                    </Button>
                    {!draftId ? (
                      <Button onClick={handleEditBeforeCreate} disabled={isPending}>
                        <FilePen className="mr-2 h-4 w-4" />
                        {createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                      </Button>
                    ) : (
                      <Button onClick={handleRecall} disabled={isPending}>
                        {recallMutation.isPending ? "Оформление..." : "Оформить отзыв"}
                      </Button>
                    )}
                  </div>

                  {(createDraftMutation.isError || recallMutation.isError) && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
                      Ошибка при создании приказа
                    </div>
                  )}
                </div>

                {/* Правая колонка — информация о периодах */}
                <div className="bg-muted/30 border rounded-md p-4 space-y-2 text-sm">
                  {(() => {
                    const prevCalendarDays = Math.max(0, Math.round((new Date(selectedVacation.end_date).getTime() - new Date(selectedVacation.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                    const allPrevHolidays = [...(startYearHolidays || []), ...(endYearHolidays || [])]
                    const uniquePrevHolidays = allPrevHolidays.filter((h, i, arr) => arr.findIndex((t) => t.date === h.date) === i)
                    const holidaysInPrevRange = uniquePrevHolidays.filter((h) => {
                      const hDate = new Date(h.date)
                      const sDate = new Date(selectedVacation.start_date)
                      const eDate = new Date(selectedVacation.end_date)
                      return hDate >= sDate && hDate <= eDate
                    })
                    return (
                      <>
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Предыдущий период:</span>
                          <span className="font-medium">{formatDate(selectedVacation.start_date)} — {formatDate(selectedVacation.end_date)}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Календарных дней:</span>
                          <span className="font-medium">{prevCalendarDays}</span>
                        </div>
                        {holidaysInPrevRange.length > 0 && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Праздники:</span>
                            <span className="font-medium">
                              {holidaysInPrevRange.map((h) => `${formatDate(h.date)} ${h.name}`).join(", ")}
                              {" "}
                              <span className="text-muted-foreground">({holidaysInPrevRange.length} дн.)</span>
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Было дней:</span>
                          <span className="font-medium">{selectedVacation.days_count}</span>
                        </div>
                      </>
                    )
                  })()}

                  {recallDate && (() => {
                    const calendarDays = Math.max(0, Math.round((new Date(recallDate).getTime() - new Date(selectedVacation.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                    const allHolidays = [...(startYearHolidays || []), ...(recallYearHolidays || [])]
                    const uniqueHolidays = allHolidays.filter((h, i, arr) => arr.findIndex((t) => t.date === h.date) === i)
                    const holidaysInRange = uniqueHolidays.filter((h) => {
                      const hDate = new Date(h.date)
                      const sDate = new Date(selectedVacation!.start_date)
                      const eDate = new Date(recallDate!)
                      return hDate >= sDate && hDate <= eDate
                    })
                    const totalDays = Math.max(0, calendarDays - holidaysInRange.length)
                    return (
                      <>
                        <div className="border-t pt-2 mt-2" />
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Новый период:</span>
                          <span className="font-medium">{formatDate(selectedVacation.start_date)} — {formatDate(recallDate)}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Календарных дней:</span>
                          <span className="font-medium">{calendarDays}</span>
                        </div>
                        {holidaysInRange.length > 0 && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Праздники:</span>
                            <span className="font-medium">
                              {holidaysInRange.map((h) => `${formatDate(h.date)} ${h.name}`).join(", ")}
                              {" "}
                              <span className="text-muted-foreground">({holidaysInRange.length} дн.)</span>
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Станет дней:</span>
                          <span className="font-semibold text-foreground">{totalDays}</span>
                        </div>
                      </>
                    )
                  })()}

                  {!recallDate && (
                    <div className="text-muted-foreground text-xs pt-2">
                      Введите дату отзыва, чтобы увидеть пересчет
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

      <div className="border rounded-lg bg-card">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {employee ? "Активные отпуски сотрудника" : "Все действующие отпуска на сегодня"}
          </h2>
          {!employee && (
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по сотруднику..."
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {tableFilter && (
                <button
                  onClick={() => setTableFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        {isLoadingAll ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">Загрузка...</div>
        ) : displayedVacations.length === 0 ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">
            {employee ? "У выбранного сотрудника нет активных отпусков" : "Нет действующих отпусков на сегодня"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {!employee && <th className="text-left px-4 py-3 font-medium">Сотрудник</th>}
                <th className="text-left px-4 py-3 font-medium">Начало</th>
                <th className="text-left px-4 py-3 font-medium">Конец</th>
                <th className="text-left px-4 py-3 font-medium">Тип</th>
                <th className="text-left px-4 py-3 font-medium">Приказ</th>
                <th className="w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {displayedVacations.map((v) => (
                <tr
                  key={v.id}
                  className={`border-t cursor-pointer hover:bg-muted/30 ${selectedVacation?.id === v.id ? "bg-blue-50" : ""}`}
                  onClick={() => {
                    setSelectedVacation(v)
                    setRecallDate("")
                    setErrors({})
                    setDraftId(null)
                    // Если выбрали отпуск из общего списка — подставляем сотрудника
                    if (!employee && onSelectEmployee && v.employee_id) {
                      // Заглушка: передаём минимальный объект Employee
                      onSelectEmployee({ id: v.employee_id, name: v.employee_name || "Сотрудник" } as Employee)
                    }
                  }}
                >
                  {!employee && <td className="px-4 py-3 font-medium">{v.employee_name || "—"}</td>}
                  <td className="px-4 py-3">{formatDate(v.start_date)}</td>
                  <td className="px-4 py-3">{formatDate(v.end_date)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{v.vacation_type}</Badge>
                  </td>
                  <td className="px-4 py-3">{v.order_number || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {selectedVacation?.id === v.id && (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                      {!employee && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-blue-500 hover:text-blue-700 gap-1"
                          title="Отозвать из отпуска"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedVacation(v)
                            setRecallDate("")
                            setErrors({})
                            setDraftId(null)
                            if (onSelectEmployee && v.employee_id) {
                              onSelectEmployee({ id: v.employee_id, name: v.employee_name || "Сотрудник" } as Employee)
                            }
                          }}
                        >
                          <CornerUpLeft className="h-4 w-4" />
                          <span className="text-xs">Отозвать</span>
                        </Button>
                      )}
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
}
