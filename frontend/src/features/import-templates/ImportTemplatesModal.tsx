import { useState, useRef } from "react"
import { Upload, Check, FileText } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog"

interface ImportTemplatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

const ORDER_TYPE_NAMES: Record<string, string> = {
  hire: "Прием на работу",
  dismissal: "Увольнение",
  transfer: "Перевод",
  contract_extension: "Продление контракта",
  vacation_paid: "Отпуск трудовой",
  vacation_unpaid: "Отпуск за свой счет",
  weekend_call: "Вызов в выходной",
}

export function ImportTemplatesModal({ open, onOpenChange, onImportComplete }: ImportTemplatesModalProps) {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ uploaded: number; skipped: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    const docxFiles = selected.filter((f) => f.name.endsWith(".docx"))
    setFiles(docxFiles)
    setResult(null)
  }

  const handleImport = async () => {
    if (!files.length) return
    setLoading(true)
    try {
      const formData = new FormData()
      files.forEach((file) => formData.append("files", file))

      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || "/api"}/order-types/templates/bulk-upload`,
        {
          method: "POST",
          body: formData,
        }
      )

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: "Ошибка загрузки" }))
        throw new Error(err.detail || "Ошибка загрузки")
      }

      const data = await resp.json()
      setResult(data)
      onImportComplete()
    } catch (err: any) {
      setResult({ uploaded: 0, skipped: files.length, errors: [err.message || "Неизвестная ошибка"] })
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFiles([])
    setResult(null)
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Импорт шаблонов приказов</DialogTitle>
          <DialogDescription>
            Загрузите сразу несколько .docx-шаблонов. Файлы распределяются по типам приказов по имени.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto">
          {/* Инструкция по именованию */}
          <div className="bg-muted/50 border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium">Требования к именам файлов</p>
                <p className="text-xs text-muted-foreground">
                  Имя файла (без расширения) должно совпадать с кодом типа приказа. Например:
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(ORDER_TYPE_NAMES).map(([code, name]) => (
                    <div key={code} className="flex items-center gap-1.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{code}.docx</code>
                      <span className="text-muted-foreground">— {name}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Также поддерживаются любые созданные вами типы — просто назовите файл по их коду.
                </p>
              </div>
            </div>
          </div>

          {/* Зона выбора файлов */}
          {!result && (
            <>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Нажмите или перетащите .docx-файлы
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Можно выбрать сразу несколько файлов
                </p>
              </div>

              {files.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium">Выбрано файлов: {files.length}</p>
                  <div className="space-y-1">
                    {files.map((file) => {
                      const code = file.name.replace(".docx", "")
                      const matched = ORDER_TYPE_NAMES[code]
                      return (
                        <div key={file.name} className="flex items-center justify-between text-xs">
                          <span className="font-mono">{file.name}</span>
                          {matched ? (
                            <span className="text-green-600 text-[11px]">→ {matched}</span>
                          ) : (
                            <span className="text-orange-500 text-[11px]">код не распознан</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Результат */}
          {result && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Загрузка завершена</h3>
              <p className="text-muted-foreground text-sm">
                Загружено: {result.uploaded}, пропущено: {result.skipped}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-3 text-left bg-red-50 border border-red-100 rounded-md p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Ошибки:</p>
                  <ul className="list-disc pl-4 text-xs text-red-600 space-y-0.5">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Отмена
              </Button>
              <Button onClick={handleImport} disabled={loading || files.length === 0}>
                {loading ? "Загрузка…" : "Загрузить шаблоны"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Закрыть</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
