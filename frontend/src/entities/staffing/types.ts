export interface StaffingDocument {
  id: number
  original_filename: string
  file_type: string
  uploaded_at: string
  uploaded_by: string | null
  is_current: boolean
}

export interface StaffingCurrentResponse {
  document: StaffingDocument | null
}
