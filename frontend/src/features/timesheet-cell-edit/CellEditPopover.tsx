import { useEffect, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Check, Trash2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useShiftTypes } from "@/entities/shift-type"
import {
  useCreateWorkSchedule,
  useSetWorkScheduleEntry,
  useDeleteWorkScheduleEntry,
  useWorkSchedules,
} from "@/entities/work-schedule"

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

function normalizeShiftType(raw: {
  code: string
  start_time?: string | null
  end_time?: string | null
  startTime?: string | null
  endTime?: string | null
  name?: string
  label?: string
  planned_hours?: number
  plannedHours?: number
  is_working?: boolean
  isWorking?: boolean
  is_night?: boolean
  isNight?: boolean
  sort_order?: number
  sortOrder?: number
  color: string
  letter?: string | null
}) {
  return {
    code: raw.code,
    name: raw.name ?? raw.label ?? raw.code,
    start_time: raw.start_time ?? raw.startTime ?? null,
    end_time: raw.end_time ?? raw.endTime ?? null,
    planned_hours: raw.planned_hours ?? raw.plannedHours ?? 0,
    is_working: raw.is_working ?? raw.isWorking ?? true,
    is_night: raw.is_night ?? raw.isNight ?? false,
    sort_order: raw.sort_order ?? raw.sortOrder ?? 0,
    color: raw.color,
    letter: raw.letter ?? null,
  }
}

interface CellEditPopoverProps {
  employeeId: number
  year: number
  month: number
  workDate: string
  currentShiftTypeCode: string | null
  currentHours: number | null
  currentNote: string | null
  absence?: { type: "vacation" | "sick_leave"; order_id?: number | null; vacation_type?: string | null } | null
  children: React.ReactNode
  onSaved?: () => void
}

export function CellEditPopover({
  employeeId,
  year,
  month,
  workDate,
  currentShiftTypeCode,
  currentHours,
  currentNote,
  absence = null,
  children,
  onSaved,
}: CellEditPopoverProps) {
  const [open, setOpen] = useState(false)
  const [shiftTypeCode, setShiftTypeCode] = useState<string | null>(currentShiftTypeCode)
  const [hours, setHours] = useState<string>(currentHours !== null ? String(currentHours) : "")
  const [entryId, setEntryId] = useState<number | null>(null)
  const [note, setNote] = useState<string>(currentNote || "")
  const [isHoursInvalid, setIsHoursInvalid] = useState(false)

  const shiftTypesQuery = useShiftTypes()
  const schedulesQuery = useWorkSchedules(year, month)
  const createSchedule = useCreateWorkSchedule()
  const setEntry = useSetWorkScheduleEntry()
  const deleteEntry = useDeleteWorkScheduleEntry()
  const qc = useQueryClient()

  useEffect(() => {
    if (open) {
      setShiftTypeCode(currentShiftTypeCode)
      setHours(currentHours !== null ? String(currentHours) : "")
      setNote(currentNote || "")
      setIsHoursInvalid(false)
      const schedule = schedulesQuery.data?.find(s => s.employee_id === employeeId)
      if (schedule) {
        const entry = schedule.entries.find((e) => e.work_date === workDate)
        setEntryId(entry?.id ?? null)
      } else {
        setEntryId(null)
      }
    }
  }, [open, currentShiftTypeCode, currentHours, currentNote, schedulesQuery.data, workDate])

  const isSaving = setEntry.isPending || createSchedule.isPending

  const updateCacheOptimistically = (nextShiftTypeCode: string | null, nextHours: string) => {
    const queries = qc.getQueriesData<{ employees: any[] }>({ queryKey: ["timesheet-grid"] })
    const hoursNum = nextHours === "" ? null : Number(nextHours)
    for (const [queryKey, oldData] of queries) {
      if (!oldData) continue
      const updatedEmployees = oldData.employees.map((emp) => {
        if (emp.id !== employeeId) return emp
        return {
          ...emp,
          plan: {
            ...emp.plan,
            [workDate]: {
              ...emp.plan[workDate],
              shift_type_code: nextShiftTypeCode,
              planned_hours_override: hoursNum,
            }
          }
        }
      })
      qc.setQueryData(queryKey, {
        ...oldData,
        employees: updatedEmployees
      })
    }
  }

  const deleteCacheOptimistically = () => {
    const queries = qc.getQueriesData<{ employees: any[] }>({ queryKey: ["timesheet-grid"] })
    for (const [queryKey, oldData] of queries) {
      if (!oldData) continue
      const updatedEmployees = oldData.employees.map((emp) => {
        if (emp.id !== employeeId) return emp
        return {
          ...emp,
          plan: {
            ...emp.plan,
            [workDate]: {
              ...emp.plan[workDate],
              shift_type_code: null,
              planned_hours_override: null,
            }
          }
        }
      })
      qc.setQueryData(queryKey, {
        ...oldData,
        employees: updatedEmployees
      })
    }
  }

  const handleDelete = async () => {
    deleteCacheOptimistically()
    setOpen(false)
    if (!entryId) return
    const schedule = schedulesQuery.data?.find(s => s.employee_id === employeeId)
    if (!schedule) return
    try {
      await deleteEntry.mutateAsync({ scheduleId: schedule.id, entryId })
      qc.invalidateQueries({ queryKey: ["work-schedules", year, month, employeeId] })
      qc.invalidateQueries({ queryKey: ["timesheet"] })
      qc.invalidateQueries({ queryKey: ["timesheet-grid"] })
      onSaved?.()
    } catch (err) {
      console.error("Failed to delete cell", err)
      onSaved?.()
    }
  }

  const saveWithValues = async (nextShiftTypeCode: string | null, nextHours: string) => {
    updateCacheOptimistically(nextShiftTypeCode, nextHours)
    setOpen(false)
    try {
      let scheduleId: number | null = null
      const existing = schedulesQuery.data?.find(s => s.employee_id === employeeId)
      if (existing) {
        scheduleId = existing.id
      } else {
        const created = await createSchedule.mutateAsync({
          employee_id: employeeId,
          year,
          month,
        })
        scheduleId = created.id
      }

      const hoursNum = nextHours === "" ? null : Number(nextHours)
      await setEntry.mutateAsync({
        scheduleId,
        payload: {
          work_date: workDate,
          shift_type_code: nextShiftTypeCode,
          planned_hours_override: hoursNum,
          note: note || null,
        },
      })

      qc.invalidateQueries({ queryKey: ["work-schedules", year, month, employeeId] })
      qc.invalidateQueries({ queryKey: ["timesheet"] })
      qc.invalidateQueries({ queryKey: ["work-schedule", scheduleId] })
      qc.invalidateQueries({ queryKey: ["timesheet-grid"] })
      onSaved?.()
    } catch (err) {
      console.error("Failed to save cell", err)
      onSaved?.()
    }
  }

  const getDefaultHoursForShift = (code: string): string => {
    const raw = shiftTypesQuery.data?.find((st: any) => st.code === code)
    if (raw) {
      const norm = normalizeShiftType(raw)
      if (norm.planned_hours > 0) {
        return String(norm.planned_hours)
      }
    }
    if (code === "day") return "8"
    if (code === "day_long" || code === "night") return "12"
    return ""
  }

  const handleShiftSelect = (code: string) => {
    let targetHours = hours
    if (!hours.trim() || Number(hours) === 0) {
      const def = getDefaultHoursForShift(code)
      targetHours = def
      setHours(def)
    }
    setIsHoursInvalid(false)
    setShiftTypeCode(code)
    saveOrDelete(code, targetHours)
  }

  const saveOrDelete = async (nextShiftTypeCode: string | null, nextHours: string) => {
    if (nextShiftTypeCode === null && nextHours === "") {
      await handleDelete()
    } else {
      await saveWithValues(nextShiftTypeCode, nextHours)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-3"
        align="start"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            Редактирование: {formatDateRu(workDate)}
          </div>

          {absence ? (
            <div className="p-3 border rounded-lg bg-muted/40 space-y-2 text-center">
              <div className="text-xs font-semibold text-destructive flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                {absence.type === "vacation"
                  ? (absence.vacation_type === "Отпуск за свой счет" ? "Отпуск за свой счет" : "Трудовой отпуск")
                  : "Больничный"}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Редактирование заблокировано
              </p>
              {absence.order_id ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7 cursor-pointer mt-1 bg-background hover:bg-accent"
                  onClick={() => {
                    window.open(`/orders/${absence.order_id}/view-docx`, "_blank", "noopener,noreferrer")
                  }}
                >
                  Открыть приказ
                </Button>
              ) : (
                <div className="text-[10px] text-muted-foreground italic border-t pt-1 mt-1">
                  Без приказа
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Часы и быстрый выбор смены в одну строку */}
              <div className="flex gap-1.5 items-end">
                <div className="w-[48px] flex-shrink-0">
                  <label className="text-xs font-medium">Часы</label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={hours}
                    onChange={(e) => {
                      setHours(e.target.value)
                      setIsHoursInvalid(false)
                    }}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveOrDelete(shiftTypeCode, hours)
                      }
                      if (e.key === "Escape") {
                        setOpen(false)
                      }
                    }}
                    onBlur={() => {
                      const initialHoursStr = currentHours !== null ? String(currentHours) : ""
                      const initialShiftType = currentShiftTypeCode
                      if (hours !== initialHoursStr || shiftTypeCode !== initialShiftType) {
                        saveOrDelete(shiftTypeCode, hours)
                      }
                    }}
                    placeholder="0"
                    className={`h-8 text-xs mt-1 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      isHoursInvalid ? "border-destructive ring-destructive ring-1 focus-visible:ring-destructive focus-visible:border-destructive" : ""
                    }`}
                    autoFocus
                  />
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant={shiftTypeCode === "day" || shiftTypeCode === "day_long" ? "default" : "outline"}
                  disabled={isSaving}
                  className="h-8 text-xs px-2 cursor-pointer flex-shrink-0"
                  onClick={() => handleShiftSelect("day")}
                  title="1-я смена (День)"
                >
                  1 см.
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant={shiftTypeCode === "night" ? "default" : "outline"}
                  disabled={isSaving}
                  className="h-8 text-xs px-2 cursor-pointer flex-shrink-0"
                  onClick={() => handleShiftSelect("night")}
                  title="2-я смена (Ночь)"
                >
                  2 см.
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 hover:border-destructive px-2 cursor-pointer flex-shrink-0 ml-auto gap-1"
                  onClick={handleDelete}
                  title="Очистить ячейку"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Очистить</span>
                </Button>
              </div>

              {/* Выбор смены */}
              <div>
                <label className="text-xs font-medium">Смена</label>
                <div className="mt-1 max-h-44 overflow-y-auto border rounded-md divide-y">
                  {shiftTypesQuery.isLoading ? (
                    <div className="p-2 text-xs text-muted-foreground">Загрузка…</div>
                  ) : (
                    <>
                      {(shiftTypesQuery.data ?? [])
                        .filter((st: any) => ["day", "day_long", "night"].includes(st.code))
                        .map((st: any) => {
                          const normalized = normalizeShiftType(st)
                          const isSelected = shiftTypeCode === normalized.code
                        return (
                          <button
                            key={normalized.code}
                            type="button"
                            disabled={isSaving}
                            className={`w-full flex items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-accent ${
                              isSelected ? "bg-accent" : ""
                            }`}
                            onClick={() => handleShiftSelect(normalized.code)}
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: normalized.color }}
                              />
                              <span>{normalized.name}</span>
                            </span>
                            {isSelected && <Check className="h-3 w-3" />}
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Быстрые статусы отклонений */}
              <div>
                <label className="text-xs font-medium">Выберете из списка</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {shiftTypesQuery.isLoading ? (
                    <div className="text-xs text-muted-foreground">Загрузка…</div>
                  ) : (
                    (shiftTypesQuery.data ?? [])
                      .filter((st: any) => !(st.is_working ?? st.isWorking) && st.code !== "off")
                      .map((st: any) => {
                        const letter = st.letter ?? st.code?.[0] ?? "?"
                        const isActive = shiftTypeCode === st.code
                        const displayName = st.code === "A" ? "За свой счет" : (st.name ?? st.label ?? st.code)
                        return (
                          <button
                            key={st.code}
                            type="button"
                            disabled={isSaving}
                            onClick={() => {
                              const nextHours = String(st.planned_hours)
                              setShiftTypeCode(st.code)
                              setHours(nextHours)
                              saveOrDelete(st.code, nextHours)
                            }}
                            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-all cursor-pointer ${
                              isActive
                                ? "bg-accent border-primary ring-1 ring-primary"
                                : "bg-background hover:bg-accent border-input"
                            }`}
                          >
                            <span
                              className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full flex-shrink-0 px-0.5 text-[8px] font-bold leading-none"
                              style={{ backgroundColor: st.color, color: "white" }}
                            >
                              {letter}
                            </span>
                            <span>{displayName}</span>
                          </button>
                        )
                      })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
