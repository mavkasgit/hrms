import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import type { StatementCreate, StatementUpdate } from "./types"

// ─── Statements ───

export function useNextStatementNumber() {
  return useQuery({
    queryKey: ["next-statement-number"],
    queryFn: () => api.fetchNextStatementNumber(),
  })
}

export function useStatements(params: {
  page?: number
  per_page?: number
  number?: string
  date_from?: string
  date_to?: string
  employee_id?: number
  statement_type_id?: number
}) {
  return useQuery({
    queryKey: ["statements", params],
    queryFn: () => api.fetchStatements(params),
  })
}

export function useStatement(id: number | null) {
  return useQuery({
    queryKey: ["statement", id],
    queryFn: () => api.fetchStatement(id!),
    enabled: !!id,
  })
}

export function useCreateStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: StatementCreate) => api.createStatement(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statements"] })
    },
  })
}

export function useUpdateStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: StatementUpdate }) =>
      api.updateStatement(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statements"] })
    },
  })
}

export function useDeleteStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteStatement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statements"] })
    },
  })
}

// ─── Statement Types ───

export function useStatementTypes(active_only = false) {
  return useQuery({
    queryKey: ["statement-types", active_only],
    queryFn: () => api.fetchStatementTypes(active_only),
  })
}

export function useStatementType(id: number | null) {
  return useQuery({
    queryKey: ["statement-type", id],
    queryFn: () => api.fetchStatementType(id!),
    enabled: !!id,
  })
}

export function useCreateStatementType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<import("./types").StatementType>) => api.createStatementType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statement-types"] })
    },
  })
}

export function useUpdateStatementType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<import("./types").StatementType> }) =>
      api.updateStatementType(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statement-types"] })
    },
  })
}

export function useDeleteStatementType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteStatementType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statement-types"] })
    },
  })
}

export function useUploadStatementTypeTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => api.uploadStatementTypeTemplate(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statement-types"] })
    },
  })
}

export function useDeleteStatementTypeTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteStatementTypeTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statement-types"] })
    },
  })
}

export function useStatementTypeOnlyOfficeConfig(id: number | null, mode: "edit" | "view" = "edit") {
  return useQuery({
    queryKey: ["onlyoffice-config", "statement-template", id, mode],
    queryFn: () => api.fetchStatementTypeOnlyOfficeConfig(id!, mode),
    enabled: !!id && id > 0,
  })
}
