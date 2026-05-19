import type { TemplateVariable } from "@/entities/order/types"

const LEFT_CATEGORIES = ["Приказ", "ФИО", "Документ", "Уведомление"]
const RIGHT_BASE_CATEGORIES = ["Заявление", "Работа", "Даты", "Прочее", "Поля типа"]
const KNOWN_CATEGORIES = [...LEFT_CATEGORIES, ...RIGHT_BASE_CATEGORIES]

export function categorizeVariables(variables: TemplateVariable[]) {
  const grouped: Record<string, TemplateVariable[]> = {}
  for (const variable of variables) {
    if (!grouped[variable.category]) grouped[variable.category] = []
    grouped[variable.category].push(variable)
  }

  const otherCategories = Object.keys(grouped).filter(
    (c) => !KNOWN_CATEGORIES.includes(c)
  )

  return {
    leftCategories: LEFT_CATEGORIES,
    rightCategories: [...RIGHT_BASE_CATEGORIES, ...otherCategories],
    grouped,
  }
}
