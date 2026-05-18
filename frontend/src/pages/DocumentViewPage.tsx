import { useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useDocumentOnlyOfficeConfig, useForceSaveDocument } from "@/entities/document/useDocuments"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { Button } from "@/shared/ui/button"

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function DocumentViewPage() {
  const { docCode, id } = useParams<{ docCode: string; id: string }>()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get("mode") === "edit" ? "edit" : "view"
  const autoPrint = searchParams.get("print") === "1"

  const docId = id ? Number.parseInt(id, 10) : 0
  const { data, isLoading, error } = useDocumentOnlyOfficeConfig(
    docCode ?? null,
    Number.isFinite(docId) ? docId : 0,
    mode
  )

  const [isSaving, setIsSaving] = useState(false)
  const saveMutation = useForceSaveDocument(docCode ?? "", docId)

  const handleSave = async () => {
    if (isSaving || saveMutation.isPending) return
    setIsSaving(true)
    try {
      if (docId && data?.document.key) {
        await saveMutation.mutateAsync(data.document.key)
        // Wait for OnlyOffice callback to complete (download + replace file + DB update)
        await wait(2500)
      }
      window.close()
    } catch {
      alert("Не удалось сохранить документ. Попробуйте нажать Ctrl+S в OnlyOffice и повторить сохранение.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-screen bg-background">
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
      />
      {mode === "edit" && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
            size="lg"
            onClick={handleSave}
            disabled={isSaving || saveMutation.isPending}
          >
            {isSaving || saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isSaving || saveMutation.isPending ? "Сохраняем..." : "Сохранить и закрыть"}
          </Button>
        </div>
      )}
    </div>
  )
}
