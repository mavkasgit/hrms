import { useEffect, useState } from "react"
import { useParams, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useStatement } from "@/entities/statement/hooks"
import { fetchStatementOnlyOfficeConfig } from "@/entities/statement/api"
import { forceSaveStatement } from "@/entities/statement/onlyofficeApi"
import { publishDocumentEditorSave } from "@/entities/document/documentEditorSaveChannel"
import {
  EditorSaveBanner,
  sleep,
  useEditorSaveFeedback,
  withMinDuration,
} from "@/features/onlyoffice-editor/editorSaveUi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { failPrintPlaceholder, openPrintPlaceholderWindow, openPrintWindow } from "@/shared/utils/print-window"

export function StatementEditorPage() {
  const { statementId } = useParams<{ statementId: string }>()
  const location = useLocation()
  const isViewMode = location.pathname.endsWith("/view-docx")
  const { isLoading: statementLoading } = useStatement(statementId ? Number(statementId) : null)
  const [config, setConfig] = useState<any>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaveAndPrint, setIsSaveAndPrint] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const { saveError, savePhase, beginSave, failSave, succeedSave } = useEditorSaveFeedback()

  const busy = isSaving || isSaveAndPrint

  useEffect(() => {
    if (statementId) {
      setConfigLoading(true)
      fetchStatementOnlyOfficeConfig(Number(statementId), isViewMode ? "view" : "edit")
        .then(setConfig)
        .catch(console.error)
        .finally(() => setConfigLoading(false))
    }
  }, [statementId, isViewMode])

  const handleSave = async (openPrint: boolean) => {
    if (busy || !editorReady || !statementId || !config?.document?.key) return
    let printWindowName: string | undefined
    if (openPrint) setIsSaveAndPrint(true)
    else setIsSaving(true)
    beginSave(openPrint ? "Сохраняем и готовим печать…" : "Сохраняем документ…")

    if (openPrint) {
      const candidateWindowName = `hrms-statement-print-${statementId}-${Date.now()}`
      printWindowName = openPrintPlaceholderWindow({
        windowName: candidateWindowName,
        savedEntityLabel: "заявления",
        logPrefix: "[StatementEditorPage]",
      })
    }

    try {
      await withMinDuration(async () => {
        await forceSaveStatement(Number(statementId), config.document.key)
        await sleep(300)
        publishDocumentEditorSave({
          entity: "statement",
          id: Number(statementId),
          title: config.document?.title || `Заявление #${statementId}`,
        })
        if (openPrint) {
          openPrintWindow(`/statements/${statementId}/print`, printWindowName)
        }
        if (window.opener) {
          window.opener.postMessage(
            { type: "hrms:statement-save", statementId },
            window.location.origin,
          )
        }
      })
      succeedSave()
      window.setTimeout(() => window.close(), 400)
    } catch (error) {
      console.error("[StatementEditorPage] force save failed", error)
      setIsSaving(false)
      setIsSaveAndPrint(false)
      failPrintPlaceholder(
        printWindowName,
        error instanceof Error ? error.message : "Не удалось сохранить документ",
      )
      failSave(error)
    }
  }

  const handleSaveStatement = () => void handleSave(false)
  const handleSaveAndOpenPrint = () => void handleSave(true)

  const isLoading = statementLoading || configLoading

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
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
      <EditorSaveBanner error={saveError} phase={busy ? savePhase : null} />
      <OrderEditor
        config={config}
        isLoading={false}
        error={null}
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
            onClick={handleSaveStatement}
            disabled={!editorReady || busy}
            title={!editorReady ? "Дождитесь загрузки редактора" : undefined}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? "Сохраняем…" : "Сохранить заявление"}
          </Button>
        </div>
      )}
    </div>
  )
}
