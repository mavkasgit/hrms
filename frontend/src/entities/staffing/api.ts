import axios from "@/shared/api/axios"
import type { StaffingDocument, StaffingCurrentResponse } from "./types"
import type { OnlyOfficeConfig } from "@/entities/order/onlyofficeTypes"

export async function getStaffingHistory(): Promise<StaffingDocument[]> {
  const { data } = await axios.get<StaffingDocument[]>("/staffing")
  return data
}

export async function getCurrentStaffing(): Promise<StaffingCurrentResponse> {
  const { data } = await axios.get<StaffingCurrentResponse>("/staffing/current")
  return data
}

export async function uploadStaffingDocument(file: File): Promise<StaffingDocument> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await axios.post<StaffingDocument>("/staffing/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function fetchStaffingOnlyOfficeConfig(
  docId: number,
  mode: "edit" | "view" = "view"
): Promise<OnlyOfficeConfig> {
  const { data } = await axios.get<OnlyOfficeConfig>(`/staffing/${docId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}
