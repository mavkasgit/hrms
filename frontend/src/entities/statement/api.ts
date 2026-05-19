import axios from "@/shared/api/axios"
import type {
  Statement,
  StatementListResponse,
  StatementCreate,
  StatementUpdate,
  StatementType,
} from "./types"
import type { OnlyOfficeConfig } from "@/entities/order/onlyofficeTypes"

// ─── Statements ───

export async function fetchStatements(params: {
  page?: number
  per_page?: number
  date_from?: string
  date_to?: string
  employee_id?: number
  statement_type_id?: number
}): Promise<StatementListResponse> {
  const { data } = await axios.get<StatementListResponse>("/statements", { params })
  return data
}

export async function fetchNextStatementNumber(): Promise<string> {
  const { data } = await axios.get<{ number: string }>("/statements/next-number")
  return data.number
}

export async function fetchStatement(id: number): Promise<Statement> {
  const { data } = await axios.get<Statement>(`/statements/${id}`)
  return data
}

export async function createStatement(payload: StatementCreate): Promise<Statement> {
  const { data } = await axios.post<Statement>("/statements", payload)
  return data
}

export async function updateStatement(id: number, payload: StatementUpdate): Promise<Statement> {
  const { data } = await axios.put<Statement>(`/statements/${id}`, payload)
  return data
}

export async function deleteStatement(id: number): Promise<void> {
  await axios.delete(`/statements/${id}`)
}

export async function fetchStatementOnlyOfficeConfig(
  statementId: number,
  mode: "edit" | "view" = "view"
): Promise<OnlyOfficeConfig> {
  const { data } = await axios.get<OnlyOfficeConfig>(`/statements/${statementId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}

export function openStatementView(statementId: number) {
  window.open(`/statements/${statementId}/view-docx`, "_blank", "noopener,noreferrer")
}

export function openStatementEdit(statementId: number) {
  window.open(`/statements/${statementId}/edit-docx`, "_blank", "noopener,noreferrer")
}

export function openStatementPrint(statementId: number, target = "_blank") {
  const url = `/statements/${statementId}/print`
  if (target === "_blank") {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  window.open(url, target)
}

export function downloadStatementDocx(statementId: number) {
  window.open(`${import.meta.env.VITE_API_URL || "/api"}/statements/${statementId}/download`, "_blank")
}

export async function createStatementDraft(payload: StatementCreate): Promise<{ draft_id: string; statement_id: number }> {
  const { data } = await axios.post("/statements/drafts", payload)
  return data
}

// ─── Statement Types ───

export async function fetchStatementTypes(active_only = false): Promise<StatementType[]> {
  const { data } = await axios.get<StatementType[]>("/statement-types", { params: { active_only } })
  return data
}

export async function fetchStatementType(id: number): Promise<StatementType> {
  const { data } = await axios.get<StatementType>(`/statement-types/${id}`)
  return data
}

export async function createStatementType(payload: Partial<StatementType>): Promise<StatementType> {
  const { data } = await axios.post<StatementType>("/statement-types", payload)
  return data
}

export async function updateStatementType(id: number, payload: Partial<StatementType>): Promise<StatementType> {
  const { data } = await axios.put<StatementType>(`/statement-types/${id}`, payload)
  return data
}

export async function deleteStatementType(id: number): Promise<void> {
  await axios.delete(`/statement-types/${id}`)
}

export async function uploadStatementTypeTemplate(id: number, file: File): Promise<StatementType> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await axios.post<StatementType>(`/statement-types/${id}/template`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function deleteStatementTypeTemplate(id: number): Promise<void> {
  await axios.delete(`/statement-types/${id}/template`)
}

export function downloadStatementTypeTemplate(id: number) {
  window.open(`${import.meta.env.VITE_API_URL || "/api"}/statement-types/${id}/template`, "_blank")
}

// ─── OnlyOffice for statement type templates ───

export async function fetchStatementTypeOnlyOfficeConfig(
  statementTypeId: number,
  mode: "edit" | "view" = "edit"
): Promise<OnlyOfficeConfig> {
  const { data } = await axios.get<OnlyOfficeConfig>(`/statement-types/${statementTypeId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}

export async function forceSaveStatementTypeTemplate(statementTypeId: number, documentKey: string) {
  const { data } = await axios.post<{ message: string }>(`/statement-types/${statementTypeId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}
