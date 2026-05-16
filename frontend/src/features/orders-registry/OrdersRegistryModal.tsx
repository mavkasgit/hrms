import { useState, useRef } from "react"
import { X, Printer, Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import api from "@/shared/api/axios"

interface RegistryEntry {
  order_id: number
  employee_name: string
  order_type_name: string
  order_number: string
  order_date: string
}

interface OrdersRegistryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
}

export function OrdersRegistryModal({ open, onOpenChange, year }: OrdersRegistryModalProps) {
  const [items, setItems] = useState<RegistryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const fetchRegistry = async () => {
    setLoading(true)
    try {
      const { data } = await api.get("/orders/registry", {
        params: { letter: "л", year },
      })
      setItems(data.items)
      setLoaded(true)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && !loaded) {
      fetchRegistry()
    }
    if (!newOpen) {
      setLoaded(false)
      setItems([])
    }
    onOpenChange(newOpen)
  }

  const handlePrint = () => {
    if (!printRef.current) return
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Реестр приказов ${year}</title>
        <style>
          body { font-family: "Times New Roman", serif; margin: 20px; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
          .subtitle { text-align: center; font-size: 14px; margin-bottom: 16px; color: #555; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
          th { background: #f0f0f0; font-weight: bold; }
          .num { text-align: center; }
          @media print { body { margin: 10mm; } }
        </style>
      </head>
      <body>
        <h1>Реестр приказов</h1>
        <div class="subtitle">Литера: л | Год: ${year}</div>
        <table>
          <thead>
            <tr>
              <th class="num">№</th>
              <th>ФИО сотрудника</th>
              <th>Тип приказа</th>
              <th>Номер приказа</th>
              <th class="num">Дата приказа</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => `
              <tr>
                <td class="num">${i + 1}</td>
                <td>${item.employee_name}</td>
                <td>${item.order_type_name}</td>
                <td>${item.order_number}</td>
                <td class="num">${formatDate(item.order_date)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div style="margin-top: 16px; font-size: 12px; color: #555;">
          Всего записей: ${items.length}
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Реестр приказов (литера л) — {year}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">
            {loaded ? `Всего: ${items.length}` : ""}
          </span>
          <div className="flex gap-2">
            {loaded && items.length > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-1.5 h-4 w-4" />
                Печать
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
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
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      Нет приказов с литерой л за {year} год
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
