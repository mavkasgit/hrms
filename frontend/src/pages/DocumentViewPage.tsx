import { useParams } from "react-router-dom"
import { useDocumentOnlyOfficeConfig } from "@/entities/document/useDocuments"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"

export function DocumentViewPage() {
  const { docCode, id } = useParams<{ docCode: string; id: string }>()
  const docId = id ? Number.parseInt(id, 10) : 0
  const { data, isLoading, error } = useDocumentOnlyOfficeConfig(
    docCode ?? null,
    Number.isFinite(docId) ? docId : 0,
    "view"
  )

  return (
    <div className="h-screen bg-background">
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
      />
    </div>
  )
}
