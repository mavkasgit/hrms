import { useState, useEffect } from "react"
import { ArrowLeft, FileUp, Plus, Upload, Eye } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
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
import { TemplateVariablesCatalog } from "@/features/template-variables-catalog/TemplateVariablesCatalog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { useQueryClient } from "@tanstack/react-query"
import {
  useStatementTypes,
  useDeleteStatementType,
  useUploadStatementTypeTemplate,
  useDeleteStatementTypeTemplate,
  useCreateStatementType,
  useUpdateStatementType,
} from "@/entities/statement/hooks"
import {
  useNotificationTypes,
  useDeleteNotificationType,
  useUploadNotificationTypeTemplate,
  useDeleteNotificationTypeTemplate,
  useCreateNotificationType,
  useUpdateNotificationType,
} from "@/entities/notification/hooks"

interface DocType {
  id: number
  code: string
  name: string
  is_active: boolean
  template_filename: string | null
  display_name: string | null
  field_schema: any[]
  filename_pattern: string | null
  template_exists: boolean
  file_size: number | null
  last_modified: string | null
  created_at: string | null
  updated_at: string | null
}

export function TemplatesPage() {
  const { data: orderTypes = [], isLoading, error } = useAllOrderTypes()
  const { data: variables = [] } = useTemplateVariables()
  const deleteMutation = useDeleteOrderType()
  const uploadMutation = useUploadTemplate()
  const deleteTemplateMutation = useDeleteTemplate()
  const queryClient = useQueryClient()
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTemplateDialog, setDeleteTemplateDialog] = useState<{ open: boolean; orderTypeId: number | null }>({ open: false, orderTypeId: null })
  const [deleteTypeDialog, setDeleteTypeDialog] = useState<{ open: boolean; orderType: OrderType | null }>({ open: false, orderType: null })
  const [deleteTypeError, setDeleteTypeError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingOrderType, setEditingOrderType] = useState<OrderType | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState("orders")

  // ─── Statement type management ───
  const { data: statementTypes = [], isLoading: stmtLoading } = useStatementTypes(false)
  const deleteStmtType = useDeleteStatementType()
  const uploadStmtTemplate = useUploadStatementTypeTemplate()
  const deleteStmtTemplate = useDeleteStatementTypeTemplate()
  const createStmtType = useCreateStatementType()
  const updateStmtType = useUpdateStatementType()
  const [stmtFormOpen, setStmtFormOpen] = useState(false)
  const [editingStmtType, setEditingStmtType] = useState<DocType | null>(null)
  const [deleteStmtDialog, setDeleteStmtDialog] = useState<{ open: boolean; type: DocType | null }>({ open: false, type: null })
  const [deleteStmtTemplateDialog, setDeleteStmtTemplateDialog] = useState<{ open: boolean; typeId: number | null }>({ open: false, typeId: null })

  // ─── Notification type management ───
  const { data: notificationTypes = [], isLoading: notifLoading } = useNotificationTypes(false)
  const deleteNotifType = useDeleteNotificationType()
  const uploadNotifTemplate = useUploadNotificationTypeTemplate()
  const deleteNotifTemplate = useDeleteNotificationTypeTemplate()
  const createNotifType = useCreateNotificationType()
  const updateNotifType = useUpdateNotificationType()
  const [notifFormOpen, setNotifFormOpen] = useState(false)
  const [editingNotifType, setEditingNotifType] = useState<DocType | null>(null)
  const [deleteNotifDialog, setDeleteNotifDialog] = useState<{ open: boolean; type: DocType | null }>({ open: false, type: null })
  const [deleteNotifTemplateDialog, setDeleteNotifTemplateDialog] = useState<{ open: boolean; typeId: number | null }>({ open: false, typeId: null })

  const openPreview = (orderTypeId: number) => {
    window.open(`/templates/${orderTypeId}/view`, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} title="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Шаблоны документов</h1>
        <div className="flex items-center gap-3 ml-auto">
          {activeTab === "orders" && (
            <>
              <Button onClick={() => { setEditingOrderType(null); setFormOpen(true); }} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Создать тип приказа
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" />
                Импорт шаблонов
              </Button>
            </>
          )}
          {activeTab === "statements" && (
            <Button onClick={() => { setEditingStmtType(null); setStmtFormOpen(true); }} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Создать тип заявления
            </Button>
          )}
          {activeTab === "notifications" && (
            <Button onClick={() => { setEditingNotifType(null); setNotifFormOpen(true); }} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Создать тип уведомления
            </Button>
          )}
        </div>
      </div>

      <TemplateVariablesCatalog variables={variables} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger className="shrink-0" value="orders">Приказы</TabsTrigger>
          <TabsTrigger className="shrink-0" value="notifications">Уведомления</TabsTrigger>
          <TabsTrigger className="shrink-0" value="statements">Заявления</TabsTrigger>
        </TabsList>

        {/* ─── Orders Tab ─── */}
        <TabsContent value="orders" className="space-y-6 mt-4">
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
        </TabsContent>

        {/* ─── Notifications Tab ─── */}
        <TabsContent value="notifications" className="space-y-6 mt-4">
          <DocTypeTable
            types={notificationTypes as DocType[]}
            isLoading={notifLoading}
            emptyMessage="Типы уведомлений не найдены"
            editType={(t) => { setEditingNotifType(t); setNotifFormOpen(true); }}
            deleteType={(t) => setDeleteNotifDialog({ open: true, type: t })}
            deleteTemplate={(id) => setDeleteNotifTemplateDialog({ open: true, typeId: id })}
            uploadTemplate={(id, file, onSuccess) => uploadNotifTemplate.mutate({ id, file }, { onSuccess })}
            openPreview={(id) => window.open(`/notification-templates/${id}/view`, "_blank", "noopener,noreferrer")}
            openEdit={(id) => window.open(`/notification-templates/${id}/edit`, "_blank", "noopener,noreferrer")}
          />
        </TabsContent>

        {/* ─── Statements Tab ─── */}
        <TabsContent value="statements" className="space-y-6 mt-4">
          <DocTypeTable
            types={statementTypes as DocType[]}
            isLoading={stmtLoading}
            emptyMessage="Типы заявлений не найдены"
            editType={(t) => { setEditingStmtType(t); setStmtFormOpen(true); }}
            deleteType={(t) => setDeleteStmtDialog({ open: true, type: t })}
            deleteTemplate={(id) => setDeleteStmtTemplateDialog({ open: true, typeId: id })}
            uploadTemplate={(id, file, onSuccess) => uploadStmtTemplate.mutate({ id, file }, { onSuccess })}
            openPreview={(id) => window.open(`/statement-templates/${id}/view`, "_blank", "noopener,noreferrer")}
            openEdit={(id) => window.open(`/statement-templates/${id}/edit`, "_blank", "noopener,noreferrer")}
          />
        </TabsContent>
      </Tabs>

      {/* Order Type Form */}
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
        onUploadTemplate={(id, file, onSuccess) => uploadMutation.mutate({ orderTypeId: id, file }, { onSuccess })}
        onDeleteTemplate={(id) => setDeleteTemplateDialog({ open: true, orderTypeId: id })}
      />

      {/* Statement Type Form Dialog */}
      <DocTypeFormDialog
        open={stmtFormOpen}
        onOpenChange={setStmtFormOpen}
        editingType={editingStmtType}
        createMutation={createStmtType}
        updateMutation={updateStmtType}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["statement-types"] })}
      />

      {/* Notification Type Form Dialog */}
      <DocTypeFormDialog
        open={notifFormOpen}
        onOpenChange={setNotifFormOpen}
        editingType={editingNotifType}
        createMutation={createNotifType}
        updateMutation={updateNotifType}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["notification-types"] })}
      />

      {/* Delete statement type dialog */}
      <Dialog open={deleteStmtDialog.open} onOpenChange={(open) => setDeleteStmtDialog({ open, type: open ? deleteStmtDialog.type : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить тип заявления?</DialogTitle>
            <DialogDescription>
              Тип заявления «<strong>{deleteStmtDialog.type?.name}</strong>» будет удалён безвозвратно.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStmtDialog({ open: false, type: null })}>Отмена</Button>
            <Button variant="destructive" onClick={() => { if (deleteStmtDialog.type) deleteStmtType.mutate(deleteStmtDialog.type.id, { onSuccess: () => setDeleteStmtDialog({ open: false, type: null }) }) }}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete statement template dialog */}
      <Dialog open={deleteStmtTemplateDialog.open} onOpenChange={(open) => setDeleteStmtTemplateDialog({ open, typeId: open ? deleteStmtTemplateDialog.typeId : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить шаблон?</DialogTitle>
            <DialogDescription>Загруженный шаблон будет удалён.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStmtTemplateDialog({ open: false, typeId: null })}>Отмена</Button>
            <Button variant="destructive" onClick={() => { if (deleteStmtTemplateDialog.typeId) deleteStmtTemplate.mutate(deleteStmtTemplateDialog.typeId, { onSuccess: () => setDeleteStmtTemplateDialog({ open: false, typeId: null }) }) }}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete notification type dialog */}
      <Dialog open={deleteNotifDialog.open} onOpenChange={(open) => setDeleteNotifDialog({ open, type: open ? deleteNotifDialog.type : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить тип уведомления?</DialogTitle>
            <DialogDescription>
              Тип уведомления «<strong>{deleteNotifDialog.type?.name}</strong>» будет удалён безвозвратно.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNotifDialog({ open: false, type: null })}>Отмена</Button>
            <Button variant="destructive" onClick={() => { if (deleteNotifDialog.type) deleteNotifType.mutate(deleteNotifDialog.type.id, { onSuccess: () => setDeleteNotifDialog({ open: false, type: null }) }) }}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete notification template dialog */}
      <Dialog open={deleteNotifTemplateDialog.open} onOpenChange={(open) => setDeleteNotifTemplateDialog({ open, typeId: open ? deleteNotifTemplateDialog.typeId : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить шаблон?</DialogTitle>
            <DialogDescription>Загруженный шаблон будет удалён.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNotifTemplateDialog({ open: false, typeId: null })}>Отмена</Button>
            <Button variant="destructive" onClick={() => { if (deleteNotifTemplateDialog.typeId) deleteNotifTemplate.mutate(deleteNotifTemplateDialog.typeId, { onSuccess: () => setDeleteNotifTemplateDialog({ open: false, typeId: null }) }) }}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order type delete dialogs */}
      <Dialog open={deleteTemplateDialog.open} onOpenChange={(open) => setDeleteTemplateDialog({ open, orderTypeId: open ? deleteTemplateDialog.orderTypeId : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить шаблон?</DialogTitle>
            <DialogDescription>
              Загруженный шаблон будет удалён. Тип приказа останется — можно будет загрузить новый шаблон.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTemplateDialog({ open: false, orderTypeId: null })}>Отмена</Button>
            <Button variant="destructive" onClick={() => { if (deleteTemplateDialog.orderTypeId !== null) { deleteTemplateMutation.mutate(deleteTemplateDialog.orderTypeId) } setDeleteTemplateDialog({ open: false, orderTypeId: null }) }} disabled={deleteTemplateMutation.isPending}>
              {deleteTemplateMutation.isPending ? "Удаление…" : "Удалить шаблон"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTypeDialog.open} onOpenChange={(open) => { setDeleteTypeDialog({ open, orderType: open ? deleteTypeDialog.orderType : null }); if (!open) setDeleteTypeError(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить тип приказа?</DialogTitle>
            <DialogDescription>
              {deleteTypeDialog.orderType ? (<>Тип приказа «<strong>{deleteTypeDialog.orderType.name}</strong>» будет удалён безвозвратно.</>) : null}
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
            <Button variant="outline" onClick={() => { setDeleteTypeDialog({ open: false, orderType: null }); setDeleteTypeError(null) }}>Отмена</Button>
            <Button variant="destructive" onClick={() => { if (deleteTypeDialog.orderType) { deleteMutation.mutate(deleteTypeDialog.orderType.id, { onSuccess: () => setDeleteTypeDialog({ open: false, orderType: null }), onError: (err: any) => { const msg = err.response?.data?.detail || err.message || "Ошибка удаления"; setDeleteTypeError(msg) } }) } }} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Удаление…" : "Удалить тип"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportTemplatesModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}

// ─── Generic Doc Type Table ───

interface DocTypeTableProps {
  types: DocType[]
  isLoading: boolean
  emptyMessage: string
  editType: (t: DocType) => void
  deleteType: (t: DocType) => void
  deleteTemplate: (id: number) => void
  uploadTemplate: (id: number, file: File, onSuccess: () => void) => void
  openPreview?: (id: number) => void
  openEdit?: (id: number) => void
}

function DocTypeTable({ types, isLoading, emptyMessage, editType, deleteType, deleteTemplate, uploadTemplate, openPreview, openEdit }: DocTypeTableProps) {

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  }

  if (!types.length) {
    return <EmptyState message={emptyMessage} description="Создайте первый тип." />
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Шаблон</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((t) => (
            <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => editType(t)}>
              <TableCell>{t.name}</TableCell>
              <TableCell className="font-mono text-sm">{t.code}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${t.template_exists ? "bg-green-500" : "bg-gray-300"}`} />
                  <span className="text-sm">{t.display_name || t.template_filename || "—"}</span>
                </div>
              </TableCell>
              <TableCell>{t.is_active ? "Активен" : "Архив"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {t.template_exists && openPreview && (
                    <Button variant="ghost" size="icon" title="Превью" onClick={() => openPreview(t.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {t.template_exists && openEdit && (
                    <Button variant="ghost" size="icon" title="Редактировать в OnlyOffice" onClick={() => openEdit(t.id)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </Button>
                  )}
                  <input
                    type="file"
                    accept=".docx"
                    className="hidden"
                    id={`upload-${t.id}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadTemplate(t.id, file, () => e.target.value = "")
                    }}
                  />
                  <label htmlFor={`upload-${t.id}`}>
                    <Button variant="ghost" size="icon" title="Загрузить шаблон" asChild>
                      <span><Upload className="h-4 w-4" /></span>
                    </Button>
                  </label>
                  {t.template_exists && (
                    <Button variant="ghost" size="icon" title="Скачать шаблон" onClick={() => window.open(`${import.meta.env.VITE_API_URL || "/api"}/${window.location.pathname.includes("notification") ? "notification-types" : "statement-types"}/${t.id}/template`, "_blank")}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    </Button>
                  )}
                  {t.template_exists && (
                    <Button variant="ghost" size="icon" title="Удалить шаблон" onClick={() => deleteTemplate(t.id)} className="text-red-500">
                      <FileUp className="h-4 w-4 rotate-180" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" title="Удалить тип" onClick={() => deleteType(t)} className="text-red-500">
                    <span className="sr-only">Удалить тип</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Generic Doc Type Form Dialog ───

interface DocTypeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingType: DocType | null
  createMutation: any
  updateMutation: any
  onSuccess: () => void
}

function DocTypeFormDialog({ open, onOpenChange, editingType, createMutation, updateMutation, onSuccess }: DocTypeFormDialogProps) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [fieldSchema, setFieldSchema] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (editingType) {
      setName(editingType.name)
      setCode(editingType.code)
      setFieldSchema(JSON.stringify(editingType.field_schema, null, 2))
    } else {
      setName("")
      setCode("")
      setFieldSchema("[]")
    }
    setErrors({})
  }, [editingType, open])

  // Reset when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && editingType) {
      setName(editingType.name)
      setCode(editingType.code)
      setFieldSchema(JSON.stringify(editingType.field_schema, null, 2))
    } else if (newOpen) {
      setName("")
      setCode("")
      setFieldSchema("[]")
    }
    setErrors({})
    onOpenChange(newOpen)
  }

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}
    if (!name) newErrors.name = "Укажите название"
    if (!code) newErrors.code = "Укажите code"
    let parsedSchema: any[] = []
    try {
      parsedSchema = JSON.parse(fieldSchema)
    } catch {
      newErrors.fieldSchema = "Невалидный JSON"
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const payload = { name, code, field_schema: parsedSchema, is_active: true }
    if (editingType) {
      updateMutation.mutate({ id: editingType.id, payload }, { onSuccess: () => { onSuccess(); onOpenChange(false) } })
    } else {
      createMutation.mutate(payload, { onSuccess: () => { onSuccess(); onOpenChange(false) } })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingType ? "Редактировать тип" : "Создать тип"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Название</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Code</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1" />
            {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Field Schema (JSON)</label>
            <textarea
              value={fieldSchema}
              onChange={(e) => setFieldSchema(e.target.value)}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono mt-1"
            />
            {errors.fieldSchema && <p className="text-xs text-red-500 mt-1">{errors.fieldSchema}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
            {editingType ? "Сохранить" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
