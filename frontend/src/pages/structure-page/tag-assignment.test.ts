import { describe, expect, it, vi } from "vitest"
import { createTagAssignmentHandlers } from "./tag-assignment"

describe("createTagAssignmentHandlers", () => {
  it("routes employee tag actions to employee handlers", () => {
    const assignDepartmentTag = vi.fn()
    const unassignDepartmentTag = vi.fn()
    const assignEmployeeTag = vi.fn()
    const unassignEmployeeTag = vi.fn()

    const handlers = createTagAssignmentHandlers({
      assignDepartmentTag,
      unassignDepartmentTag,
      assignEmployeeTag,
      unassignEmployeeTag,
    })

    handlers.employee.assign(631, 10)
    handlers.employee.unassign(631, 10)

    expect(assignEmployeeTag).toHaveBeenCalledWith(631, 10)
    expect(unassignEmployeeTag).toHaveBeenCalledWith(631, 10)
    expect(assignDepartmentTag).not.toHaveBeenCalled()
    expect(unassignDepartmentTag).not.toHaveBeenCalled()
  })
})
