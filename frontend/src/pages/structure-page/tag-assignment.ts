type TagActionHandler = (entityId: number, tagId: number) => void

type TagAssignmentDeps = {
  assignDepartmentTag: TagActionHandler
  unassignDepartmentTag: TagActionHandler
  assignEmployeeTag: TagActionHandler
  unassignEmployeeTag: TagActionHandler
}

export function createTagAssignmentHandlers(deps: TagAssignmentDeps) {
  return {
    department: {
      assign: (deptId: number, tagId: number) => deps.assignDepartmentTag(deptId, tagId),
      unassign: (deptId: number, tagId: number) => deps.unassignDepartmentTag(deptId, tagId),
    },
    employee: {
      assign: (employeeId: number, tagId: number) => deps.assignEmployeeTag(employeeId, tagId),
      unassign: (employeeId: number, tagId: number) => deps.unassignEmployeeTag(employeeId, tagId),
    },
  }
}
