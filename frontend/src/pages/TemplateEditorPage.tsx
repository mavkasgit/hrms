import { useState } from "react"
import { useLocation, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useTemplateOnlyOfficeConfig } from "@/entities/order"
import { forceSaveTemplate } from "@/entities/order"
import { useNotificationTypeOnlyOfficeConfig } from "@/entities/notification/hooks"
import { forceSaveNotificationTypeTemplate } from "@/entities/notification/api"
import { useStatementTypeOnlyOfficeConfig } from "@/entities/statement/hooks"
import { forceSaveStatementTypeTemplate } from "@/entities/statement/api"
import { publishDocumentEditorSave } from "@/entities/document/documentEditorSaveChannel"
import {
  EditorSaveBanner,
  sleep,
  useEditorSaveFeedback,
  withMinDuration,
} from "@/features/onlyoffice-editor/editorSaveUi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { Button } from "@/shared/ui/button"

export function TemplateEditorPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>()
  const location = useLocation()
  const templateId = id ? Number.parseInt(id, 10) : 0
  const isViewMode = location.pathname.endsWith("/view")
  const mode = isViewMode ? ("view" as const) : ("edit" as const)
  const [isSaving, setIsSaving] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const { saveError, savePhase, beginSave, failSave, succeedSave } = useEditorSaveFeedback()

  const orderConfig = useTemplateOnlyOfficeConfig(
    kind === "order" && Number.isFinite(templateId) ? templateId : 0,
    mode,
  )
  const notifConfig = useNotificationTypeOnlyOfficeConfig(
    kind === "notification" && Number.isFinite(templateId) ? templateId : null,
    mode,
  )
  const stmtConfig = useStatementTypeOnlyOfficeConfig(
    kind === "statement" && Number.isFinite(templateId) ? templateId : null,
    mode,
  )

  const config = kind === "notification" ? notifConfig : kind === "statement" ? stmtConfig : orderConfig
  const { data, isLoading, error } = config

  const handleSaveTemplate = async () => {
    if (isSaving || !editorReady || !templateId || !data?.document.key) return
    setIsSaving(true)
    beginSave("Сохраняем шаблон…")
    try {
      await withMinDuration(async () => {
        if (kind === "notification") {
          await forceSaveNotificationTypeTemplate(templateId, data.document.key)
        } else if (kind === "statement") {
          await forceSaveStatementTypeTemplate(templateId, data.document.key)
        } else {
          await forceSaveTemplate(templateId, data.document.key)
        }
        await sleep(300)
        publishDocumentEditorSave({
          entity: "template",
          id: templateId,
          title: data.document.title || `Шаблон #${templateId}`,
        })
      })
      succeedSave()
      window.setTimeout(() => window.close(), 400)
    } catch (err) {
      console.error("[TemplateEditorPage] force save failed", err)
      setIsSaving(false)
      failSave(err, "Не удалось сохранить шаблон")
    }
  }

  return (
    <div className="h-screen bg-background">
      <EditorSaveBanner error={saveError} phase={isSaving ? savePhase : null} />
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
        onReadyChange={setEditorReady}
      />
      {!isViewMode && (
        <Button
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
          size="lg"
          onClick={handleSaveTemplate}
          disabled={!editorReady || isSaving}
          title={!editorReady ? "Дождитесь загрузки редактора" : undefined}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? "Сохраняем…" : "Сохранить шаблон"}
        </Button>
      )}
    </div>
  )
}
