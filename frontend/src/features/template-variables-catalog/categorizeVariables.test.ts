import { describe, expect, it } from "vitest"
import { categorizeVariables } from "./categorizeVariables"
import type { TemplateVariable } from "@/entities/order/types"

const makeVars = (items: { name: string; category: string }[]): TemplateVariable[] =>
  items.map(({ name, category }) => ({
    key: name.replace(/^\{|\}$/g, ""),
    name,
    displayName: name,
    category,
    description: `desc for ${name}`,
  }))

describe("categorizeVariables", () => {
  it("places known categories in the correct columns", () => {
    const variables = makeVars([
      { name: "{order_number}", category: "Приказ" },
      { name: "{short_name}", category: "ФИО" },
      { name: "{doc_date}", category: "Даты" },
      { name: "{work_position}", category: "Работа" },
      { name: "{extra_field}", category: "Прочее" },
      { name: "{statement_type}", category: "Заявление" },
    ])

    const result = categorizeVariables(variables)

    expect(result.leftCategories).toEqual(["Приказ", "ФИО", "Документ", "Уведомление"])
    expect(result.rightCategories).toContain("Заявление")
    expect(result.rightCategories).toContain("Работа")
    expect(result.rightCategories).toContain("Даты")
    expect(result.rightCategories).toContain("Прочее")
    expect(result.rightCategories).toContain("Поля типа")
  })

  it("does not duplicate known categories in otherCategories", () => {
    const variables = makeVars([
      { name: "{a}", category: "Работа" },
      { name: "{b}", category: "Даты" },
      { name: "{c}", category: "Прочее" },
    ])

    const result = categorizeVariables(variables)

    // None of the known categories should appear in rightCategories beyond the base set
    const rightExtra = result.rightCategories.filter(
      (c) => !["Заявление", "Работа", "Даты", "Прочее", "Поля типа"].includes(c)
    )
    expect(rightExtra).toEqual([])
  })

  it("includes unknown categories at the end of rightCategories", () => {
    const variables = makeVars([
      { name: "{x}", category: "CustomCategory" },
      { name: "{y}", category: "AnotherCategory" },
    ])

    const result = categorizeVariables(variables)

    const baseLen = 5 // Заявление, Работа, Даты, Прочее, Поля типа
    expect(result.rightCategories.length).toBe(baseLen + 2)
    expect(result.rightCategories).toContain("CustomCategory")
    expect(result.rightCategories).toContain("AnotherCategory")
    // Unknown categories should come after the base ones
    expect(result.rightCategories.slice(0, baseLen)).toEqual([
      "Заявление",
      "Работа",
      "Даты",
      "Прочее",
      "Поля типа",
    ])
  })

  it("groups variables by category correctly", () => {
    const variables = makeVars([
      { name: "{a}", category: "Даты" },
      { name: "{b}", category: "Даты" },
      { name: "{c}", category: "Работа" },
    ])

    const result = categorizeVariables(variables)

    expect(result.grouped["Даты"].map((v) => v.name)).toEqual(["{a}", "{b}"])
    expect(result.grouped["Работа"].map((v) => v.name)).toEqual(["{c}"])
  })

  it("handles empty variables list", () => {
    const result = categorizeVariables([])

    expect(result.leftCategories).toHaveLength(4)
    expect(result.rightCategories).toHaveLength(5) // only base categories
    expect(Object.keys(result.grouped)).toHaveLength(0)
  })
})
