export interface Position {
  id: number
  name: string
  color?: string
  icon?: string
  sort_order: number
  employee_count: number
}

export interface PositionCreate {
  name: string
  color?: string
  icon?: string
  sort_order?: number
}

export interface PositionUpdate {
  name?: string
  color?: string
  icon?: string
  sort_order?: number
}

export interface PositionListResponse {
  items: Position[]
}
