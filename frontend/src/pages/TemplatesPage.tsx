import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check, ChevronDown, ChevronRight, Copy, Eye, FileUp, Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  useAllOrderTypes,
  useDeleteOrderType,
  useDeleteTemplate,
  useTemplateVariables,
  useUploadTemplate,
} from "@/entities/order/useOrders"
import { ImportTemplatesModal } from "@/features/import-templates/ImportTemplatesModal"
import { OrderTypeForm } from "@/features/order-type-form"
import type { OrderType } from "@/entities/order/types"

export function TemplatesPage() {
  const navigate = useNavigate()
  const { data: orderTypes = [], isLoading, error } = useAllOrderTypes()
  const { data: variables = [] } = useTemplateVariables()
  const deleteMutation = useDeleteOrderType()
  const uploadMutation = useUploadTemplate()
  const deleteTemplateMutation = useDeleteTemplate()
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTemplateDialog, setDeleteTemplateDialog] = useState<{ open: boolean; orderTypeId: number | null }>({ open: false, orderTypeId: null })
  const [deleteTypeDialog, setDeleteTypeDialog] = useState<{ open: boolean; orderType: OrderType | null }>({ open: false, orderType: null })
  const [deleteTypeError, setDeleteTypeError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingOrderType, setEditingOrderType] = useState<OrderType | null>(null)
  const [variablesExpanded, setVariablesExpanded] = useState(() => {
    const saved = localStorage.getItem("templatesPage.variablesExpanded")
    return saved !== null ? JSON.parse(saved) : true
  })
  const [copiedVar, setCopiedVar] = useState<string | null>(null)

  const copyVariable = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name)
      setCopiedVar(name)
      setTimeout(() => setCopiedVar((current) => (current === name ? null : current)), 1200)
    } catch {
      // ignore
    }
  }

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

  const openPreview = (orderTypeId: number) => {
    window.open(`/templates/${orderTypeId}/view`, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} title="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Типы и шаблоны приказов</h1>
        <div className="flex items-center gap-3 ml-auto">
          <Button onClick={() => { setEditingOrderType(null); setFormOpen(true); }} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Создать тип
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            Импорт шаблонов
          </Button>
        </div>
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
                          <div key={item.name} className="flex items-center gap-1.5">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.name}</code>
                            <button
                              onClick={() => copyVariable(item.name)}
                              className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title="Копировать"
                            >
                              {copiedVar === item.name ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <span className="text-muted-foreground">— {item.description}</span>
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
                          <div key={item.name} className="flex items-center gap-1.5">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.name}</code>
                            <button
                              onClick={() => copyVariable(item.name)}
                              className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title="Копировать"
                            >
                              {copiedVar === item.name ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <span className="text-muted-foreground">— {item.description}</span>
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
        <div className="space-y-6">
          {(() => {
            const grouped: Record<string, OrderType[]> = {}
            const order = ["л", "к", ""]
            for (const ot of orderTypes) {
              const key = ot.letter || ""
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(ot)
            }
            const renderGroup = (letter: string, label: string) => {
              const items = grouped[letter]
              if (!items?.length) return null
              return (
                <div key={letter} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <h3 className="text-base font-semibold">
                      {label} <span className="text-muted-foreground font-normal">({items.length})</span>
                    </h3>
                  </div>
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
                      {items.map((orderType) => (
                        <TableRow
                          key={orderType.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => { setEditingOrderType(orderType); setFormOpen(true); }}
                        >
                          <TableCell>{orderType.name}</TableCell>
                          <TableCell className="font-mono text-sm">{orderType.code}</TableCell>
                          <TableCell className="font-mono text-sm">{orderType.letter ?? "—"}</TableCell>
                          <TableCell>{(() => {
                            const code = orderType.code
                            if (code === "vacation_unpaid") return "Отпуска за свой счёт"
                            if (code === "vacation_paid" || code === "vacation_recall" || code === "vacation_postpone" || code === "vacation_extension") return "Трудовые отпуска"
                            if (code === "weekend_call") return "Вызовы в выходной"
                            return orderType.show_in_orders_page ? "Общий журнал" : "Отпуска"
                          })()}</TableCell>
                          <TableCell>{orderType.display_name || orderType.template_filename || "—"}</TableCell>
                          <TableCell>{orderType.is_active ? "Активен" : "Архив"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end items-center gap-1">
                              {orderType.template_exists && (
                                <Button variant="ghost" size="icon" title="Превью" onClick={(e) => { e.stopPropagation(); openPreview(orderType.id); }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            }
            return order.map((letter) => {
              const label = letter === "" ? "Без литеры" : `Литера "${letter}"`
              return renderGroup(letter, label)
            }).filter(Boolean)
          })()}
        </div>
      )}

      <OrderTypeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        orderType={editingOrderType}
        templateExists={editingOrderType?.template_exists}
        onEditTemplate={(id) => {
          const ot = orderTypes.find((o) => o.id === id)
          if (!ot?.template_exists) return
          window.open(`/templates/${id}/edit`, "_blank", "noopener,noreferrer")
        }}
        onDownloadTemplate={(id) => {
          const ot = orderTypes.find((o) => o.id === id)
          if (!ot?.template_exists) return
          window.open(`${import.meta.env.VITE_API_URL || "/api"}/order-types/${id}/template`, "_blank")
        }}
        onUploadTemplate={(id, file) => uploadMutation.mutate({ orderTypeId: id, file })}
        onDeleteTemplate={(id) => setDeleteTemplateDialog({ open: true, orderTypeId: id })}
      />

      {/* Диалог подтверждения удаления шаблона */}
      <Dialog open={deleteTemplateDialog.open} onOpenChange={(open) => setDeleteTemplateDialog({ open, orderTypeId: open ? deleteTemplateDialog.orderTypeId : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить шаблон?</DialogTitle>
            <DialogDescription>
              Загруженный шаблон будет удалён. Тип приказа останется — можно будет загрузить новый шаблон.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTemplateDialog({ open: false, orderTypeId: null })}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTemplateDialog.orderTypeId !== null) {
                  deleteTemplateMutation.mutate(deleteTemplateDialog.orderTypeId)
                }
                setDeleteTemplateDialog({ open: false, orderTypeId: null })
              }}
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending ? "Удаление…" : "Удалить шаблон"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог подтверждения удаления типа приказа */}
      <Dialog
        open={deleteTypeDialog.open}
        onOpenChange={(open) => {
          setDeleteTypeDialog({ open, orderType: open ? deleteTypeDialog.orderType : null })
          if (!open) setDeleteTypeError(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить тип приказа?</DialogTitle>
            <DialogDescription>
              {deleteTypeDialog.orderType ? (
                <>
                  Тип приказа «<strong>{deleteTypeDialog.orderType.name}</strong>» будет удалён безвозвратно.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {deleteTypeError && (
            <Alert variant="destructive">
              <AlertDescription className="space-y-1">
                <p className="font-medium">Нельзя удалить тип приказа</p>
                <p className="text-xs">{deleteTypeError}</p>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTypeDialog({ open: false, orderType: null }); setDeleteTypeError(null) }}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTypeDialog.orderType) {
                  deleteMutation.mutate(deleteTypeDialog.orderType.id, {
                    onSuccess: () => setDeleteTypeDialog({ open: false, orderType: null }),
                    onError: (err: any) => {
                      const msg = err.response?.data?.detail || err.message || "Ошибка удаления"
                      setDeleteTypeError(msg)
                    },
                  })
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Удаление…" : "Удалить тип"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportTemplatesModal
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  )
}
