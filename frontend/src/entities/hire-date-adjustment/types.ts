export interface HireDateAdjustment {
  id: number
  employee_id: number
  adjustment_date: string
  reason: string
  created_by: string
  created_at: string
}

export interface HireDateAdjustmentCreate {
  adjustment_date: string
  reason: string
}
