import axios from "@/shared/api/client"

export async function forceSaveStatement(statementId: number, documentKey: string) {
  const { data } = await axios.post(`/statements/${statementId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}

/** Явный commit черновика заявления из редактора (#86): is_draft=False. */
export async function commitStatementDraft(statementId: number) {
  const { data } = await axios.post<{ message: string }>(`/statements/${statementId}/commit`)
  return data
}
