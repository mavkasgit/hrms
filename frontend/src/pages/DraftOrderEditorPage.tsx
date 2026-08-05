import { useState } from "react"
import { useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useDraftOnlyOfficeConfig } from "@/entities/order/useOnlyOffice"
import { commitOrderDraft, forceSaveDraft, fetchDraftSaveStatus, reportDraftSaveError } from "@/entities/order/onlyofficeApi"
import { openOrderPrint } from "@/entities/order/orderActions"
import { requestAndWaitOnlyOfficeSave } from "@/entities/order/waitForOnlyOfficeSave"
import {
  EditorSaveBanner,
  useEditorSaveFeedback,
  withMinDuration,
} from "@/features/onlyoffice-editor/editorSaveUi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { Button } from "@/shared/ui/button"
import { failPrintPlaceholder, openPrintPlaceholderWindow } from "@/shared/utils/print-window"

export function DraftOrderEditorPage() {
  const { draftId } = useParams<{ draftId: string }>()
  const { data, isLoading, error } = useDraftOnlyOfficeConfig(draftId || null)
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
      const candidateWindowName = `hrms-order-print-${draftId ?? "draft"}-${Date.now()}`
      printWindowName = openPrintPlaceholderWindow({
        windowName: candidateWindowName,
        savedEntityLabel: "приказа",
        logPrefix: "[DraftOrderEditorPage]",
      })
    }

    try {
      await withMinDuration(async () => {
        if (!draftId || !data?.document.key) {
          throw new Error("Документ ещё не готов к сохранению")
        }

        // no_changes = уже сохранено autosave/callback — создаём приказ из актуального черновика.
        try {
          await requestAndWaitOnlyOfficeSave({
            forceSave: (saveId) => forceSaveDraft(draftId, data.document.key, saveId),
            getStatus: (saveId) => fetchDraftSaveStatus(draftId, saveId),
          })
        } catch (saveErr) {
          // Провал именно сохранения (не коммита) — фиксируем причину в save_status (#53).
          const reason = saveErr instanceof Error ? saveErr.message : "Не удалось сохранить документ"
          void reportDraftSaveError(draftId, reason).catch(() => {})
          throw saveErr
        }

        beginSave("Создаём приказ…")
        // Коммитим черновик напрямую из окна редактора — родительская страница не нужна (#31).
        const result = await commitOrderDraft(draftId)

        // duplicate: true — приказ уже создан параллельным коммитом, молча считаем успехом.
        if (openPrint && "id" in result && result.id) {
          openOrderPrint(result.id, printWindowName || "_blank")
        }
      })

      succeedSave()
      window.setTimeout(() => window.close(), 400)
    } catch (err) {
      console.error("[DraftOrderEditorPage] force save failed", err)
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

  const savingLabel = savePhase?.includes("приказ")
    ? "Создаём приказ…"
    : savePhase?.includes("печать")
      ? "Сохраняем…"
      : "Сохраняем…"

  return (
    <div className="h-screen bg-background">
      <EditorSaveBanner error={saveError} phase={busy ? savePhase : null} />
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
        onReadyChange={setEditorReady}
      />
      <div className="fixed bottom-6 right-6 z-50 flex gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={handleSaveAndOpenPrint}
          disabled={!editorReady || busy}
          title={!editorReady ? "Дождитесь загрузки редактора" : undefined}
        >
          {isSaveAndPrint && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaveAndPrint ? savingLabel : "Сохранить и открыть печать"}
        </Button>
        <Button
          className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
          size="lg"
          onClick={handleSaveOrder}
          disabled={!editorReady || busy}
          title={!editorReady ? "Дождитесь загрузки редактора" : undefined}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? savingLabel : "Сохранить приказ"}
        </Button>
      </div>
    </div>
  )
}
