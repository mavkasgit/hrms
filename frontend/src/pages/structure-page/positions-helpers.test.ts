import { describe, expect, it } from "vitest"
import { buildEmployeesByPosition } from "./positions-helpers"

describe("buildEmployeesByPosition", () => {
  it("preserves employee tags while grouping by position", () => {
    const grouped = buildEmployeesByPosition([
      {
        id: 42,
        position_id: 7,
        name: "Ivan",
        department: { name: "IT" },
        tags: [{ id: 3, name: "Mentor", color: "#22c55e" }],
      },
    ])

    expect(grouped.get(7)).toBeDefined()
    expect(grouped.get(7)?.[0].tags).toEqual([
      { id: 3, name: "Mentor", color: "#22c55e" },
    ])
  })

  it("uses external employee tags map when employees API has no tags field", () => {
    const grouped = buildEmployeesByPosition(
      [
        {
          id: 77,
          position_id: 9,
          name: "Olga",
          department: { name: "Finance" },
        },
      ],
      new Map([[77, [{ id: 5, name: "Senior", color: "#ef4444" }]]])
    )

    expect(grouped.get(9)?.[0].tags).toEqual([
      { id: 5, name: "Senior", color: "#ef4444" },
    ])
  })
})
