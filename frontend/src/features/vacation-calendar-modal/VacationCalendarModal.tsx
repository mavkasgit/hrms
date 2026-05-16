import { useRef, useState } from "react"
import { FileSpreadsheet, Upload, Download, Trash2, Eye } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/use-toast"
import { useVacationCalendarList, useDeleteVacationCalendar, useDownloadVacationCalendar } from "@/entities/vacation-plan/useVacationCalendar"
import { importVacationPlans, downloadVacationPlanTemplate } from "@/entities/vacation-plan/api"
import type { VacationPlanImportResult, VacationCalendarDocument } from "@/entities/vacation-plan/types"

interface VacationCalendarModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  onImportComplete: () => void
}

type Step = "upload" | "preview" | "loading"

const MONTH_ORDER = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

const MAX_VISIBLE_ITEMS = 10

export function VacationCalendarModal({ open, onOpenChange, year, onImportComplete }: VacationCalendarModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<VacationPlanImportResult | null>(null)
  const [step, setStep] = useState<Step>("upload")
  const [expanded, setExpanded] = useState(false)
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null)

  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useVacationCalendarList()
  const deleteMutation = useDeleteVacationCalendar()
  const downloadMutation = useDownloadVacationCalendar()
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
      const data = await importVacationPlans(targetFile, year, 0, true)
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
      await importVacationPlans(file, year, 0, false)
      addToast({
        title: "Импорт завершён",
        description: "График отпусков успешно загружен",
        variant: "success",
      })
      onImportComplete()
      refetchHistory()
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

  const handleDownload = (doc: VacationCalendarDocument) => {
    downloadMutation.mutate({ docId: doc.id, filename: doc.original_filename })
  }

  const handleOpenDocument = (doc: VacationCalendarDocument) => {
    window.open(`/documents/vacation_calendar/${doc.id}/view`, "_blank", "noopener,noreferrer")
  }

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadVacationPlanTemplate()
      const url = window.URL.createObjectURL(new Blob([blob]))
      const link = document.createElement("a")
      link.href = url
      link.download = "Шаблон_график_отпусков.xlsx"
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      addToast({ title: "Не удалось скачать шаблон", variant: "destructive" })
    }
  }

  const handleDeleteConfirm = async () => {
    if (deleteDocId === null) return
    try {
      await deleteMutation.mutateAsync(deleteDocId)
      setDeleteDocId(null)
      addToast({ title: "Файл удалён", variant: "success" })
    } catch (err: any) {
      addToast({
        title: "Ошибка удаления",
        description: err.response?.data?.detail || "Не удалось удалить файл",
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

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
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
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium">
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

  const displayedHistory = expanded ? history : history?.slice(0, MAX_VISIBLE_ITEMS)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            График отпусков {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-auto pr-1">
          {/* Template download */}
          {step === "upload" && (
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
          )}

          {/* Upload area */}
          {step === "upload" && (
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Нажмите для загрузки графика отпусков
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Формат: .xlsx
              </p>
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
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  Создано: {preview.created}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  Обновлено: {preview.updated}
                </span>
              </div>

              {renderPreviewTable(preview)}

              <div className="flex justify-end gap-2 flex-shrink-0">
                <Button variant="outline" onClick={handleClose}>
                  Отмена
                </Button>
                <Button onClick={handleConfirm}>
                  Импортировать
                </Button>
              </div>
            </div>
          )}

          {/* History */}
          <div>
            <h3 className="text-sm font-medium mb-2">История загрузок</h3>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            ) : !history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground">История пуста</p>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Файл</th>
                        <th className="text-left px-3 py-2 font-medium">Дата</th>
                        <th className="text-right px-3 py-2 font-medium">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedHistory?.map((doc) => (
                        <tr key={doc.id} className="border-t hover:bg-muted/50">
                          <td className="px-3 py-2">
                            <span className="truncate max-w-[200px]" title={doc.original_filename}>
                              {doc.original_filename}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {formatDate(doc.uploaded_at)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDocument(doc)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(doc)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteDocId(doc.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(history?.length ?? 0) > MAX_VISIBLE_ITEMS && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-muted-foreground"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? "Свернуть" : `Показать все (${history?.length})`}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={deleteDocId !== null} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить файл?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Файл будет удалён безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
