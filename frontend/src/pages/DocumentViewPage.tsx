import { useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useDocumentOnlyOfficeConfig, useForceSaveDocument } from "@/entities/document/useDocuments"
import { publishDocumentEditorSave } from "@/entities/document/documentEditorSaveChannel"
import {
  EditorSaveBanner,
  sleep,
  useEditorSaveFeedback,
  withMinDuration,
} from "@/features/onlyoffice-editor/editorSaveUi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { Button } from "@/shared/ui/button"

export function DocumentViewPage() {
  const { docCode, id } = useParams<{ docCode: string; id: string }>()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get("mode") === "edit" ? "edit" : "view"

  const docId = id ? Number.parseInt(id, 10) : 0
  const { data, isLoading, error } = useDocumentOnlyOfficeConfig(
    docCode ?? null,
    Number.isFinite(docId) ? docId : 0,
    mode,
  )

  const [isSaving, setIsSaving] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const saveMutation = useForceSaveDocument(docCode ?? "", docId)
  const { saveError, savePhase, beginSave, failSave, succeedSave } = useEditorSaveFeedback()

  const busy = isSaving || saveMutation.isPending

  const handleSave = async () => {
    if (busy || !editorReady) return
    setIsSaving(true)
    beginSave("Сохраняем документ…")
    try {
      await withMinDuration(async () => {
        if (docId && data?.document.key) {
          await saveMutation.mutateAsync(data.document.key)
          // Wait for OnlyOffice callback (download + replace file + DB update)
          await sleep(1500)
          publishDocumentEditorSave({
            entity: "document",
            id: docId,
            title: data.document.title || `${docCode} #${docId}`,
          })
        }
      })
      succeedSave()
      window.setTimeout(() => window.close(), 400)
    } catch (err) {
      console.error("[DocumentViewPage] force save failed", err)
      setIsSaving(false)
      failSave(err)
    }
  }

  return (
    <div className="h-screen bg-background">
      <EditorSaveBanner error={saveError} phase={busy ? savePhase : null} />
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
        onReadyChange={setEditorReady}
      />
      {mode === "edit" && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
            size="lg"
            onClick={handleSave}
            disabled={!editorReady || busy}
            title={!editorReady ? "Дождитесь загрузки редактора" : undefined}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Сохраняем…" : "Сохранить и закрыть"}
          </Button>
        </div>
      )}
    </div>
  )
}
