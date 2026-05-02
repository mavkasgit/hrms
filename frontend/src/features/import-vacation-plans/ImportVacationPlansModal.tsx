import { useState, useRef } from "react"
import { Upload, X, FileSpreadsheet, Download } from "lucide-react"
import axios from "@/shared/api/axios"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog"
import { useImportVacationPlans } from "@/entities/vacation-plan"
import type { VacationPlanImportResult } from "@/entities/vacation-plan/api"
import { useToast } from "@/shared/ui/use-toast"

interface ImportVacationPlansModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  onImportComplete: () => void
}

type Step = "upload" | "preview" | "loading"

const MONTH_ORDER = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

export function ImportVacationPlansModal({
  open,
  onOpenChange,
  year,
  onImportComplete,
}: ImportVacationPlansModalProps) {
  const [step, setStep] = useState<Step>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<VacationPlanImportResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const importMutation = useImportVacationPlans()
  const { addToast } = useToast()

  const handleDownloadTemplate = async () => {
    try {
      const resp = await axios.get("/vacation-plans/import/template", {
        responseType: "blob",
      })
      const url = window.URL.createObjectURL(new Blob([resp.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", "Шаблон_график_отпусков.xlsx")
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error("Download template error:", err)
      addToast({ title: "Не удалось скачать шаблон", variant: "destructive" })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    // Автоматически запускаем preview после выбора файла
    handlePreview(f)
  }

  const handlePreview = async (f?: File) => {
    const targetFile = f || file
    if (!targetFile) return
    setStep("loading")
    try {
      const data = await importMutation.mutateAsync({ file: targetFile, year, previewOnly: true })
      setPreview(data)
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
    if (!file) return
    setStep("loading")
    try {
      const data = await importMutation.mutateAsync({ file, year, previewOnly: false })
      const messages: string[] = []
      if (data.created > 0) messages.push(`Создано: ${data.created}`)
      if (data.updated > 0) messages.push(`Обновлено: ${data.updated}`)
      if (data.not_found && data.not_found.length > 0) messages.push(`Не найдено: ${data.not_found.length}`)
      addToast({
        title: "Импорт завершён",
        description: messages.join(" · ") || "Данные успешно загружены",
        variant: "success",
      })
      onImportComplete()
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
    setStep("upload")
    setFile(null)
    setPreview(null)
    onOpenChange(false)
  }

  const renderPreviewTable = (data: VacationPlanImportResult) => (
    <div className="border rounded-lg overflow-hidden flex-shrink-0">
      <div className="max-h-[260px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-[200px]">ФИО</th>
              <th className="text-left px-3 py-2 font-medium w-[160px]">Должность</th>
              <th className="text-left px-3 py-2 font-medium">Месяцы отпуска</th>
              <th className="text-center px-3 py-2 font-medium w-[80px]">Статус</th>
            </tr>
          </thead>
          <tbody>
            {data.processed?.map((emp, idx) => {
              const monthEntries = Object.entries(emp.months || {})
                .sort((a, b) => MONTH_ORDER.indexOf(a[0]) - MONTH_ORDER.indexOf(b[0]))
              return (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-1.5 font-medium text-[11px]">{emp.name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground text-[11px]">{emp.position}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {monthEntries.map(([month, value]) => (
                        <span
                          key={month}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-medium"
                        >
                          {month}: {value}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {emp.is_update ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium" title="Все предыдущие записи за год будут удалены">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Замена
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-medium">
                        Новый
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Импорт графика отпусков</DialogTitle>
          <DialogDescription>
            Загрузите Excel с графиком отпусков на {year} год. В ячейках месяцев укажите планируемый отпуск — можно вводить как долю месяца (0.5, 1/2, 1/3), так и количество дней (14, 21, 28).
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Блок скачивания шаблона */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Download className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Скачайте шаблон для заполнения
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Шаблон содержит правильные заголовки и примеры заполнения
                  </p>
                  <button
                    className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 underline flex items-center gap-1"
                    onClick={handleDownloadTemplate}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать шаблон Excel
                  </button>
                </div>
              </div>
            </div>

            {/* Зона загрузки файла */}
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} КБ)</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                    }}
                    className="ml-2 text-muted-foreground hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Нажмите или перетащите заполненный файл Excel
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Поддерживаются .xlsx
                  </p>
                </>
              )}
            </div>

            {file && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setFile(null)}>
                  Отмена
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "loading" && (
          <div className="py-8 text-center space-y-3">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">Обработка файла...</p>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Статистика — компактные бейджи */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Будет создано: {preview.created}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Будет обновлено: {preview.updated}
              </span>
              {preview.not_found && preview.not_found.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  Не найдено: {preview.not_found.length}
                </span>
              )}
            </div>

            {/* Предупреждение о замене */}
            {preview.processed?.some((e) => e.is_update) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 flex-shrink-0">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Внимание:</span> для сотрудников со статусом «Замена» все предыдущие записи графика отпусков за {year} год будут удалены и заменены данными из файла.
                </p>
              </div>
            )}

            {renderPreviewTable(preview)}

            {/* Не найденные в базе (с данными по месяцам) */}
            {preview.not_found && preview.not_found.length > 0 && (
              <div className="border border-red-200 rounded-lg p-3 bg-red-50/50 flex-shrink-0">
                <p className="text-xs font-medium text-red-700 mb-2">
                  Не найдены в базе и будут пропущены:
                </p>
                <div className="max-h-[100px] overflow-y-auto space-y-1">
                  {preview.not_found.map((item, i) => (
                    <div key={i} className="text-sm text-red-700 flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full bg-red-400 mt-1.5 shrink-0" />
                      <div>
                        <span className="font-medium">{item.name}</span>
                        {item.position && <span className="text-red-600/70 text-[11px] ml-1">({item.position})</span>}
                        {item.months && Object.keys(item.months).length > 0 && (
                          <span className="text-red-600/80 text-[11px] ml-1">
                            — {Object.entries(item.months).map(([m, v]) => `${m}: ${v}`).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Пропущенные (пустые строки) */}
            {preview.skipped_empty && preview.skipped_empty.length > 0 && (
              <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50 flex-shrink-0">
                <p className="text-xs font-medium text-amber-700 mb-2">
                  Пропущены (не заполнены месяцы отпуска):
                </p>
                <div className="max-h-[80px] overflow-y-auto space-y-1">
                  {preview.skipped_empty.map((name, i) => (
                    <div key={i} className="text-sm text-amber-700 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-amber-400" />
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 flex-shrink-0">
              <Button variant="outline" onClick={handleClose}>
                Отмена
              </Button>
              <Button onClick={handleConfirm} className="gap-2">
                <Upload className="h-4 w-4" />
                Импортировать
              </Button>
            </div>
          </div>
        )}


      </DialogContent>
    </Dialog>
  )
}
