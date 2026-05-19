import axios from "@/shared/api/axios"

export async function forceSaveStatement(statementId: number, documentKey: string) {
  const { data } = await axios.post(`/statements/${statementId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}
