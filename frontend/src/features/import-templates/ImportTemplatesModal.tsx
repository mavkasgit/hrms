import { useState, useRef } from "react"
import { Check, Download, Upload, X, Eye, Pencil } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { useAllOrderTypes, useUploadTemplate, useDeleteTemplate } from "@/entities/order/useOrders"
import type { OrderType } from "@/entities/order/types"
import { useNotificationTypes, useUploadNotificationTypeTemplate, useDeleteNotificationTypeTemplate } from "@/entities/notification/hooks"
import type { NotificationType } from "@/entities/notification/types"
import { useStatementTypes, useUploadStatementTypeTemplate, useDeleteStatementTypeTemplate } from "@/entities/statement/hooks"
import type { StatementType } from "@/entities/statement/types"

interface ImportTemplatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TemplateKind = "order" | "notification" | "statement"

interface UploadStatus {
  key: string
  kind: TemplateKind
  status: "uploading" | "success" | "error"
}

export function ImportTemplatesModal({ open, onOpenChange }: ImportTemplatesModalProps) {
  const { data: orderTypes = [] } = useAllOrderTypes()
  const { data: notificationTypes = [] } = useNotificationTypes()
  const { data: statementTypes = [] } = useStatementTypes()

  const orderUploadMutation = useUploadTemplate()
  const notifUploadMutation = useUploadNotificationTypeTemplate()
  const notifDeleteMutation = useDeleteNotificationTypeTemplate()
  const stmtUploadMutation = useUploadStatementTypeTemplate()
  const stmtDeleteMutation = useDeleteStatementTypeTemplate()
  const orderDeleteMutation = useDeleteTemplate()

  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getUploadStatus = (key: string) => uploadStatuses.find((s) => s.key === key)

  const setUploadStatus = (key: string, kind: TemplateKind, status: "uploading" | "success" | "error") => {
    setUploadStatuses((prev) => [...prev.filter((s) => s.key !== key), { key, kind, status }])
  }

  const clearUploadStatus = (key: string) => {
    setUploadStatuses((prev) => prev.filter((s) => s.key !== key))
  }

  const handleFileForOrder = (orderType: OrderType, file: File) => {
    setUploadStatus(String(orderType.id), "order", "uploading")
    orderUploadMutation.mutate(
      { orderTypeId: orderType.id, file },
      {
        onSuccess: () => {
          setUploadStatus(String(orderType.id), "order", "success")
          setTimeout(() => clearUploadStatus(String(orderType.id)), 2000)
        },
        onError: () => {
          setUploadStatus(String(orderType.id), "order", "error")
          setTimeout(() => clearUploadStatus(String(orderType.id)), 3000)
        },
      }
    )
  }

  const handleFileForNotification = (notifType: NotificationType, file: File) => {
    setUploadStatus(String(notifType.id), "notification", "uploading")
    notifUploadMutation.mutate(
      { id: notifType.id, file },
      {
        onSuccess: () => {
          setUploadStatus(String(notifType.id), "notification", "success")
          setTimeout(() => clearUploadStatus(String(notifType.id)), 2000)
        },
        onError: () => {
          setUploadStatus(String(notifType.id), "notification", "error")
          setTimeout(() => clearUploadStatus(String(notifType.id)), 3000)
        },
      }
    )
  }

  const handleFileForStatement = (stmtType: StatementType, file: File) => {
    setUploadStatus(String(stmtType.id), "statement", "uploading")
    stmtUploadMutation.mutate(
      { id: stmtType.id, file },
      {
        onSuccess: () => {
          setUploadStatus(String(stmtType.id), "statement", "success")
          setTimeout(() => clearUploadStatus(String(stmtType.id)), 2000)
        },
        onError: () => {
          setUploadStatus(String(stmtType.id), "statement", "error")
          setTimeout(() => clearUploadStatus(String(stmtType.id)), 3000)
        },
      }
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return

    // Match files to types by code
    for (const file of selected) {
      if (!file.name.endsWith(".docx")) continue
      const code = file.name.replace(/\.docx$/i, "")
      const matchingOrder = orderTypes.find((ot) => ot.code === code)
      if (matchingOrder) {
        handleFileForOrder(matchingOrder, file)
        continue
      }
      const matchingNotif = notificationTypes.find((nt) => nt.code === code)
      if (matchingNotif) {
        handleFileForNotification(matchingNotif, file)
        continue
      }
      const matchingStmt = statementTypes.find((st) => st.code === code)
      if (matchingStmt) {
        handleFileForStatement(matchingStmt, file)
      }
    }

    // Reset input so same files can be selected again
    e.target.value = ""
  }

  const handleUploadClick = (kind: TemplateKind, item: OrderType | NotificationType | StatementType) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".docx"
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (kind === "order") handleFileForOrder(item as OrderType, file)
      else if (kind === "notification") handleFileForNotification(item as NotificationType, file)
      else handleFileForStatement(item as StatementType, file)
    }
    input.click()
  }

  const handleDeleteClick = (kind: TemplateKind, id: number) => {
    if (kind === "order") orderDeleteMutation.mutate(id)
    else if (kind === "notification") notifDeleteMutation.mutate(id)
    else stmtDeleteMutation.mutate(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Импорт шаблонов</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">
            Приказы: {orderTypes.filter((ot) => ot.template_exists).length}/{orderTypes.length}
            {" · "}
            Уведомления: {notificationTypes.filter((nt) => nt.template_exists).length}/{notificationTypes.length}
            {" · "}
            Заявления: {statementTypes.filter((st) => st.template_exists).length}/{statementTypes.length}
          </p>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Загрузить несколько
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {renderTemplateSection("Приказы", orderTypes.map((ot) => ({
            id: ot.id,
            key: String(ot.id),
            kind: "order" as TemplateKind,
            name: ot.name,
            template_exists: ot.template_exists,
            display_name: ot.display_name || ot.template_filename,
          })))}
          {renderTemplateSection("Уведомления", notificationTypes.map((nt) => ({
            id: nt.id,
            key: String(nt.id),
            kind: "notification" as TemplateKind,
            name: nt.name,
            template_exists: nt.template_exists,
            display_name: nt.display_name || nt.template_filename,
          })))}
          {renderTemplateSection("Заявления", statementTypes.map((st) => ({
            id: st.id,
            key: String(st.id),
            kind: "statement" as TemplateKind,
            name: st.name,
            template_exists: st.template_exists,
            display_name: st.display_name || st.template_filename,
          })))}
        </div>
      </DialogContent>
    </Dialog>
  )

  function renderTemplateSection(title: string, items: { id: number; key: string; kind: TemplateKind; name: string; template_exists: boolean; display_name: string | null | undefined }[]) {
    if (!items.length) return null
    return (
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground px-1">{title}</h3>
        {items.map((item) => {
          const status = getUploadStatus(item.key)
          return (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${item.template_exists ? "bg-green-500" : "bg-gray-300"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {item.template_exists ? item.display_name : "Нет шаблона"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-4">
                {status?.status === "uploading" && (
                  <span className="text-xs text-muted-foreground">Загрузка...</span>
                )}
                {status?.status === "success" && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Загружено
                  </span>
                )}
                {status?.status === "error" && (
                  <span className="text-xs text-red-600 flex items-center gap-1">
                    <X className="h-3 w-3" /> Ошибка
                  </span>
                )}
                {!status && item.template_exists && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Превью"
                    onClick={() => {
                      const route = item.kind === "notification" ? "notification-templates" : item.kind === "statement" ? "statement-templates" : "templates"
                      window.open(`/${route}/${item.id}/view`, "_blank", "noopener,noreferrer")
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                {!status && item.template_exists && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Редактировать"
                    onClick={() => {
                      const route = item.kind === "notification" ? "notification-templates" : item.kind === "statement" ? "statement-templates" : "templates"
                      window.open(`/${route}/${item.id}/edit`, "_blank", "noopener,noreferrer")
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {!status && item.template_exists && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => handleDeleteClick(item.kind, item.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => handleUploadClick(item.kind, { id: item.id } as any)}
                  disabled={
                    (item.kind === "order" && orderUploadMutation.isPending) ||
                    (item.kind === "notification" && notifUploadMutation.isPending) ||
                    (item.kind === "statement" && stmtUploadMutation.isPending)
                  }
                >
                  <Download className="mr-1 h-3 w-3" />
                  {item.template_exists ? "Заменить" : "Загрузить"}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
}
