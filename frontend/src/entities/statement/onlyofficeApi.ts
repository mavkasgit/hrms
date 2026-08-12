import axios from "@/shared/api/client"
import type { OnlyOfficeForceSaveResponse, OnlyOfficeSaveStatusResponse } from "@/entities/order/onlyofficeTypes"

export async function forceSaveStatement(
  statementId: number,
  documentKey: string,
  saveId?: string,
) {
  const { data } = await axios.post<OnlyOfficeForceSaveResponse>(
    `/statements/${statementId}/onlyoffice/forcesave`,
    { document_key: documentKey, save_id: saveId },
    { skipGlobalToast: true },
  )
  return data
}

export async function fetchStatementSaveStatus(statementId: number, saveId: string) {
  const { data } = await axios.get<OnlyOfficeSaveStatusResponse>(
    `/statements/${statementId}/onlyoffice/save-status/${saveId}`,
    { skipGlobalToast: true },
  )
  return data
}

/** Явный commit черновика заявления из редактора (#86): is_draft=False. */
export async function commitStatementDraft(statementId: number) {
  const { data } = await axios.post<{ message: string }>(`/statements/${statementId}/commit`)
  return data
}
