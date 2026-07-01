import { useState, useEffect, useMemo } from "react"
import { Save, X, Lock, Unlock } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/use-toast"
import { useShiftTypes } from "@/entities/shift-type"
import {
  useCreateWorkSchedule,
  useApproveWorkSchedule,
  useUnapproveWorkSchedule,
  useBulkSetEntries,
  useWorkSchedules,
} from "@/entities/work-schedule"
import type { Employee } from "@/entities/employee/types"

interface WorkScheduleEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee
  year: number
  month: number
  onSaved: () => void
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function dateString(year: number, month: number, day: number) {
  const d = new Date(year, month - 1, day)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

export function WorkScheduleEditModal({
  open,
  onOpenChange,
  employee,
  year,
  month,
  onSaved,
}: WorkScheduleEditModalProps) {
  const shiftTypesQuery = useShiftTypes()
  const schedulesQuery = useWorkSchedules(year, month, employee.id)
  const existing = schedulesQuery.data?.[0]

  const createMutation = useCreateWorkSchedule()
  const approveMutation = useApproveWorkSchedule()
  const unapproveMutation = useUnapproveWorkSchedule()
  const bulkMutation = useBulkSetEntries()
  const { addToast } = useToast()

  const days = useMemo(() => daysInMonth(year, month), [year, month])

  // Локальное состояние редактирования: { [date]: { shift_type_code, planned_hours_override, note } }
  const [entries, setEntries] = useState<Record<string, { shift_type_code: string | null; planned_hours_override: number | null; note: string | null }>>({})
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (!open) {
      setIsInitialized(false)
      return
    }
    if (existing && existing.entries && !isInitialized) {
      const mapped: Record<string, any> = {}
      for (const e of existing.entries) {
        mapped[e.work_date] = {
          shift_type_code: e.shift_type_code,
          planned_hours_override: e.planned_hours_override,
          note: e.note,
        }
      }
      setEntries(mapped)
      setIsInitialized(true)
    } else if (!existing && !isInitialized) {
      // По умолчанию: будни = day, выходные = off
      const defaults: Record<string, any> = {}
      for (let d = 1; d <= days; d++) {
        defaults[dateString(year, month, d)] = {
          shift_type_code: null,
          planned_hours_override: null,
          note: null,
        }
      }
      setEntries(defaults)
      setIsInitialized(true)
    }
  }, [open, existing, isInitialized, days, month, year])

  const shiftTypes = shiftTypesQuery.data ?? []
  const isApproved = existing?.is_approved ?? false

  const handleCellChange = (date: string, key: string, value: any) => {
    setEntries((prev) => ({
      ...prev,
      [date]: { ...(prev[date] || {}), [key]: value },
    }))
  }

  const handleSave = async () => {
    try {
      let scheduleId: number
      if (existing) {
        scheduleId = existing.id
        await bulkMutation.mutateAsync({
          scheduleId,
          payload: {
            entries: Object.entries(entries).map(([date, data]) => ({
              work_date: date,
              shift_type_code: data.shift_type_code,
              planned_hours_override: data.planned_hours_override,
              note: data.note,
            })),
          },
        })
      } else {
        const created = await createMutation.mutateAsync({
          employee_id: employee.id,
          year,
          month,
        })
        scheduleId = created.id
        await bulkMutation.mutateAsync({
          scheduleId,
          payload: {
            entries: Object.entries(entries).map(([date, data]) => ({
              work_date: date,
              shift_type_code: data.shift_type_code,
              planned_hours_override: data.planned_hours_override,
              note: data.note,
            })),
          },
        })
      }
      addToast({ title: "График сохранён", variant: "success" })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      addToast({
        title: "Ошибка сохранения",
        description: err.response?.data?.detail || err.message,
        variant: "destructive",
      })
    }
  }

  const handleApproveToggle = async () => {
    if (!existing) return
    try {
      if (isApproved) {
        await unapproveMutation.mutateAsync(existing.id)
        addToast({ title: "Утверждение снято", variant: "success" })
      } else {
        await approveMutation.mutateAsync(existing.id)
        addToast({ title: "График утверждён", variant: "success" })
      }
      onSaved()
    } catch (err: any) {
      addToast({
        title: "Ошибка",
        description: err.response?.data?.detail || err.message,
        variant: "destructive",
      })
    }
  }

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Плановый график: {employee.name} — {monthName}
          </DialogTitle>
          <DialogDescription>
            {isApproved
              ? "График утверждён. Для редактирования снимите утверждение."
              : "Укажите тип смены для каждого дня. По умолчанию можно использовать шаблоны."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {schedulesQuery.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Загрузка…</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted sticky top-0">
                  <th className="border px-2 py-1 text-left">День</th>
                  <th className="border px-2 py-1 text-left">Дата</th>
                  <th className="border px-2 py-1 text-left">Тип смены</th>
                  <th className="border px-2 py-1 text-left">Часы</th>
                  <th className="border px-2 py-1 text-left">Примечание</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const date = dateString(year, month, d)
                  const dt = new Date(year, month - 1, d)
                  const dow = dt.getDay()
                  const isWeekend = dow === 0 || dow === 6
                  const dowName = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][dow]
                  const cell = entries[date] || { shift_type_code: null, planned_hours_override: null, note: null }
                  return (
                    <tr key={date} className={isWeekend ? "bg-muted/30" : ""}>
                      <td className="border px-2 py-1 text-xs">{dowName}</td>
                      <td className="border px-2 py-1 text-xs">
                        {dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                      </td>
                      <td className="border px-1 py-1">
                        <select
                          value={cell.shift_type_code ?? ""}
                          onChange={(e) =>
                            handleCellChange(date, "shift_type_code", e.target.value || null)
                          }
                          disabled={isApproved}
                          className="w-full px-1 py-0.5 text-xs border rounded h-7 bg-background"
                        >
                          <option value="">— не задано —</option>
                          {shiftTypes.map((st) => (
                            <option key={st.code} value={st.code}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border px-1 py-1">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={cell.planned_hours_override ?? ""}
                          onChange={(e) =>
                            handleCellChange(
                              date,
                              "planned_hours_override",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                          disabled={isApproved}
                          className="w-16 px-1 py-0.5 text-xs border rounded"
                          placeholder="—"
                        />
                      </td>
                      <td className="border px-1 py-1">
                        <input
                          type="text"
                          value={cell.note || ""}
                          onChange={(e) => handleCellChange(date, "note", e.target.value || null)}
                          disabled={isApproved}
                          className="w-full px-1 py-0.5 text-xs border rounded"
                          placeholder=""
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center">
          <div className="flex gap-2">
            {existing && (
              <Button variant="outline" size="sm" onClick={handleApproveToggle}>
                {isApproved ? <Unlock className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                {isApproved ? "Снять утверждение" : "Утвердить"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1" /> Закрыть
            </Button>
            <Button onClick={handleSave} disabled={isApproved}>
              <Save className="h-4 w-4 mr-1" /> Сохранить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
