import { useState, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
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
import { TemplateActionsBar } from "@/features/template-actions-bar"

interface FieldSchema {
  key: string
  label: string
  type: "text" | "date" | "number" | "textarea"
  required: boolean
}

interface DocType {
  id: number
  code: string
  name: string
  is_active: boolean
  template_filename: string | null
  display_name: string | null
  field_schema: FieldSchema[]
  filename_pattern: string | null
  letter?: string | null
  show_in_orders_page?: boolean
  template_exists: boolean
}

interface TemplateTypeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: "orders" | "notifications" | "statements"
  editingType: DocType | null
  templateExists?: boolean
  createMutation: { mutate: (data: any, options?: any) => void; isPending: boolean }
  updateMutation: { mutate: (data: any, options?: any) => void; isPending: boolean }
  deleteMutation?: { mutate: (id: number, options?: any) => void; isPending: boolean }
  onEditTemplate?: (id: number) => void
  onDownloadTemplate?: (id: number) => void
  onUploadTemplate?: (id: number, file: File, onSuccess?: () => void) => void
  onDeleteTemplate?: (id: number) => void
  onSuccess?: () => void
}

const emptyField = (): FieldSchema => ({
  key: "",
  label: "",
  type: "text",
  required: false,
})

const STANDARD_ORDER_CODES = ["hire", "dismissal", "transfer", "contract_extension", "vacation_paid", "vacation_unpaid", "vacation_recall", "vacation_postpone", "vacation_extension", "weekend_call", "substitution", "vacation_unpaid_group", "weekend_call_group"]

const STANDARD_NOTIFICATION_CODES = ["standard", "contract_extension"]

const STANDARD_STATEMENT_CODES = ["personal", "transfer", "dismissal", "vacation", "other"]

export function TemplateTypeForm({
  open,
  onOpenChange,
  scope,
  editingType,
  templateExists,
  createMutation,
  updateMutation,
  deleteMutation,
  onEditTemplate,
  onDownloadTemplate,
  onUploadTemplate,
  onDeleteTemplate,
  onSuccess,
}: TemplateTypeFormProps) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [letter, setLetter] = useState<string | null>(null)
  const [pattern, setPattern] = useState("")
  const [showInOrders, setShowInOrders] = useState(true)
  const [fields, setFields] = useState<FieldSchema[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  const isOrder = scope === "orders"
  const isNotification = scope === "notifications"
  const isStatement = scope === "statements"
  const isEdit = editingType !== null
  const isStandard = isEdit && (
    (isOrder && STANDARD_ORDER_CODES.includes(editingType.code)) ||
    (isNotification && STANDARD_NOTIFICATION_CODES.includes(editingType.code)) ||
    (isStatement && STANDARD_STATEMENT_CODES.includes(editingType.code))
  )

  useEffect(() => {
    if (editingType) {
      setName(editingType.name)
      setCode(editingType.code)
      setLetter(editingType.letter || null)
      setPattern(editingType.filename_pattern || "")
      setShowInOrders(editingType.show_in_orders_page ?? true)
      setFields(editingType.field_schema.length ? editingType.field_schema : [emptyField()])
    } else {
      setName("")
      setCode("")
      setLetter(null)
      setPattern("")
      setShowInOrders(true)
      setFields([])
    }
    setDeleteError(null)
    setUploadSuccess(false)
  }, [editingType, open])

  const cleanFields = fields.filter((f) => f.key.trim() && f.label.trim())

  const handleSave = () => {
    if (!name.trim()) return

    // For standard types, nothing is editable on the backend side — just close
    if (isEdit && isStandard) {
      onOpenChange(false)
      return
    }

    if (isEdit) {
      if (!editingType?.id) return

      const payload: Record<string, unknown> = {
        name,
        field_schema: cleanFields,
      }
      if (isOrder) {
        payload.letter = letter
        payload.filename_pattern = pattern || null
        payload.show_in_orders_page = showInOrders
      } else {
        payload.filename_pattern = pattern || null
      }

      updateMutation.mutate(
        { id: editingType.id, payload },
        { onSuccess: () => { onSuccess?.(); onOpenChange(false) } }
      )
    } else {
      const payload: Record<string, unknown> = {
        name,
        field_schema: cleanFields,
        code: code || name.trim().toLowerCase().replace(/\s+/g, "_"),
        is_active: true,
      }
      if (isOrder) {
        payload.letter = letter
        payload.filename_pattern = pattern || null
        payload.show_in_orders_page = showInOrders
      } else {
        payload.filename_pattern = pattern || null
      }

      createMutation.mutate(payload, { onSuccess: () => { onSuccess?.(); onOpenChange(false) } })
    }
  }

  const handleDelete = () => {
    if (!editingType || !deleteMutation) return
    deleteMutation.mutate(editingType.id, {
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

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation?.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Редактирование типа" : "Создать тип"}
              {isOrder ? " приказа" : scope === "notifications" ? " уведомления" : " заявления"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4" title={isStandard ? "Стандартный тип — поля заблокированы" : undefined}>
            {isStandard && (
              <div className="text-xs text-muted-foreground bg-muted/50 border rounded px-3 py-2">
                Стандартный тип — все поля заблокированы. Можно только загрузить/заменить шаблон.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" disabled={isStandard} />
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" disabled={isEdit} />
              {isOrder && (
                <Select value={letter || "-none"} onValueChange={(v) => setLetter(v === "-none" ? null : v)} disabled={isStandard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Литера" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-none">—</SelectItem>
                    <SelectItem value="л">л</SelectItem>
                    <SelectItem value="к">к</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Паттерн имени файла, например Приказ_{order_number}_{last_name}.docx"
              disabled={isStandard}
            />

            {isOrder && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showInOrders} onCheckedChange={(v) => setShowInOrders(!!v)} disabled={isStandard} />
                Показывать в общем журнале приказов
              </label>
            )}

            <div className="space-y-3">
              <h3 className="font-medium text-sm">Дополнительные поля</h3>
              {fields.map((field, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_120px_100px_40px] items-start">
                  <Input
                    value={field.key}
                    onChange={(e) => setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, key: e.target.value } : item)))}
                    placeholder="key"
                    className="h-9"
                    disabled={isStandard}
                  />
                  <Input
                    value={field.label}
                    onChange={(e) => setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, label: e.target.value } : item)))}
                    placeholder="label"
                    className="h-9"
                    disabled={isStandard}
                  />
                  <Select value={field.type} onValueChange={(v) =>
                    setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, type: v as FieldSchema["type"] } : item)))
                  } disabled={isStandard}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="date">date</SelectItem>
                      <SelectItem value="number">number</SelectItem>
                      <SelectItem value="textarea">textarea</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm h-9">
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(v) => setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, required: !!v } : item)))}
                      disabled={isStandard}
                    />
                    required
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== index))}
                    disabled={isStandard}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setFields((prev) => [...prev, emptyField()])} disabled={isStandard}>
                <Plus className="mr-1 h-3 w-3" />
                Добавить поле
              </Button>
            </div>
          </div>

          {/* Template actions row */}
          {isEdit && (
            <div className="border-t pt-3">
              <TemplateActionsBar
                variant="form"
                templateExists={!!templateExists}
                onEdit={onEditTemplate ? () => onEditTemplate(editingType.id) : undefined}
                onUpload={onUploadTemplate ? () => {
                  const input = document.createElement("input")
                  input.type = "file"
                  input.accept = ".docx"
                  input.onchange = (ev) => {
                    const file = (ev.target as HTMLInputElement).files?.[0]
                    if (file) onUploadTemplate(editingType.id, file, () => setUploadSuccess(true))
                  }
                  input.click()
                } : undefined}
                uploadLabel={isEdit && templateExists ? "Заменить" : "Загрузить"}
                onDownload={onDownloadTemplate && templateExists ? () => onDownloadTemplate(editingType.id) : undefined}
                onDeleteTemplate={onDeleteTemplate && templateExists ? () => onDeleteTemplate(editingType.id) : undefined}
                uploadSuccess={uploadSuccess}
              />
            </div>
          )}

          {/* Type actions row */}
          <div className="border-t pt-3 flex flex-wrap justify-end gap-2">
            {isEdit && deleteMutation && (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isPending || isStandard}
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
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить тип{isOrder ? " приказа" : scope === "notifications" ? " уведомления" : " заявления"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Тип «<strong>{editingType?.name}</strong>» будет удалён безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={deleteMutation?.isPending}>
              {deleteMutation?.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
