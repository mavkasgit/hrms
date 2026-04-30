import { useState } from "react"
import { useLocation, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useTemplateOnlyOfficeConfig } from "@/entities/order/useOnlyOffice"
import { forceSaveTemplate } from "@/entities/order/onlyofficeApi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { Button } from "@/shared/ui/button"

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const orderTypeId = id ? Number.parseInt(id, 10) : 0
  const isViewMode = location.pathname.endsWith("/view")
  const { data, isLoading, error } = useTemplateOnlyOfficeConfig(
    Number.isFinite(orderTypeId) ? orderTypeId : 0,
    isViewMode ? "view" : "edit"
  )
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveTemplate = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      if (orderTypeId && data?.document.key) {
        await forceSaveTemplate(orderTypeId, data.document.key)
        await wait(1200)
      }
      window.setTimeout(() => window.close(), 300)
    } catch (error) {
      console.error("[TemplateEditorPage] force save failed", error)
      setIsSaving(false)
      alert("Не удалось сохранить шаблон. Попробуйте нажать Ctrl+S в OnlyOffice и повторить сохранение.")
    }
  }

  return (
    <div className="h-screen bg-background">
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
      />
      {!isViewMode && (
        <Button
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
          size="lg"
          onClick={handleSaveTemplate}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? "Сохраняем..." : "Сохранить шаблон"}
        </Button>
      )}
    </div>
  )
}
