import { useQuery } from "@tanstack/react-query"
import axios from "@/shared/api/axios"
import type { TemplateVariable, TemplateVariablesResponse } from "@/entities/order/types"

export async function fetchUnifiedTemplateVariables(docType?: "order" | "notification" | "statement"): Promise<TemplateVariable[]> {
  const params = docType ? { doc_type: docType } : {}
  const { data } = await axios.get<TemplateVariablesResponse>("/template-variables", { params })
  return data.variables
}

export function useUnifiedTemplateVariables(docType?: "order" | "notification" | "statement") {
  return useQuery({
    queryKey: ["template-variables", docType],
    queryFn: () => fetchUnifiedTemplateVariables(docType),
  })
}
