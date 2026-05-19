import { useState } from "react"
import { ArrowLeft, FileUp, Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Alert, AlertDescription } from "@/shared/ui/alert"
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
  useCreateOrderType,
  useUpdateOrderType,
} from "@/entities/order/useOrders"
import { ImportTemplatesModal } from "@/features/import-templates/ImportTemplatesModal"
import { TemplateTypeForm } from "@/features/template-type-form"
import { TemplateTypeTable } from "@/features/template-type-table"
import type { OrderType } from "@/entities/order/types"
import { TemplateVariablesCatalog } from "@/features/template-variables-catalog/TemplateVariablesCatalog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { useQueryClient } from "@tanstack/react-query"
import { downloadStatementTypeTemplate } from "@/entities/statement/api"
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
import { downloadNotificationTypeTemplate } from "@/entities/notification/api"

interface DocType {
  id: number
  code: string
  name: string
  is_active: boolean
  template_filename: string | null
  display_name: string | null
  field_schema: any[]
  filename_pattern: string | null
  letter?: string | null
  show_in_orders_page?: boolean
  template_exists: boolean
  file_size?: number | null
  last_modified?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export function TemplatesPage() {
  const API_BASE = import.meta.env.VITE_API_URL || "/api"
  const { data: orderTypes = [], isLoading, error } = useAllOrderTypes()
  const { data: variables = [] } = useTemplateVariables()
  const deleteMutation = useDeleteOrderType()
  const uploadMutation = useUploadTemplate()
  const deleteTemplateMutation = useDeleteTemplate()
  const createOrderType = useCreateOrderType()
  const updateOrderType = useUpdateOrderType()
  const queryClient = useQueryClient()
  const [importOpen, setImportOpen] = useState(false)
  const [importScope, setImportScope] = useState<"orders" | "notifications" | "statements">("orders")
  const [deleteTemplateDialog, setDeleteTemplateDialog] = useState<{ open: boolean; orderTypeId: number | null }>({ open: false, orderTypeId: null })
  const [deleteTypeDialog, setDeleteTypeDialog] = useState<{ open: boolean; orderType: OrderType | null }>({ open: false, orderType: null })
  const [deleteTypeError, setDeleteTypeError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingOrderType, setEditingOrderType] = useState<OrderType | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState("orders")

  // ─── Notification type management ───
  const { data: notificationTypes = [], isLoading: notifLoading } = useNotificationTypes(false)
  const createNotifType = useCreateNotificationType()
  const updateNotifType = useUpdateNotificationType()
  const deleteNotifType = useDeleteNotificationType()
  const uploadNotifTemplate = useUploadNotificationTypeTemplate()
  const deleteNotifTemplate = useDeleteNotificationTypeTemplate()
  const [notifFormOpen, setNotifFormOpen] = useState(false)
  const [editingNotifType, setEditingNotifType] = useState<DocType | null>(null)

  // ─── Statement type management ───
  const { data: statementTypes = [], isLoading: stmtLoading } = useStatementTypes(false)
  const createStmtType = useCreateStatementType()
  const updateStmtType = useUpdateStatementType()
  const deleteStmtType = useDeleteStatementType()
  const uploadStmtTemplate = useUploadStatementTypeTemplate()
  const deleteStmtTemplate = useDeleteStatementTypeTemplate()
  const [stmtFormOpen, setStmtFormOpen] = useState(false)
  const [editingStmtType, setEditingStmtType] = useState<DocType | null>(null)

  const openPreview = (orderTypeId: number) => {
    window.open(`/templates/order/${orderTypeId}/view`, "_blank", "noopener,noreferrer")
  }

  const openEdit = (orderTypeId: number) => {
    window.open(`/templates/order/${orderTypeId}/edit`, "_blank", "noopener,noreferrer")
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
              <Button variant="outline" size="sm" onClick={() => { setImportScope("orders"); setImportOpen(true); }}>
                <FileUp className="mr-2 h-4 w-4" />
                Импорт шаблонов
              </Button>
            </>
          )}
          {activeTab === "statements" && (
            <>
              <Button onClick={() => { setEditingStmtType(null); setStmtFormOpen(true); }} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Создать тип заявления
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setImportScope("statements"); setImportOpen(true); }}>
                <FileUp className="mr-2 h-4 w-4" />
                Импорт шаблонов
              </Button>
            </>
          )}
          {activeTab === "notifications" && (
            <>
              <Button onClick={() => { setEditingNotifType(null); setNotifFormOpen(true); }} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Создать тип уведомления
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setImportScope("notifications"); setImportOpen(true); }}>
                <FileUp className="mr-2 h-4 w-4" />
                Импорт шаблонов
              </Button>
            </>
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

          <TemplateTypeTable
            types={orderTypes as any}
            isLoading={isLoading}
            emptyMessage="Типы приказов не найдены"
            onEditRow={(t) => { setEditingOrderType(t as unknown as OrderType); setFormOpen(true); }}
            uploadTemplate={(id, file, onSuccess) => uploadMutation.mutate({ orderTypeId: id, file }, { onSuccess })}
            downloadTemplate={(id) => `${API_BASE}/order-types/${id}/template`}
            openPreview={openPreview}
            openEdit={openEdit}
            grouped
          />
        </TabsContent>

        {/* ─── Notifications Tab ─── */}
        <TabsContent value="notifications" className="space-y-6 mt-4">
          <TemplateTypeTable
            types={notificationTypes as any}
            isLoading={notifLoading}
            emptyMessage="Типы уведомлений не найдены"
            onEditRow={(t) => { setEditingNotifType(t as unknown as DocType); setNotifFormOpen(true); }}
            uploadTemplate={(id, file, onSuccess) => uploadNotifTemplate.mutate({ id, file }, { onSuccess })}
            downloadTemplate={(id) => `${API_BASE}/notification-types/${id}/template`}
            openPreview={(id) => window.open(`/templates/notification/${id}/view`, "_blank", "noopener,noreferrer")}
            openEdit={(id) => window.open(`/templates/notification/${id}/edit`, "_blank", "noopener,noreferrer")}
          />
        </TabsContent>

        {/* ─── Statements Tab ─── */}
        <TabsContent value="statements" className="space-y-6 mt-4">
          <TemplateTypeTable
            types={statementTypes as any}
            isLoading={stmtLoading}
            emptyMessage="Типы заявлений не найдены"
            onEditRow={(t) => { setEditingStmtType(t as unknown as DocType); setStmtFormOpen(true); }}
            uploadTemplate={(id, file, onSuccess) => uploadStmtTemplate.mutate({ id, file }, { onSuccess })}
            downloadTemplate={(id) => `${API_BASE}/statement-types/${id}/template`}
            openPreview={(id) => window.open(`/templates/statement/${id}/view`, "_blank", "noopener,noreferrer")}
            openEdit={(id) => window.open(`/templates/statement/${id}/edit`, "_blank", "noopener,noreferrer")}
          />
        </TabsContent>
      </Tabs>

      {/* Order Type Form */}
      <TemplateTypeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        scope="orders"
        editingType={editingOrderType as DocType | null}
        templateExists={editingOrderType?.template_exists}
        createMutation={createOrderType}
        updateMutation={updateOrderType}
        deleteMutation={deleteMutation}
        onEditTemplate={(id) => {
          const ot = orderTypes.find((o) => o.id === id)
          if (!ot?.template_exists) return
          window.open(`/templates/order/${id}/edit`, "_blank", "noopener,noreferrer")
        }}
        onDownloadTemplate={(id) => {
          const ot = orderTypes.find((o) => o.id === id)
          if (!ot?.template_exists) return
          window.open(`${API_BASE}/order-types/${id}/template`, "_blank")
        }}
        onUploadTemplate={(id, file, onSuccess) => uploadMutation.mutate({ orderTypeId: id, file }, { onSuccess })}
        onDeleteTemplate={(id) => setDeleteTemplateDialog({ open: true, orderTypeId: id })}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["order-types-all"] })
          queryClient.invalidateQueries({ queryKey: ["order-types"] })
        }}
      />

      {/* Statement Type Form */}
      <TemplateTypeForm
        open={stmtFormOpen}
        onOpenChange={setStmtFormOpen}
        scope="statements"
        editingType={editingStmtType}
        templateExists={editingStmtType?.template_exists}
        createMutation={createStmtType}
        updateMutation={updateStmtType}
        deleteMutation={deleteStmtType}
        onEditTemplate={(id) => window.open(`/statement-templates/${id}/edit`, "_blank", "noopener,noreferrer")}
        onDownloadTemplate={(id) => downloadStatementTypeTemplate(id)}
        onUploadTemplate={(id, file, onSuccess) => uploadStmtTemplate.mutate({ id, file }, { onSuccess })}
        onDeleteTemplate={(id) => deleteStmtTemplate.mutate(id)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["statement-types"] })}
      />

      {/* Notification Type Form */}
      <TemplateTypeForm
        open={notifFormOpen}
        onOpenChange={setNotifFormOpen}
        scope="notifications"
        editingType={editingNotifType}
        templateExists={editingNotifType?.template_exists}
        createMutation={createNotifType}
        updateMutation={updateNotifType}
        deleteMutation={deleteNotifType}
        onEditTemplate={(id) => window.open(`/notification-templates/${id}/edit`, "_blank", "noopener,noreferrer")}
        onDownloadTemplate={(id) => downloadNotificationTypeTemplate(id)}
        onUploadTemplate={(id, file, onSuccess) => uploadNotifTemplate.mutate({ id, file }, { onSuccess })}
        onDeleteTemplate={(id) => deleteNotifTemplate.mutate(id)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["notification-types"] })}
      />

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

      <ImportTemplatesModal open={importOpen} onOpenChange={setImportOpen} scope={importScope} />
    </div>
  )
}
