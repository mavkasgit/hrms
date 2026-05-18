import axios from "@/shared/api/axios"
import type { Document, DocumentCurrentResponse } from "./types"
import type { OnlyOfficeConfig } from "@/entities/order/onlyofficeTypes"

export async function getDocuments(docCode: string, limit = 10): Promise<Document[]> {
  const { data } = await axios.get<Document[]>(`/documents/${docCode}`, {
    params: { limit },
  })
  return data
}

export async function getCurrentDocument(docCode: string): Promise<DocumentCurrentResponse> {
  const { data } = await axios.get<DocumentCurrentResponse>(`/documents/${docCode}/current`)
  return data
}

export async function uploadDocument(docCode: string, file: File): Promise<Document> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await axios.post<Document>(`/documents/${docCode}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function deleteDocument(docCode: string, docId: number): Promise<void> {
  await axios.delete(`/documents/${docCode}/${docId}`)
}

export async function fetchDocumentOnlyOfficeConfig(
  docCode: string,
  docId: number,
  mode: "edit" | "view" = "view"
): Promise<OnlyOfficeConfig> {
  const { data } = await axios.get<OnlyOfficeConfig>(`/documents/${docCode}/${docId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}

export async function forceSaveDocument(docCode: string, docId: number, documentKey: string) {
  const { data } = await axios.post<{ message: string }>(`/documents/${docCode}/${docId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}
