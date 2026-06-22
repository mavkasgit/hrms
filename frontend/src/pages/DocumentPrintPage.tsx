import { useParams } from "react-router-dom"
import { PdfPrintPage } from "@/pages/PdfPrintPage"

interface DocumentPrintPageProps {
  routeParam: "id" | "notificationId" | "statementId"
  endpoint: "orders" | "notifications" | "statements"
  titlePrefix: string
  invalidIdMessage: string
}

export function DocumentPrintPage({ routeParam, endpoint, titlePrefix, invalidIdMessage }: DocumentPrintPageProps) {
  const params = useParams<{ id?: string; notificationId?: string; statementId?: string }>()
  const rawId = params[routeParam]
  const entityId = rawId ? Number.parseInt(rawId, 10) : NaN
  const token = localStorage.getItem("token")
  const pdfUrl = Number.isFinite(entityId)
    ? `${import.meta.env.VITE_API_URL || "/api"}/${endpoint}/${entityId}/print-pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`
    : null

  return (
    <PdfPrintPage
      pdfUrl={pdfUrl}
      title={`${titlePrefix} ${entityId}`}
      invalidIdMessage={invalidIdMessage}
    />
  )
}
