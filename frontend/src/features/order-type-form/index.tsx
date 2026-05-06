import { useState, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import {
  useCreateOrderType,
  useUpdateOrderType,
  useDeleteOrderType,
} from "@/entities/order/useOrders"
import type { OrderType, OrderTypeFieldSchema, OrderTypeCreate } from "@/entities/order/types"

interface OrderTypeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderType: OrderType | null
}

const emptyField = (): OrderTypeFieldSchema => ({
  key: "",
  label: "",
  type: "text",
  required: false,
})

const STANDARD_CODES = ["hire", "dismissal", "transfer", "contract_extension", "vacation_paid", "vacation_unpaid", "weekend_call"]

export function OrderTypeForm({ open, onOpenChange, orderType }: OrderTypeFormProps) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [letter, setLetter] = useState<string | null>(null)
  const [pattern, setPattern] = useState("")
  const [showInOrders, setShowInOrders] = useState(true)
  const [fields, setFields] = useState<OrderTypeFieldSchema[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const createMutation = useCreateOrderType()
  const updateMutation = useUpdateOrderType()
  const deleteMutation = useDeleteOrderType()

  const isEdit = orderType !== null

  useEffect(() => {
    if (orderType) {
      setName(orderType.name)
      setCode(orderType.code)
      setLetter(orderType.letter || null)
      setPattern(orderType.filename_pattern || "")
      setShowInOrders(orderType.show_in_orders_page)
      setFields(orderType.field_schema.length ? orderType.field_schema : [emptyField()])
    } else {
      setName("")
      setCode("")
      setLetter(null)
      setPattern("")
      setShowInOrders(true)
      setFields([])
    }
    setDeleteError(null)
  }, [orderType, open])

  const handleSave = () => {
    if (!name.trim()) return

    if (isEdit) {
      updateMutation.mutate({
        orderTypeId: orderType!.id,
        payload: {
          name,
          letter,
          filename_pattern: pattern || null,
          show_in_orders_page: showInOrders,
          field_schema: fields.filter((f) => f.key.trim() && f.label.trim()),
        },
      }, {
        onSuccess: () => onOpenChange(false),
      })
    } else {
      const payload: OrderTypeCreate = {
        code: code || name.trim().toLowerCase().replace(/\s+/g, "_"),
        name,
        letter,
        filename_pattern: pattern || null,
        show_in_orders_page: showInOrders,
        field_schema: fields.filter((f) => f.key.trim() && f.label.trim()),
      }
      createMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
      })
    }
  }

  const handleDelete = () => {
    if (!orderType) return
    deleteMutation.mutate(orderType.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false)
        onOpenChange(false)
      },
      onError: (err: any) => {
        const msg = err.response?.data?.detail || err.message || "Ошибка удаления"
        setDeleteError(msg)
      },
    })
  }

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Редактирование типа приказа" : "Создать тип приказа"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" />
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Code"
                disabled={isEdit}
              />
              <select
                value={letter || ""}
                onChange={(e) => setLetter(e.target.value || null)}
                className="h-10 px-3 border rounded-md text-sm bg-background"
              >
                <option value="">—</option>
                <option value="л">л</option>
                <option value="к">к</option>
              </select>
            </div>

            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Паттерн имени файла, например Приказ_{order_number}_{last_name}.docx"
            />

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showInOrders} onCheckedChange={(v) => setShowInOrders(!!v)} />
              Показывать в общем журнале приказов
            </label>

            <div className="space-y-3">
              <h3 className="font-medium text-sm">Дополнительные поля</h3>
              {fields.map((field, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_120px_100px_40px] items-start">
                  <Input
                    value={field.key}
                    onChange={(e) =>
                      setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, key: e.target.value } : item)))
                    }
                    placeholder="key"
                    className="h-9"
                  />
                  <Input
                    value={field.label}
                    onChange={(e) =>
                      setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, label: e.target.value } : item)))
                    }
                    placeholder="label"
                    className="h-9"
                  />
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={field.type}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((item, idx) =>
                          idx === index ? { ...item, type: e.target.value as OrderTypeFieldSchema["type"] } : item,
                        ),
                      )
                    }
                  >
                    <option value="text">text</option>
                    <option value="date">date</option>
                    <option value="number">number</option>
                    <option value="textarea">textarea</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm h-9">
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(v) =>
                        setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, required: !!v } : item)))
                      }
                    />
                    required
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setFields((prev) => [...prev, emptyField()])}>
                <Plus className="mr-1 h-3 w-3" />
                Добавить поле
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {isEdit && !STANDARD_CODES.includes(orderType!.code) && (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Удалить тип
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={isPending || !name.trim()}>
              {isPending ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тип приказа?</AlertDialogTitle>
            <AlertDialogDescription>
              Тип «<strong>{orderType?.name}</strong>» будет удалён безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
