import { describe, expect, it } from "vitest"
import { departmentTagInvalidationKeys } from "./tag-invalidation"

describe("departmentTagInvalidationKeys", () => {
  it("includes tags query key so right panel refreshes immediately", () => {
    expect(departmentTagInvalidationKeys).toContainEqual(["tags"])
  })
})
