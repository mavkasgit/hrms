export interface Employee {
  id: number
  tab_number: number | null
  name: string
  department: string
  position: string
  hire_date: string | null
  birth_date: string | null
  gender: string | null
  citizenship: boolean
  residency: boolean
  pensioner: boolean
  payment_form: string | null
  rate: number | null
  contract_start: string | null
  contract_end: string | null
  personal_number: string | null
  insurance_number: string | null
  passport_number: string | null
  additional_vacation_days: number
  created_at: string
  updated_at: string | null
  is_archived: boolean
  terminated_date: string | null
  termination_reason: string | null
  archived_by: string | null
  archived_at: string | null
  is_deleted: boolean
}

export interface EmployeeListResponse {
  items: Employee[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface EmployeeCreate {
  name: string
  department: string
  position: string
  tab_number?: number | null
  hire_date?: string | null
  birth_date?: string | null
  gender?: string | null
  citizenship?: boolean
  residency?: boolean
  pensioner?: boolean
  payment_form?: string | null
  rate?: number | null
  contract_start?: string | null
  contract_end?: string | null
  personal_number?: string | null
  insurance_number?: string | null
  passport_number?: string | null
  additional_vacation_days?: number
}

export interface EmployeeUpdate {
  name?: string
  department?: string
  position?: string
  hire_date?: string | null
  birth_date?: string | null
  gender?: string | null
  citizenship?: boolean
  residency?: boolean
  pensioner?: boolean
  payment_form?: string | null
  rate?: number | null
  contract_start?: string | null
  contract_end?: string | null
  personal_number?: string | null
  insurance_number?: string | null
  passport_number?: string | null
  additional_vacation_days?: number
}

export interface EmployeeAuditLog {
  id: number
  employee_id: number
  action: string
  changed_fields: Record<string, { old: string; new: string }> | null
  performed_by: string | null
  performed_at: string
  reason: string | null
}

export type EmployeeStatus = "active" | "archived" | "all" | "deleted"
