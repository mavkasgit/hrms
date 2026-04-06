export interface DashboardStats {
  total: number
  male_count: number
  female_count: number
  avg_age: number
  avg_tenure: number
}

export interface Birthday {
  id: number
  name: string
  department: string
  birth_date: string
  age: number
  days_until: number
}

export interface ContractExpiring {
  id: number
  name: string
  department: string
  position: string
  contract_end: string
  days_left: number
}

export interface DepartmentCount {
  department: string
  count: number
}

export interface DepartmentPosition {
  position: string
  count: number
}
