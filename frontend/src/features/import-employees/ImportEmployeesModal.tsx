import { useState, useRef } from "react"
import { Upload, Check, Download } from "lucide-react"
import axios from "@/shared/api/axios"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

interface ImportEmployeesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

interface ParsedData {
  sheets: { index: number; name: string; row_count: number }[]
  current_sheet_index: number
  current_sheet_name: string
  headers: string[]
  rows: string[][]
  row_count: number
}

const AVAILABLE_FIELDS = [
  { value: "tab_number", label: "Таб. №" },
  { value: "name", label: "ФИО" },
  { value: "department", label: "Подразделение" },
  { value: "position", label: "Должность" },
  { value: "hire_date", label: "Дата принятия" },
  { value: "birth_date", label: "Дата рождения" },
  { value: "gender", label: "Пол" },
  { value: "is_citizen_rb", label: "Гражданин РБ" },
  { value: "is_resident_rb", label: "Резидент РБ" },
  { value: "is_pensioner", label: "Пенсионер" },
  { value: "payment_form", label: "Форма оплаты" },
  { value: "rate", label: "Ставка" },
  { value: "contract_start", label: "Начало контракта" },
  { value: "contract_end", label: "Конец контракта" },
  { value: "personal_number", label: "Личный №" },
  { value: "insurance_number", label: "Страховой №" },
  { value: "passport_number", label: "№ паспорта" },
  { value: "additional_vacation_days", label: "Доп. дни отпуска" },
]

export function ImportEmployeesModal({ open, onOpenChange, onImportComplete }: ImportEmployeesModalProps) {
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [selectedSheet, setSelectedSheet] = useState<number>(0)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = async () => {
    try {
      const resp = await axios.get("/import/excel/template", {
        responseType: "blob",
      })
      const url = window.URL.createObjectURL(new Blob([resp.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", "Шаблон_импорт_сотрудников.xlsx")
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error("Download template error:", err)
      alert("Не удалось скачать шаблон")
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setSelectedSheet(0)

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", f)
      
      const resp = await axios.post("/import/excel?sheet_index=0", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      setParsed(resp.data)
      setStep("mapping")
      // Auto-map columns
      autoMapColumns(resp.data.headers)
    } catch (err: any) {
      console.error("Import error:", err)
      alert(`Ошибка импорта: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSheetChange = async (sheetIndex: number) => {
    if (!file) return
    setSelectedSheet(sheetIndex)
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const resp = await axios.post(`/import/excel?sheet_index=${sheetIndex}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      setParsed(resp.data)
      // Auto-map based on headers
      autoMapColumns(resp.data.headers)
    } catch (err: any) {
      console.error("Sheet change error:", err)
      alert(`Ошибка выбора листа: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Hard-coded column index mapping (0-based, based on template)
  const autoMapColumns = (headers: string[]) => {
    const newMapping: Record<string, string> = {}
    
    // Column index -> field name (from template)
    const indexMap: Record<number, string> = {
      1: "tab_number",          // Таб. №
      2: "name",                // ФИО
      3: "department",          // Подразделение
      4: "position",            // Должность
      5: "hire_date",           // Дата принятия
      6: "birth_date",          // Дата рождения
      7: "gender",              // Пол
      8: "is_citizen_rb",       // Гражданин РБ
      9: "is_resident_rb",      // Резидент РБ
      10: "is_pensioner",       // Пенсионер
      11: "payment_form",       // Форма оплаты
      12: "rate",               // Ставка
      13: "contract_start",     // Начало контракта
      14: "contract_end",       // Конец контракта
      15: "personal_number",    // Личный №
      16: "insurance_number",   // Страховой №
      17: "passport_number",    // № паспорта
      18: "additional_vacation_days", // Доп. дни отпуска
    }

    for (const [idx, field] of Object.entries(indexMap)) {
      const colIdx = parseInt(idx)
      if (colIdx < headers.length && headers[colIdx].trim()) {
        newMapping[field] = headers[colIdx]
      }
    }

    setMapping(newMapping)
  }

  const handleMappingChange = (field: string, column: string) => {
    setMapping((prev) => ({ ...prev, [field]: column }))
  }

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      
      // Send mapping as query params (not form-data)
      const queryParams = new URLSearchParams()
      queryParams.append("sheet_index", String(selectedSheet))
      for (const [field, column] of Object.entries(mapping)) {
        if (column) queryParams.append(field, column)
      }

      const resp = await axios.post(`/import/excel/confirm?${queryParams.toString()}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setResult(resp.data)
      setStep("result")
      onImportComplete()
    } catch (err: any) {
      console.error("Import confirm error:", err)
      alert(`Ошибка импорта: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep("upload")
    setFile(null)
    setParsed(null)
    setSelectedSheet(0)
    setMapping({})
    setResult(null)
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`w-full max-h-[95vh] overflow-hidden flex flex-col ${step === "mapping" ? "max-w-[95vw]" : "max-w-2xl"}`}>
        <DialogHeader>
          <DialogTitle>Импорт сотрудников из Excel</DialogTitle>
          <DialogDescription>
            Загрузите файл Excel и сопоставьте колонки с полями системы
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            {/* Кнопка скачивания шаблона */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Download className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Скачайте шаблон для заполнения
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Шаблон содержит правильные заголовки, примеры заполнения и 50 пустых строк
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

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Нажмите или перетащите заполненный файл Excel
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Поддерживаются .xlsx и .xls
              </p>
            </div>
          </div>
        )}

        {step === "mapping" && parsed && (
          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* Выбор листа */}
            {parsed.sheets.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Лист Excel:</label>
                <div className="flex flex-wrap gap-2">
                  {parsed.sheets.map((sheet) => (
                    <button
                      key={sheet.index}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        selectedSheet === sheet.index
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-accent"
                      }`}
                      onClick={() => handleSheetChange(sheet.index)}
                      disabled={loading}
                    >
                      {sheet.name} ({sheet.row_count} строк)
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Лист: "{parsed.current_sheet_name}". Найдено {parsed.row_count} строк. Сопоставьте колонки с полями системы:
            </div>

            <p className="text-xs text-muted-foreground">
              ↑ Колонки из шаблона автоматически расставлены по номерам. Можно изменить.
            </p>

            {/* Таблица с выпадающими списками над колонками — скролл в обе стороны */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <table className="text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  {/* Row 1: Mapping dropdowns */}
                  <tr>
                    {parsed.headers.map((h, colIdx) => {
                      const mappedField = Object.entries(mapping).find(([, v]) => v === h)?.[0]
                      const isMapped = !!mappedField
                      return (
                        <th key={`map-${colIdx}`} className={`px-1 py-1 border-r last:border-r-0 ${isMapped ? "bg-blue-50" : ""}`}>
                          <Select
                            value={mappedField || ""}
                            onValueChange={(val) => handleMappingChange(val, h)}
                          >
                            <SelectTrigger className={`h-7 text-xs px-1 overflow-hidden whitespace-nowrap ${isMapped ? "border-blue-400 bg-blue-50" : ""}`}>
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABLE_FIELDS.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </th>
                      )
                    })}
                  </tr>
                  {/* Row 2: Excel headers */}
                  <tr className="border-t">
                    {parsed.headers.map((h, colIdx) => (
                      <th key={`hdr-${colIdx}`} className="px-1 py-0.5 text-left text-xs text-muted-foreground font-normal sticky top-[33px] bg-muted z-10 border-b border-r last:border-r-0 overflow-hidden whitespace-nowrap">
                        <div className="truncate max-w-[200px]">{h}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-t hover:bg-accent/50">
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} className="px-1 py-0.5 text-xs border-r last:border-r-0 overflow-hidden whitespace-nowrap">
                          <div className="truncate max-w-[200px]">{cell}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend: mapped fields */}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="text-muted-foreground mr-1">Сопоставлено:</span>
              {Object.entries(mapping).filter(([, v]) => v).length === 0 && (
                <span className="text-muted-foreground italic">ничего не выбрано</span>
              )}
              {Object.entries(mapping).filter(([, v]) => v).map(([field]) => (
                <span key={field} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                  {AVAILABLE_FIELDS.find(f => f.value === field)?.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-medium mb-2">Импорт завершён</h3>
            <p className="text-muted-foreground">
              Создано: {result.created}, обновлено: {result.updated}, пропущено: {result.skipped}
            </p>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={reset}>
                Назад
              </Button>
              <Button onClick={handleImport} disabled={loading || !mapping.name}>
                Импортировать
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={handleClose}>Закрыть</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}