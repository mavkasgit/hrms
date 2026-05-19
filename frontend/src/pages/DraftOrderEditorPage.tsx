import { useState } from "react"
import { useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useDraftOnlyOfficeConfig } from "@/entities/order/useOnlyOffice"
import { forceSaveDraft } from "@/entities/order/onlyofficeApi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { Button } from "@/shared/ui/button"
import { openPrintPlaceholderWindow } from "@/shared/utils/print-window"

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function DraftOrderEditorPage() {
  const { draftId } = useParams<{ draftId: string }>()
  const { data, isLoading, error } = useDraftOnlyOfficeConfig(draftId || null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaveAndPrint, setIsSaveAndPrint] = useState(false)

  const handleSave = async (openPrint: boolean) => {
    if (isSaving || isSaveAndPrint) return
    let printWindowName: string | undefined
    if (openPrint) setIsSaveAndPrint(true)
    else setIsSaving(true)
    if (openPrint) {
      const candidateWindowName = `hrms-order-print-${draftId ?? "draft"}-${Date.now()}`
      printWindowName = openPrintPlaceholderWindow({
        windowName: candidateWindowName,
        savedEntityLabel: "приказа",
        logPrefix: "[DraftOrderEditorPage]",
      })
    }
    try {
      if (draftId && data?.document.key) {
        await forceSaveDraft(draftId, data.document.key)
        await wait(1200)
      }
      if (draftId && window.opener) {
        window.opener.postMessage({ type: "hrms:draft-order-save", draftId, openPrint, printWindowName }, window.location.origin)
      }
      window.setTimeout(() => window.close(), 300)
    } catch (error) {
      console.error("[DraftOrderEditorPage] force save failed", error)
      setIsSaving(false)
      setIsSaveAndPrint(false)
      alert("Не удалось сохранить документ. Попробуйте нажать Ctrl+S в OnlyOffice и повторить сохранение приказа.")
    }
  }

  const handleSaveOrder = () => void handleSave(false)
  const handleSaveAndOpenPrint = () => void handleSave(true)

  return (
    <div className="h-screen bg-background">
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
      />
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
          onClick={handleSaveOrder}
          disabled={isSaving || isSaveAndPrint}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? "Сохраняем..." : "Сохранить приказ"}
        </Button>
      </div>
    </div>
  )
}
