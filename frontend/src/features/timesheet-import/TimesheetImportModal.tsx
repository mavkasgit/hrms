import { useState, useRef, useMemo } from "react"
import {
  Upload,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/use-toast"
import { usePreviewImport, useConfirmImport } from "@/entities/timesheet"
import type { TimesheetPreview, TimesheetPreviewDay } from "@/entities/timesheet"

function formatHours(h: number | null | undefined) {
  if (h === null || h === undefined) return ""
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

const REASON_LABELS: Record<string, string> = {
  not_found: "Сотрудник не найден в базе",
  ambiguous_name: "Найдено несколько сотрудников с таким ФИО",
  ambiguous_tab: "Найдено несколько сотрудников с таким табельным номером",
}

function formatReason(reason?: string | null): string | null {
  if (!reason) return null
  return REASON_LABELS[reason] ?? reason
}

function summarizeDays(
  days:
    | Record<string, { work_hours?: number; presence_hours?: number; night_hours?: number }>
    | undefined,
) {
  let workingDays = 0
  let totalHours = 0
  let nightHours = 0
  if (!days) return { workingDays, totalHours, nightHours }
  for (const day of Object.values(days)) {
    const h = day.work_hours ?? day.presence_hours ?? 0
    if (h > 0) workingDays++
    totalHours += h
    nightHours += day.night_hours ?? 0
  }
  return { workingDays, totalHours, nightHours }
}

function EmployeeDayGrid({
  datesInRange,
  days,
  useShiftTypeForNight = true,
}: {
  datesInRange: string[]
  days: Record<string, TimesheetPreviewDay> | undefined
  useShiftTypeForNight?: boolean
}) {
  const [showRaw, setShowRaw] = useState(false)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] gap-1 px-2"
          onClick={() => setShowRaw((v) => !v)}
          title={showRaw ? "Скрыть сырые значения" : "Показать сырые значения из Excel"}
          data-testid="timesheet-import-toggle-raw"
        >
          {showRaw ? (
            <>
              <EyeOff className="h-3 w-3" />
              Скрыть сырое
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              Сырое время
            </>
          )}
        </Button>
      </div>
      <div className="overflow-x-auto whitespace-nowrap scrollbar-thin py-1">
        <div className="inline-flex gap-0.5 border border-muted rounded p-0.5 bg-muted/20">
          {datesInRange.map((dateStr) => {
            const dayNum = new Date(dateStr).getDate()
            const dayData = days?.[dateStr]
            const hours = dayData?.work_hours ?? dayData?.presence_hours ?? 0
            const isNight = useShiftTypeForNight
              ? dayData?.shift_type === 2
              : (dayData?.night_hours ?? 0) > 0
            const rawWork = showRaw ? dayData?.raw?.work ?? null : null

            const display = showRaw
              ? rawWork || (hours > 0 ? String(hours) : "—")
              : hours > 0
              ? String(hours)
              : "—"

            return (
              <div
                key={dateStr}
                className={`w-10 h-12 flex flex-col items-center justify-between border rounded p-0.5 select-none ${
                  isNight
                    ? "bg-[#1e3a8a25] border-[#1e3a8a40] text-primary font-medium"
                    : hours > 0
                    ? "bg-muted/40 border-muted text-foreground"
                    : "bg-background text-muted-foreground/30 border-dashed"
                }`}
                title={
                  showRaw && rawWork
                    ? `${dateStr}: сырое «${rawWork}» → ${hours}ч (смена: ${isNight ? "2" : "1"})`
                    : `${dateStr}: ${hours}ч (смена: ${isNight ? "2" : "1"})`
                }
              >
                <span className="text-[8px] text-muted-foreground/60 leading-none">{dayNum}</span>
                <span
                  className={`leading-none ${
                    showRaw && rawWork ? "text-[10px] font-mono" : "font-semibold text-xs"
                  }`}
                >
                  {display}
                </span>
                <span className="text-[9px] font-bold leading-none text-muted-foreground/75">
                  {hours > 0 ? (isNight ? "2" : "1") : ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface EmployeePreviewRowProps {
  name: string
  tabNumber?: string | null
  positionName?: string | null
  daysCountInFile: number
  reason?: string
  days: Record<string, any> | undefined
  datesInRange: string[]
  useShiftTypeForNight?: boolean
}

function EmployeePreviewRow({
  name,
  tabNumber,
  positionName,
  daysCountInFile,
  reason,
  days,
  datesInRange,
  useShiftTypeForNight = true,
}: EmployeePreviewRowProps) {
  const [expanded, setExpanded] = useState(false)
  const { workingDays, totalHours, nightHours } = useMemo(() => summarizeDays(days), [days])

  return (
    <div className="text-sm">
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {name}
            <span className="font-normal text-muted-foreground">
              {" "}
              — рабочих дней: {workingDays}, часов: {formatHours(totalHours) || 0}, ночных:{" "}
              {formatHours(nightHours) || 0}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Таб: {tabNumber || "—"} · {positionName || "—"} · {daysCountInFile} дн.
          </div>
          {reason && (
            <div className="text-xs text-yellow-700">Причина: {formatReason(reason)}</div>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform mt-0.5" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform mt-0.5" />
        )}
      </div>
      {expanded && (
        <div className="pl-4 pr-2 pb-3">
          <EmployeeDayGrid
            datesInRange={datesInRange}
            days={days}
            useShiftTypeForNight={useShiftTypeForNight}
          />
        </div>
      )}
    </div>
  )
}

interface TimesheetImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

type Step = "upload" | "preview" | "loading"

export function TimesheetImportModal({ open, onOpenChange, onImported }: TimesheetImportModalProps) {
  const [step, setStep] = useState<Step>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<TimesheetPreview | null>(null)
  const [assignments, setAssignments] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previewMutation = usePreviewImport()
  const confirmMutation = useConfirmImport()

  const { addToast } = useToast()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    handlePreview(f)
  }

  const handlePreview = async (f?: File) => {
    const targetFile = f || file
    if (!targetFile) return
    setStep("loading")
    try {
      const data = await previewMutation.mutateAsync(targetFile)
      setPreview(data)
      setAssignments({})
      setStep("preview")
    } catch (err: any) {
      setStep("upload")
      addToast({
        title: "Ошибка парсинга",
        description: err.response?.data?.detail || err.message,
        variant: "destructive",
      })
    }
  }

  const handleConfirm = async () => {
    if (!file || !preview) return
    setStep("loading")
    try {
      const data = await confirmMutation.mutateAsync({ file, assignments })
      addToast({
        title: "Импорт завершён",
        description: `Сопоставлено: ${data.employees_matched} · Не сопоставлено: ${data.employees_unmatched} · Записей: ${data.entries_imported}`,
        variant: "success",
      })
      onImported()
      handleClose()
    } catch (err: any) {
      setStep("preview")
      addToast({
        title: "Ошибка импорта",
        description: err.response?.data?.detail || err.message,
        variant: "destructive",
      })
    }
  }

  const handleClose = () => {
    setFile(null)
    setPreview(null)
    setAssignments({})
    setStep("upload")
    onOpenChange(false)
  }



  const datesInRange = useMemo(() => {
    if (!preview?.period_start || !preview?.period_end) return []
    const start = new Date(preview.period_start)
    const end = new Date(preview.period_end)
    const dates: string[] = []
    let curr = new Date(start)
    while (curr <= end) {
      dates.push(curr.toISOString().split("T")[0])
      curr.setDate(curr.getDate() + 1)
    }
    return dates
  }, [preview?.period_start, preview?.period_end])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    const [year, month, day] = dateStr.split("-")
    if (!year || !month || !day) return dateStr
    return `${day}.${month}.${year}`
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-fit min-w-[480px] max-w-[90vw] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Импорт журнала турникетов</DialogTitle>
          <DialogDescription>
            Загрузите файл с учётом рабочего времени из пропускной системы. Сотрудники будут сопоставлены
            автоматически по ФИО, а нераспознанных можно подобрать вручную.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Нажмите для выбора .xlsx файла
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Формат: Учёт рабочего времени (турникеты)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
              {file && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-sm truncate">{file.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "loading" && (
            <div className="py-12 text-center text-muted-foreground">Загрузка…</div>
          )}

          {step === "preview" && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-md text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Период</div>
                  <div className="font-medium">
                    {formatDate(preview.period_start)} — {formatDate(preview.period_end)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Подразделение</div>
                  <div className="font-medium">{preview.department_name || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Всего</div>
                  <div className="font-medium">{preview.employees_total}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Сопоставлено</div>
                  <div className="font-medium text-green-600">{preview.employees_matched}</div>
                </div>
              </div>

              {preview.unmatched.length > 0 && (
                <div className="border rounded-md">
                  <div className="bg-yellow-50 border-b px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium">
                      Нераспознанные сотрудники ({preview.unmatched.length})
                    </span>
                  </div>
                  <div className="divide-y max-h-80 overflow-y-auto">
                    {preview.unmatched.map((u) => (
                      <EmployeePreviewRow
                        key={u.key}
                        name={`${u.last_name ?? ""} ${u.first_name ?? ""} ${u.patronymic ?? ""}`.trim()}
                        tabNumber={u.tab_number}
                        positionName={u.position_name}
                        daysCountInFile={u.days_count}
                        reason={u.reason}
                        days={u.days}
                        datesInRange={datesInRange}
                        useShiftTypeForNight
                      />
                    ))}
                  </div>
                </div>
              )}

              {preview.matched_preview.length > 0 && (
                <div className="border rounded-md">
                  <div className="bg-green-50 border-b px-3 py-2 flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">
                      Сопоставленные ({preview.matched_preview.length})
                    </span>
                  </div>
                  <div className="divide-y max-h-80 overflow-y-auto">
                    {preview.matched_preview.map((m) => (
                      <EmployeePreviewRow
                        key={m.parsed_index}
                        name={m.employee_name}
                        tabNumber={m.tab_number != null ? String(m.tab_number) : null}
                        daysCountInFile={m.days_count}
                        days={m.days}
                        datesInRange={datesInRange}
                        useShiftTypeForNight={false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {step !== "loading" && (
          <div className="border-t bg-background px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Отмена
            </Button>
            {step === "preview" && (
              <Button onClick={handleConfirm} data-testid="timesheet-import-confirm">
                <Upload className="h-4 w-4 mr-2" />
                Импортировать
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
