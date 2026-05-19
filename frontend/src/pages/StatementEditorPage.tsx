import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useStatement } from "@/entities/statement/hooks"
import { fetchStatementOnlyOfficeConfig } from "@/entities/statement/api"
import { forceSaveStatement } from "@/entities/statement/onlyofficeApi"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function StatementEditorPage() {
  const { statementId } = useParams<{ statementId: string }>()
  const { isLoading: statementLoading } = useStatement(
    statementId ? Number(statementId) : null
  )
  const [config, setConfig] = useState<any>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (statementId) {
      setConfigLoading(true)
      fetchStatementOnlyOfficeConfig(Number(statementId), "edit")
        .then(setConfig)
        .catch(console.error)
        .finally(() => setConfigLoading(false))
    }
  }, [statementId])

  const handleSave = async () => {
    if (isSaving || !statementId || !config?.document?.key) return
    setIsSaving(true)
    try {
      await forceSaveStatement(Number(statementId), config.document.key)
      await wait(1200)
      if (window.opener) {
        window.opener.postMessage(
          { type: "hrms:statement-save", statementId },
          window.location.origin
        )
      }
      window.setTimeout(() => window.close(), 300)
    } catch (error) {
      console.error("[StatementEditorPage] force save failed", error)
      setIsSaving(false)
      alert("Не удалось сохранить документ.")
    }
  }

  const isLoading = statementLoading || configLoading

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
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl shadow-emerald-950/25 transition-all duration-300 hover:scale-[1.03] hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 hover:shadow-emerald-700/40 disabled:scale-100 disabled:opacity-90"
          size="lg"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? "Сохраняем..." : "Сохранить заявление"}
        </Button>
      </div>
    </div>
  )
}
