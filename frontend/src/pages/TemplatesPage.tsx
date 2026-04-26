import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown, ChevronRight, Download, Eye, Plus, Trash2, Upload } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  useAllOrderTypes,
  useCreateOrderType,
  useDeleteOrderType,
  useDeleteTemplate,
  useTemplateVariables,
  useUpdateOrderType,
  useUploadTemplate,
} from "@/entities/order/useOrders"
import type { OrderType, OrderTypeFieldSchema } from "@/entities/order/types"

const emptyField = (): OrderTypeFieldSchema => ({
  key: "",
  label: "",
  type: "text",
  required: false,
})

export function TemplatesPage() {
  const navigate = useNavigate()
  const { data: orderTypes = [], isLoading, error } = useAllOrderTypes()
  const { data: variables = [] } = useTemplateVariables()
  const createMutation = useCreateOrderType()
  const updateMutation = useUpdateOrderType()
  const deleteMutation = useDeleteOrderType()
  const uploadMutation = useUploadTemplate()
  const deleteTemplateMutation = useDeleteTemplate()

  const [newName, setNewName] = useState("")
  const [newLetter, setNewLetter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState("")
  const [draftPattern, setDraftPattern] = useState("")
  const [draftLetter, setDraftLetter] = useState<string | null>(null)
  const [draftFields, setDraftFields] = useState<OrderTypeFieldSchema[]>([])
  const [variablesExpanded, setVariablesExpanded] = useState(() => {
    const saved = localStorage.getItem("templatesPage.variablesExpanded")
    return saved !== null ? JSON.parse(saved) : true
  })

  const toggleVariables = () => {
    const newValue = !variablesExpanded
    setVariablesExpanded(newValue)
    localStorage.setItem("templatesPage.variablesExpanded", JSON.stringify(newValue))
  }

  const groupedVariables = useMemo(() => {
    const grouped: Record<string, typeof variables> = {}
    for (const variable of variables) {
      if (!grouped[variable.category]) grouped[variable.category] = []
      grouped[variable.category].push(variable)
    }
    return grouped
  }, [variables])

  const startEdit = (orderType: OrderType) => {
    setEditingId(orderType.id)
    setDraftName(orderType.name)
    setDraftPattern(orderType.filename_pattern || "")
    setDraftLetter(orderType.letter || null)
    setDraftFields(orderType.field_schema.length ? orderType.field_schema : [emptyField()])
  }

  const saveEdit = () => {
    if (!editingId) return
    updateMutation.mutate({
      orderTypeId: editingId,
      payload: {
        name: draftName,
        filename_pattern: draftPattern || null,
        letter: draftLetter,
        field_schema: draftFields.filter((field) => field.key.trim() && field.label.trim()),
      },
    })
    setEditingId(null)
  }

  const openPreview = (orderTypeId: number) => {
    const url = `${import.meta.env.VITE_API_URL || "/api"}/order-types/${orderTypeId}/template/preview`
    window.open(url, "_blank")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/orders")} title="Назад к приказам">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Типы и шаблоны приказов</h1>
      </div>

      <div className="border rounded-lg bg-card">
        <button
          onClick={toggleVariables}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/50 transition-colors"
        >
          {variablesExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold">Доступные переменные для шаблонов</h2>
        </button>
        {variablesExpanded && (
          <div className="border-t px-4 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Используйте эти переменные в фигурных скобках в ваших .docx шаблонах. Они будут автоматически заменены на данные сотрудника при создании приказа.
            </p>
            <div className="bg-muted/50 border rounded-md p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Пример названия файла:</p>
              <code className="text-xs">
                Приказ_№{"{order_number}"}_к_{"{order_date}"}_{"{order_type_lower}"}_{"{short_name}"}.docx
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Результат: <span className="font-mono">Приказ_№05_к_15_03_прием_Иванов_И.О..docx</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                {["Приказ", "ФИО"].map((category) => {
                  const items = groupedVariables[category]
                  if (!items?.length) return null
                  return (
                    <div key={category}>
                      <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{category}</h4>
                      <div className="space-y-2 text-sm">
                        {items.map((item) => (
                          <div key={item.name}>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.name}</code>
                            <span className="ml-2 text-muted-foreground">— {item.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="space-y-4">
                {["Работа", "Даты", "Прочее", "Поля типа"].map((category) => {
                  const items = groupedVariables[category]
                  if (!items?.length) return null
                  return (
                    <div key={category}>
                      <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{category}</h4>
                      <div className="space-y-2 text-sm">
                        {items.map((item) => (
                          <div key={item.name}>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.name}</code>
                            <span className="ml-2 text-muted-foreground">— {item.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message || "Не удалось загрузить типы приказов"}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : !orderTypes.length ? (
        <EmptyState message="Типы приказов не найдены" description="Создайте первый тип приказа." />
      ) : (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Литера</TableHead>
                <TableHead>Где показывается</TableHead>
                <TableHead>Шаблон</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderTypes.map((orderType) => (
                <TableRow key={orderType.id}>
                  <TableCell>{orderType.name}</TableCell>
                  <TableCell className="font-mono text-sm">{orderType.code}</TableCell>
                  <TableCell className="font-mono text-sm">{orderType.letter ?? "—"}</TableCell>
                  <TableCell>{orderType.show_in_orders_page ? "Общий журнал" : "Только в отпусках"}</TableCell>
                  <TableCell>{orderType.template_filename || "—"}</TableCell>
                  <TableCell>{orderType.is_active ? "Активен" : "Архив"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {orderType.template_exists && (
                        <>
                          <Button variant="ghost" size="icon" title="Превью" onClick={() => openPreview(orderType.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Скачать шаблон"
                            onClick={() => window.open(`${import.meta.env.VITE_API_URL || "/api"}/order-types/${orderType.id}/template`, "_blank")}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Загрузить шаблон"
                        onClick={() => {
                          const input = document.createElement("input")
                          input.type = "file"
                          input.accept = ".docx"
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0]
                            if (file) uploadMutation.mutate({ orderTypeId: orderType.id, file })
                          }
                          input.click()
                        }}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      {orderType.template_exists && (
                        <Button variant="ghost" size="icon" title="Удалить шаблон" onClick={() => deleteTemplateMutation.mutate(orderType.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateMutation.mutate({
                            orderTypeId: orderType.id,
                            payload: { show_in_orders_page: !orderType.show_in_orders_page },
                          })
                        }
                      >
                        {orderType.show_in_orders_page ? "Скрыть" : "Показать"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => startEdit(orderType)}>
                        Изменить
                      </Button>
                      <Button variant="ghost" size="icon" title="Удалить тип" onClick={() => deleteMutation.mutate(orderType.id)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {editingId !== null && (
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <h2 className="text-lg font-semibold">Редактирование типа</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Название" />
                <select
                  value={draftLetter || ""}
                  onChange={(e) => setDraftLetter(e.target.value || null)}
                  className="h-10 px-3 border rounded-md text-sm bg-background"
                >
                  <option value="">—</option>
                  <option value="л">л</option>
                  <option value="к">к</option>
                </select>
                <Input
                  value={draftPattern}
                  onChange={(e) => setDraftPattern(e.target.value)}
                  placeholder="Паттерн имени файла, например Приказ_{order_number}_{last_name}.docx"
                />
              </div>

              <div className="space-y-3">
                <h3 className="font-medium">Дополнительные поля</h3>
                {draftFields.map((field, index) => (
                  <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_120px_100px_40px]">
                    <Input
                      value={field.key}
                      onChange={(e) =>
                        setDraftFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, key: e.target.value } : item)))
                      }
                      placeholder="key"
                    />
                    <Input
                      value={field.label}
                      onChange={(e) =>
                        setDraftFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, label: e.target.value } : item)))
                      }
                      placeholder="label"
                    />
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={field.type}
                      onChange={(e) =>
                        setDraftFields((prev) =>
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
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          setDraftFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, required: e.target.checked } : item)))
                        }
                      />
                      required
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDraftFields((prev) => prev.filter((_, idx) => idx !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" onClick={() => setDraftFields((prev) => [...prev, emptyField()])}>
                  Добавить поле
                </Button>
              </div>

              <div className="flex gap-2">
                <Button onClick={saveEdit} disabled={updateMutation.isPending}>
                  Сохранить
                </Button>
                <Button variant="outline" onClick={() => setEditingId(null)}>
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название"
            className="max-w-[200px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim() && newLetter) {
                createMutation.mutate({ code: newName.trim().toLowerCase().replace(/\s+/g, "_"), name: newName, field_schema: [], letter: newLetter })
                setNewName("")
                setNewLetter(null)
              }
            }}
          />
          <Select
            value={newLetter || ""}
            onValueChange={(v) => setNewLetter(v || null)}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Литера" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="л">л</SelectItem>
              <SelectItem value="к">к</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              if (!newLetter) return
              createMutation.mutate({ code: newName.trim().toLowerCase().replace(/\s+/g, "_"), name: newName, field_schema: [], letter: newLetter })
              setNewName("")
              setNewLetter(null)
            }}
            disabled={!newName.trim() || !newLetter || createMutation.isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Создать тип
          </Button>
        </div>
      </div>
    </div>
  )
}
