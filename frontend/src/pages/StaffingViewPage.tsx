import { useParams } from "react-router-dom"
import { useStaffingOnlyOfficeConfig } from "@/entities/staffing/useStaffing"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"

export function StaffingViewPage() {
  const { id } = useParams<{ id: string }>()
  const docId = id ? Number.parseInt(id, 10) : 0
  const { data, isLoading, error } = useStaffingOnlyOfficeConfig(
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
