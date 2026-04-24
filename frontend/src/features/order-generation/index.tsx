import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { useCreateOrder, useCreateOrderPreview, useOrderTypes, useRecentOrders } from "@/entities/order/useOrders"
import { computeNextOrderNumber } from "@/entities/order/computeNextOrderNumber"
import type { Employee } from "@/entities/employee/types"
import type { OrderCreate } from "@/entities/order/types"
import { OrderPreviewDialog } from "@/features/order-preview/OrderPreviewDialog"

interface OrderGenerationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null
}

export function OrderGeneration({ open, onOpenChange, employee }: OrderGenerationProps) {
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<number | null>(null)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [extraFields, setExtraFields] = useState<Record<string, string>>({})

  const { data: orderTypes = [] } = useOrderTypes(true)
  const { data: recentOrders } = useRecentOrders(1000, new Date().getFullYear())
  const createMutation = useCreateOrder()
  const previewMutation = useCreateOrderPreview()
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState("")
  const [pendingPayload, setPendingPayload] = useState<OrderCreate | null>(null)

  const selectedOrderType = useMemo(
    () => orderTypes.find((item) => item.id === selectedOrderTypeId) ?? null,
    [orderTypes, selectedOrderTypeId],
  )

  const computedNextNumber = computeNextOrderNumber(recentOrders || [])

  useEffect(() => {
    if (computedNextNumber && !orderNumber) setOrderNumber(computedNextNumber)
  }, [computedNextNumber, orderNumber])

  useEffect(() => {
    if (!open) {
      setSelectedOrderTypeId(null)
      setOrderDate(new Date().toISOString().split("T")[0])
      setOrderNumber("")
      setNotes("")
      setExtraFields({})
    }
  }, [open])

  const handleSubmit = () => {
    if (!employee || !selectedOrderTypeId) return
    const payload: OrderCreate = {
      employee_id: employee.id,
      order_type_id: selectedOrderTypeId,
      order_date: orderDate,
      order_number: orderNumber || undefined,
      notes: notes || undefined,
      extra_fields: extraFields,
    }
    setPendingPayload(payload)
    previewMutation.mutate(payload, {
      onSuccess: (preview) => {
        setPreviewId(preview.preview_id)
        setPreviewHtml(preview.html)
        setPreviewDialogOpen(true)
      },
    })
  }

  const handlePreviewConfirm = (editedHtml: string) => {
    if (!pendingPayload || !previewId) return
    createMutation.mutate(
      {
        ...pendingPayload,
        preview_id: previewId,
        edited_html: editedHtml,
      },
      {
        onSuccess: () => {
          setPreviewDialogOpen(false)
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Создать приказ</DialogTitle>
          <DialogDescription>Генерация приказа по выбранному типу.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Сотрудник</label>
            <Input value={employee?.name || ""} disabled />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Тип приказа</label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedOrderTypeId ?? ""}
              onChange={(e) => setSelectedOrderTypeId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Выберите тип</option>
              {orderTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DatePicker label="Дата приказа" value={orderDate} onChange={setOrderDate} />
            <div className="space-y-2">
              <label className="text-sm font-medium">Номер приказа</label>
              <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            </div>
          </div>

          {selectedOrderType?.field_schema.map((field) => (
            <div key={field.key} className="space-y-2">
              <label className="text-sm font-medium">{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={extraFields[field.key] || ""}
                  onChange={(e) => setExtraFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              ) : (
                <Input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={extraFields[field.key] || ""}
                  onChange={(e) => setExtraFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          <div className="space-y-2">
            <label className="text-sm font-medium">Комментарий</label>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={previewMutation.isPending}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!employee || !selectedOrderTypeId || createMutation.isPending || previewMutation.isPending}>
            {previewMutation.isPending ? "Формирование..." : createMutation.isPending ? "Создание..." : "Создать"}
          </Button>
        </DialogFooter>

        <OrderPreviewDialog
          open={previewDialogOpen}
          html={previewHtml}
          isSubmitting={createMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewDialogOpen(false)
              setPreviewId(null)
              setPreviewHtml("")
              setPendingPayload(null)
            } else {
              setPreviewDialogOpen(true)
            }
          }}
          onConfirm={handlePreviewConfirm}
        />
      </DialogContent>
    </Dialog>
  )
}
