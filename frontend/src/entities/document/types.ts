export interface Document {
  id: number
  doc_code: string
  original_filename: string
  file_type: string
  uploaded_at: string
  edited_at: string | null
  uploaded_by: string | null
  is_current: boolean
}

export interface DocumentCurrentResponse {
  document: Document | null
}
