import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getDocuments,
  getCurrentDocument,
  uploadDocument,
  deleteDocument,
  fetchDocumentOnlyOfficeConfig,
} from "./api"
import type { Document } from "./types"

export function useDocuments(docCode: string | null) {
  return useQuery({
    queryKey: ["documents", docCode],
    queryFn: () => getDocuments(docCode!),
    enabled: !!docCode,
  })
}

export function useCurrentDocument(docCode: string | null) {
  return useQuery({
    queryKey: ["documents", docCode, "current"],
    queryFn: () => getCurrentDocument(docCode!),
    enabled: !!docCode,
  })
}

export function useUploadDocument(docCode: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadDocument(docCode!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", docCode] })
      queryClient.invalidateQueries({ queryKey: ["documents", docCode, "current"] })
    },
  })
}

export function useDeleteDocument(docCode: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (docId: number) => deleteDocument(docCode!, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", docCode] })
      queryClient.invalidateQueries({ queryKey: ["documents", docCode, "current"] })
    },
  })
}

export function useDocumentOnlyOfficeConfig(docCode: string | null, docId: number, mode: "edit" | "view" = "view") {
  return useQuery({
    queryKey: ["documents", docCode, docId, "onlyoffice", mode],
    queryFn: () => fetchDocumentOnlyOfficeConfig(docCode!, docId, mode),
    enabled: !!docCode && Number.isFinite(docId) && docId > 0,
  })
}
