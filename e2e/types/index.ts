/**
 * TypeScript типы для e2e HRMS.
 */

// ============================================================================
// EMPLOYEES
// ============================================================================

export type Gender = 'М' | 'Ж'
export type PaymentForm = 'Повременная' | 'Сдельная'
export type EmployeeStatus = 'active' | 'archived' | 'all' | 'deleted'

export interface Employee {
  id: number
  tab_number: number | null
  name: string
  department_id: number
  position_id: number
  department?: { id: number; name: string }
  position?: { id: number; name: string }
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

export interface EmployeeFormData {
  name: string
  gender?: Gender
  birth_date?: string
  tab_number?: number
  department_id?: number
  position_id?: number
  department_name?: string
  position_name?: string
  hire_date?: string
  contract_start?: string
  contract_end?: string
  citizenship?: boolean
  residency?: boolean
  pensioner?: boolean
  payment_form?: PaymentForm
  rate?: number
  personal_number?: string
  insurance_number?: string
  passport_number?: string
  additional_vacation_days?: number
}

// ============================================================================
// DEPARTMENTS
// ============================================================================

export interface Department {
  id: number
  name: string
  short_name: string | null
  color: string | null
  icon: string | null
  rank: number
  head_employee_id: number | null
  head_employee_name: string | null
  sort_order?: number
  employee_count?: number
}

export interface DepartmentFormData {
  name: string
  short_name?: string
  sort_order?: number
  icon?: string
  color?: string
}

// ============================================================================
// POSITIONS
// ============================================================================

export interface Position {
  id: number
  name: string
  color: string | null
  icon: string | null
  sort_order: number
  employee_count: number
}

export interface PositionFormData {
  name: string
  sort_order?: number
  icon?: string
  color?: string
}

// ============================================================================
// ORDERS
// ============================================================================

export type OrderTypeName =
  | 'Прием на работу'
  | 'Увольнение'
  | 'Отпуск трудовой'
  | 'Отпуск за свой счет'
  | 'Больничный'
  | 'Перевод'
  | 'Продление контракта'

export type OrderTypeCode =
  | 'hire'
  | 'dismissal'
  | 'transfer'
  | 'contract_extension'
  | 'vacation_paid'
  | 'vacation_unpaid'

export interface OrderTypeRecord {
  id: number
  code: OrderTypeCode | string
  name: OrderTypeName | string
  is_active: boolean
  show_in_orders_page: boolean
  template_filename?: string | null
  field_schema?: Array<{ key: string; label: string; type: string; required: boolean }>
}

export interface OrderExtraFields {
  hire_date?: string
  contract_end?: string
  probation_end?: string
  termination_date?: string
  vacation_start?: string
  vacation_end?: string
  vacation_days?: number
  transfer_date?: string
  transfer_reason?: string
  new_contract_end?: string
  new_probation_end?: string
}

export interface Order {
  id: number
  order_number: string
  order_type_id: number
  order_type_name: string
  order_type_code: string
  employee_id: number
  employee_name: string
  order_date: string
  extra_fields: OrderExtraFields
  created_date?: string
  file_url?: string
  file_path?: string
}

export interface OrderFormData {
  employee_id: number
  employee_name?: string
  order_type_id?: number
  order_type?: OrderTypeName
  order_date: string
  order_number?: string
  extra_fields: OrderExtraFields
}

// ============================================================================
// VACATIONS
// ============================================================================

export type VacationType = 'Трудовой' | 'За свой счет'

export interface Vacation {
  id: number
  employee_id: number
  start_date: string
  end_date: string
  days_count: number
  vacation_type: VacationType
  order_date: string
  order_number?: string
  created_at: string
}

export interface VacationFormData {
  employee_id: number
  start_date: string
  end_date: string
  vacation_type: VacationType
  order_date?: string
  order_number?: string
}

// ============================================================================
// VACATION PERIODS
// ============================================================================

export interface VacationPeriod {
  period_id: number
  year_number: number
  period_start: string
  period_end: string
  main_days: number
  additional_days: number
  total_days: number
  used_days: number
  remaining_days: number
  is_closed: boolean
}

export interface VacationBalance {
  employee_id: number
  available_days: number
  used_days: number
  remaining_days: number
  vacation_type_breakdown: Record<string, number>
}

// ============================================================================
// HOLIDAYS
// ============================================================================

export interface Holiday {
  id: number
  date: string
  name: string
  day_of_week: string
  is_weekend: boolean
  year: number
}

export interface HolidayFormData {
  date: string
  name: string
}

// ============================================================================
// TAGS
// ============================================================================

export type TagCategory = 'department' | 'position' | 'employee'

export interface Tag {
  id: number
  name: string
  category: TagCategory
  color: string
  usage_count: number
}

export interface TagFormData {
  name: string
  category: TagCategory
  color: string
}

// ============================================================================
// TEMPLATES
// ============================================================================

export interface Template {
  order_type: OrderTypeName
  has_template: boolean
  file_size?: number
  last_modified?: string
  file_url?: string
}

// ============================================================================
// DASHBOARD
// ============================================================================

export interface DashboardStats {
  total_employees: number
  male_count: number
  female_count: number
  average_age: number
  average_experience: number
}

export interface BirthdayEntry {
  employee_id: number
  name: string
  birth_date: string
  age: number
  days_until_birthday: number
}

export interface ExpiringContract {
  employee_id: number
  name: string
  contract_end: string
  days_remaining: number
}

// ============================================================================
// COMMON
// ============================================================================

export interface ApiListResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}

export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
  column: string
  direction: SortDirection
}

export interface PaginationConfig {
  page: number
  per_page: number
}
