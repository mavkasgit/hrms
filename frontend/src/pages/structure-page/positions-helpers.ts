export type PositionEmployeeTag = {
  id: number
  name: string
  color?: string
}

export type PositionEmployeeInput = {
  id: number
  position_id?: number | null
  name: string
  department?: { name: string }
  tags?: PositionEmployeeTag[]
}

export type PositionEmployeeView = {
  id: number
  name: string
  department?: string
  tags: PositionEmployeeTag[]
}

export function buildEmployeesByPosition(items: PositionEmployeeInput[] | undefined) {
  const map = new Map<number, PositionEmployeeView[]>()

  items?.forEach((emp) => {
    if (!emp.position_id) return
    if (!map.has(emp.position_id)) map.set(emp.position_id, [])

    map.get(emp.position_id)!.push({
      id: emp.id,
      name: emp.name,
      department: emp.department?.name,
      tags: emp.tags ?? [],
    })
  })

  return map
}
