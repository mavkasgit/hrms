/* Теги */
export interface TagRef {
  id: number
  name: string
  color?: string
}

/* Сотрудники в узле */
export interface GraphEmployee {
  id: number
  name: string
  position_name?: string
  tags: TagRef[]
}

/* Узел графа — подразделение */
export interface GraphNode {
  id: number
  name: string
  short_name?: string
  rank: number
  color?: string
  icon?: string
  head_employee_id?: number
  head_employee_name?: string
  tags: TagRef[]
  employee_count: number
  employees: GraphEmployee[]
}

/* Ребро графа — связь */
export interface GraphEdge {
  head_id: number
  child_id: number
  relation_type: "vertical" | "matrix" | "horizontal"
}

/* Ответ графа */
export interface DepartmentGraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/* Плоский список для селектов */
export interface FlatDepartmentNode {
  id: number
  name: string
  short_name?: string
  rank: number
  color?: string
  icon?: string
  head_employee_id?: number
  head_employee_name?: string
}

/* CRUD */
export interface DepartmentCreate {
  name: string
  short_name?: string
  color?: string
  icon?: string
  head_employee_id?: number
  sort_order?: number
  rank?: number
}

export interface DepartmentUpdate {
  name?: string
  short_name?: string
  color?: string
  icon?: string
  head_employee_id?: number
  sort_order?: number
  rank?: number
}

/* Связи */
export interface DepartmentLinkCreate {
  child_id: number
  relation_type?: "vertical" | "matrix" | "horizontal"
}

export interface DepartmentLinkResponse {
  head_id: number
  child_id: number
  relation_type: string
}

/* Теги подразделений */
export interface DepartmentTagAssign {
  tag_id: number
}

export interface DepartmentTagResponse {
  department_id: number
  tag_id: number
}

/* Старые типы для обратной совместимости (deprecated, удалим позже) */
export interface DepartmentEmployee {
  id: number
  name: string
  position_name?: string
}

export interface DepartmentNode {
  id: number
  name: string
  short_name?: string
  parent_id?: number
  employee_count: number
  children: DepartmentNode[]
  employees: DepartmentEmployee[]
}

export interface DepartmentListResponse {
  items: DepartmentNode[]
}
