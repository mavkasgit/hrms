import { useState, useEffect } from "react"
import { Trash2, Wand2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Checkbox } from "@/shared/ui/checkbox"
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
import { TemplateActionsBar } from "@/features/template-actions-bar"
import { FieldGridEditor, type FieldSchemaItem } from "./FieldGridEditor"
import type { TemplateVariable } from "@/entities/order/types"
import axios from "@/shared/api/axios"

interface DocType {
  id: number
  code: string
  name: string
  is_active: boolean
  template_filename: string | null
  display_name: string | null
  field_schema: FieldSchemaItem[]
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
  const [fields, setFields] = useState<FieldSchemaItem[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [standardCodes, setStandardCodes] = useState<string[]>([])
  const [templateVariables, setTemplateVariables] = useState<TemplateVariable[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const isOrder = scope === "orders"
  const isNotification = scope === "notifications"
  const isStatement = scope === "statements"
  const isEdit = editingType !== null
  const isStandard = isEdit && standardCodes.includes(editingType.code)

  useEffect(() => {
    const endpoint = isOrder ? "order-types" : isNotification ? "notification-types" : "statement-types"
    axios.get(`/${endpoint}/standard-codes`).then((res) => {
      setStandardCodes(res.data.codes || [])
    }).catch(() => {})

    // Load template variables for autocomplete
    axios.get(`/${endpoint}/variables`).then((res) => {
      setTemplateVariables(res.data.variables || [])
    }).catch(() => {})
  }, [isOrder, isNotification, isStatement])

  useEffect(() => {
    if (editingType) {
      setName(editingType.name)
      setCode(editingType.code)
      setLetter(editingType.letter || null)
      setPattern(editingType.filename_pattern || "")
      setShowInOrders(editingType.show_in_orders_page ?? true)
      setFields(editingType.field_schema.length ? editingType.field_schema : [])
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

  const cleanFields = fields
    .filter((f) => f.key.trim() && f.label.trim())
    .map(f => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      enabled: f.enabled ?? true,
      quickOptions: f.quickOptions,
    }))

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

  const handleAnalyzeTemplate = async () => {
    if (!editingType?.id) return
    setIsAnalyzing(true)
    try {
      const endpoint = isOrder ? "order-types" : isNotification ? "notification-types" : "statement-types"
      const res = await axios.post(`/${endpoint}/${editingType.id}/template/analyze`)
      if (res.data.field_schema && res.data.field_schema.length > 0) {
        setFields(res.data.field_schema)
        setUploadSuccess(true)
        setTimeout(() => setUploadSuccess(false), 3000)
      }
    } catch (err: any) {
      console.error("Failed to analyze template:", err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation?.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Дополнительные поля</h3>
                {isEdit && editingType.template_exists && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyzeTemplate}
                    disabled={isStandard || isAnalyzing}
                    className="h-7 text-xs"
                  >
                    <Wand2 className="mr-1 h-3 w-3" />
                    {isAnalyzing ? "Анализ..." : "Авто-заполнить из шаблона"}
                  </Button>
                )}
              </div>
              <FieldGridEditor
                fields={fields as FieldSchemaItem[]}
                onChange={(newFields) => setFields(newFields)}
                templateVariables={templateVariables.map((v) => ({
                  key: v.key,
                  name: v.name,
                  description: v.description,
                  displayName: v.displayName,
                  category: v.category,
                }))}
                readOnly={isStandard}
              />
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
