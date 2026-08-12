import { useState } from "react"
import { useLocation, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useOrderOnlyOfficeConfig } from "@/entities/order"
import { forceSaveOrder, fetchOrderSaveStatus } from "@/entities/order"
import { requestAndWaitOnlyOfficeSave } from "@/entities/order"
import { openOrderPrint } from "@/entities/order"
import { publishDocumentEditorSave } from "@/entities/document/documentEditorSaveChannel"
import {
  EditorSaveBanner,
  useEditorSaveFeedback,
  withMinDuration,
} from "@/features/onlyoffice-editor/editorSaveUi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { Button } from "@/shared/ui/button"
import { failPrintPlaceholder, openPrintPlaceholderWindow } from "@/shared/utils/print-window"

export function OrderEditorPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const orderId = id ? Number.parseInt(id, 10) : 0
  const isViewMode = location.pathname.endsWith("/view-docx")
  const { data, isLoading, error } = useOrderOnlyOfficeConfig(
    Number.isFinite(orderId) ? orderId : 0,
    isViewMode ? "view" : "edit",
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isSaveAndPrint, setIsSaveAndPrint] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const { saveError, savePhase, beginSave, failSave, succeedSave } = useEditorSaveFeedback()

  const busy = isSaving || isSaveAndPrint

  const handleSave = async (openPrint: boolean) => {
    if (busy || !editorReady) return
    let printWindowName: string | undefined
    if (openPrint) setIsSaveAndPrint(true)
    else setIsSaving(true)
    beginSave(openPrint ? "Сохраняем и готовим печать…" : "Сохраняем документ…")

    if (openPrint) {
      const candidateWindowName = `hrms-order-print-${orderId}-${Date.now()}`
      printWindowName = openPrintPlaceholderWindow({
        windowName: candidateWindowName,
        savedEntityLabel: "приказа",
        logPrefix: "[OrderEditorPage]",
      })
    }

    try {
      await withMinDuration(async () => {
        if (!orderId || !data?.document.key) {
          throw new Error("Документ ещё не готов к сохранению")
        }

        await requestAndWaitOnlyOfficeSave({
          forceSave: (saveId) => forceSaveOrder(orderId, data.document.key, saveId),
          getStatus: (saveId) => fetchOrderSaveStatus(orderId, saveId),
        })

        publishDocumentEditorSave({
          entity: "order",
          id: orderId,
          title: data.document.title || `Приказ #${orderId}`,
        })

        if (openPrint && orderId) {
          openOrderPrint(orderId, printWindowName || "_blank")
        }
      })

      succeedSave()
      window.setTimeout(() => window.close(), 400)
    } catch (err) {
      console.error("[OrderEditorPage] force save failed", err)
      setIsSaving(false)
      setIsSaveAndPrint(false)
      failPrintPlaceholder(
        printWindowName,
        err instanceof Error ? err.message : "Не удалось сохранить документ",
      )
      failSave(err)
    }
  }

  const handleSaveOrder = () => void handleSave(false)
  const handleSaveAndOpenPrint = () => void handleSave(true)

  return (
    <div className="h-screen bg-background">
      <EditorSaveBanner error={saveError} phase={busy ? savePhase : null} />
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
        onReadyChange={setEditorReady}
      />
      {!isViewMode && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={handleSaveAndOpenPrint}
            disabled={!editorReady || busy}
            title={!editorReady ? "Дождитесь загрузки редактора" : undefined}
          >
            {isSaveAndPrint && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaveAndPrint ? "Сохраняем…" : "Сохранить и открыть печать"}
          </Button>
          <Button
            className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
            size="lg"
            onClick={handleSaveOrder}
            disabled={!editorReady || busy}
            title={!editorReady ? "Дождитесь загрузки редактора" : undefined}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? "Сохраняем…" : "Сохранить приказ"}
          </Button>
        </div>
      )}
    </div>
  )
}
