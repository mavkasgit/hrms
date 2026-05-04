export interface Document {
  id: number
  doc_code: string
  original_filename: string
  file_type: string
  uploaded_at: string
  uploaded_by: string | null
  is_current: boolean
}

export interface DocumentCurrentResponse {
  document: Document | null
}
