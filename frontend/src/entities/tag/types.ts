export interface Tag {
  id: number
  name: string
  category?: string
  color?: string
  sort_order: number
  employee_count: number
}

export interface TagCreate {
  name: string
  category?: string
  color?: string
  sort_order?: number
}

export interface TagUpdate {
  name?: string
  category?: string
  color?: string
  sort_order?: number
}
