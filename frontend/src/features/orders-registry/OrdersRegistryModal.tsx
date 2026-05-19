import { useState, useEffect } from "react"
import { Printer, Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import api from "@/shared/api/axios"

interface RegistryEntry {
  order_id: number
  employee_name: string
  order_type_name: string
  order_number: string
  order_date: string
  work_period: string
}

interface OrdersRegistryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year?: number
}

export function OrdersRegistryModal({ open, onOpenChange, year: defaultYear }: OrdersRegistryModalProps) {
  const [items, setItems] = useState<RegistryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [yearOptions, setYearOptions] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [debugTotal, setDebugTotal] = useState<number | null>(null)
  const [isPdfLoading, setIsPdfLoading] = useState(false)

  // Fetch available years when modal opens
  const fetchYears = async () => {
    try {
      const { data } = await api.get("/orders/registry/years", {
        params: { letter: "л" },
      })
      const years = data.years as number[]
      setYearOptions(years)
      if (years.length > 0) {
        const initialYear = defaultYear && years.includes(defaultYear) ? defaultYear : years[0]
        setSelectedYear(initialYear)
      }
    } catch {
      setYearOptions([])
    }
  }

  // Fetch registry when selectedYear is set
  useEffect(() => {
    if (selectedYear && open) {
      fetchRegistry(selectedYear)
    }
  }, [selectedYear, open])

  // Controlled dialog: load years when parent opens modal.
  useEffect(() => {
    if (open) {
      void fetchYears()
      return
    }

    setLoaded(false)
    setItems([])
    setDebugTotal(null)
    setSelectedYear(null)
    setYearOptions([])
  }, [open])

  const fetchRegistry = async (year: number) => {
    setLoading(true)
    try {
      const { data } = await api.get("/orders/registry", {
        params: { letter: "л", year },
      })
      setItems(data.items)
      setDebugTotal(data.debug_total ?? null)
      setLoaded(true)
    } catch {
      setItems([])
      setDebugTotal(null)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
  }

  const handleYearChange = (val: string) => {
    const y = Number(val)
    setSelectedYear(y)
    setLoaded(false)
    setItems([])
    setDebugTotal(null)
  }

  const handleDownloadPdf = async () => {
    setIsPdfLoading(true)
    try {
      const pdfMake = (await import("pdfmake/build/pdfmake")).default as any
      const pdfFonts = (await import("pdfmake/build/vfs_fonts")).default as any
      pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts

      const MARGIN_PT = 8 * 2.8346456693
      const A4_W_PT = 595.28
      const USABLE_W_PT = A4_W_PT - 2 * MARGIN_PT
      const TABLE_FONT_PT = 9 * 0.75

      const colWidths = [
        0.07 * USABLE_W_PT,  // №
        0.25 * USABLE_W_PT,  // ФИО
        0.18 * USABLE_W_PT,  // Тип приказа
        0.12 * USABLE_W_PT,  // Номер
        0.12 * USABLE_W_PT,  // Дата
        0.18 * USABLE_W_PT,  // Трудовой период
      ]

      const title = `Реестр по личному составу — ${selectedYear}`

      const content: any[] = [
        {
          text: title,
          alignment: "center",
          fontSize: 12,
          bold: true,
          margin: [0, 0, 0, 2],
        },
        {
          text: `Дата формирования: ${new Date().toLocaleDateString("ru-RU")}`,
          alignment: "center",
          fontSize: 8,
          margin: [0, 0, 0, 6],
        },
      ]

      const tableBody: any[][] = []
      tableBody.push(
        [
          { text: "№", bold: true, fontSize: 8, fillColor: "#e5e5e5", alignment: "center" },
          { text: "ФИО сотрудника", bold: true, fontSize: 8, fillColor: "#e5e5e5" },
          { text: "Тип приказа", bold: true, fontSize: 8, fillColor: "#e5e5e5" },
          { text: "Номер приказа", bold: true, fontSize: 8, fillColor: "#e5e5e5" },
          { text: "Дата приказа", bold: true, fontSize: 8, fillColor: "#e5e5e5", alignment: "center" },
          { text: "Трудовой период", bold: true, fontSize: 8, fillColor: "#e5e5e5" },
        ]
      )

      items.forEach((item, i) => {
        tableBody.push([
          { text: String(i + 1), fontSize: TABLE_FONT_PT, alignment: "center" },
          { text: item.employee_name, fontSize: TABLE_FONT_PT },
          { text: item.order_type_name, fontSize: TABLE_FONT_PT },
          { text: item.order_number, fontSize: TABLE_FONT_PT },
          { text: formatDate(item.order_date), fontSize: TABLE_FONT_PT, alignment: "center" },
          { text: item.work_period || "—", fontSize: TABLE_FONT_PT },
        ])
      })

      content.push({
        table: {
          headerRows: 1,
          widths: colWidths,
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
          paddingLeft: () => 3,
          paddingRight: () => 3,
          paddingTop: () => 0.75,
          paddingBottom: () => 0.75,
        },
      })

      content.push({
        text: `Всего записей: ${items.length}`,
        fontSize: 8,
        margin: [0, 6, 0, 0],
      })

      const docDefinition = {
        pageSize: "A4" as const,
        pageMargins: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT] as [number, number, number, number],
        content,
        defaultStyle: {
          font: "Roboto",
          fontSize: TABLE_FONT_PT,
        },
      }

      pdfMake.createPdf(docDefinition).open()
    } catch (error) {
      console.error("Error generating PDF:", error)
    } finally {
      setIsPdfLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Реестр по личному составу</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {yearOptions.length > 0 ? (
              <>
                <Select value={selectedYear !== null ? String(selectedYear) : undefined} onValueChange={handleYearChange}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  {loaded ? `Записей: ${items.length}${debugTotal !== null && debugTotal !== items.length ? ` (всего в БД: ${debugTotal})` : ""}` : ""}
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Нет приказов с литерой л</span>
            )}
          </div>
          <div>
            {loaded && items.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isPdfLoading}>
                {isPdfLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-1.5 h-4 w-4" />
                )}
                {isPdfLoading ? "Загрузка..." : "Печать"}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Загрузка...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b">
                  <th className="text-center font-medium py-2 px-2 w-10">№</th>
                  <th className="text-left font-medium py-2 px-3">ФИО сотрудника</th>
                  <th className="text-left font-medium py-2 px-3">Тип приказа</th>
                  <th className="text-left font-medium py-2 px-3">Номер приказа</th>
                  <th className="text-center font-medium py-2 px-3 w-28">Дата</th>
                  <th className="text-left font-medium py-2 px-3">Трудовой период</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Нет приказов с литерой л за {selectedYear} год
                    </td>
                  </tr>
                ) : (
                  items.map((item, i) => (
                    <tr key={`${item.order_id}-${item.employee_name}-${i}`} className="border-b hover:bg-muted/50">
                      <td className="text-center py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 px-3 font-medium">{item.employee_name}</td>
                      <td className="py-1.5 px-3">{item.order_type_name}</td>
                      <td className="py-1.5 px-3">{item.order_number}</td>
                      <td className="text-center py-1.5 px-3">{formatDate(item.order_date)}</td>
                      <td className="py-1.5 px-3">{item.work_period || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
