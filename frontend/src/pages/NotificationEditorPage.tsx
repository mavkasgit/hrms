import { useEffect, useState } from "react"
import { useParams, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useNotification } from "@/entities/notification/hooks"
import { fetchNotificationOnlyOfficeConfig } from "@/entities/notification/api"
import { forceSaveNotification } from "@/entities/notification/onlyofficeApi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { openPrintPlaceholderWindow, openPrintWindow } from "@/shared/utils/print-window"

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function NotificationEditorPage() {
  const { notificationId } = useParams<{ notificationId: string }>()
  const location = useLocation()
  const isViewMode = location.pathname.endsWith("/view-docx")
  const { isLoading: notificationLoading } = useNotification(
    notificationId ? Number(notificationId) : null
  )
  const [config, setConfig] = useState<any>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaveAndPrint, setIsSaveAndPrint] = useState(false)

  useEffect(() => {
    if (notificationId) {
      setConfigLoading(true)
      fetchNotificationOnlyOfficeConfig(Number(notificationId), isViewMode ? "view" : "edit")
        .then(setConfig)
        .catch(console.error)
        .finally(() => setConfigLoading(false))
    }
  }, [notificationId, isViewMode])

  const handleSave = async (openPrint: boolean) => {
    if (isSaving || isSaveAndPrint || !notificationId || !config?.document?.key) return
    let printWindowName: string | undefined
    if (openPrint) setIsSaveAndPrint(true)
    else setIsSaving(true)

    if (openPrint) {
      const candidateWindowName = `hrms-notification-print-${notificationId}-${Date.now()}`
      printWindowName = openPrintPlaceholderWindow({
        windowName: candidateWindowName,
        savedEntityLabel: "уведомления",
        logPrefix: "[NotificationEditorPage]",
      })
    }

    try {
      await forceSaveNotification(Number(notificationId), config.document.key)
      await wait(1200)
      if (openPrint) {
        openPrintWindow(`/notifications/${notificationId}/print`, printWindowName)
      }
      if (window.opener) {
        window.opener.postMessage(
          { type: "hrms:notification-save", notificationId },
          window.location.origin
        )
      }
      window.setTimeout(() => window.close(), 300)
    } catch (error) {
      console.error("[NotificationEditorPage] force save failed", error)
      setIsSaving(false)
      setIsSaveAndPrint(false)
      alert("Не удалось сохранить документ.")
    }
  }

  const handleSaveNotification = () => void handleSave(false)
  const handleSaveAndOpenPrint = () => void handleSave(true)

  const isLoading = notificationLoading || configLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Загрузка...</span>
      </div>
    )
  }

  if (!config) {
    return <div className="p-6">Ошибка загрузки конфигурации редактора</div>
  }

  return (
    <div className="h-screen bg-background">
      <OrderEditor
        config={config}
        isLoading={false}
        error={null}
      />
      {!isViewMode && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={handleSaveAndOpenPrint}
            disabled={isSaving || isSaveAndPrint}
          >
            {isSaveAndPrint && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaveAndPrint ? "Сохраняем..." : "Сохранить и открыть печать"}
          </Button>
          <Button
            className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
            size="lg"
            onClick={handleSaveNotification}
            disabled={isSaving || isSaveAndPrint}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? "Сохраняем..." : "Сохранить уведомление"}
          </Button>
        </div>
      )}
    </div>
  )
}
