import type { Employee } from "@/entities/employee/types"

/**
 * Единый источник правды для плейсхолдеров — backend:
 * app/services/template_variables_service.py → ALL_TEMPLATE_VARIABLES
 *
 * Этот файл содержит ТОЛЬКО логику: какие поля сотрудника → в какие плейсхолдеры
 * и как их трансформировать. Названия плейсхолдеров берутся с бэкенда.
 */

/**
 * Маппинг: поле сотрудника → генератор плейсхолдера
 * Ключ — имя поля в Employee (или специальное имя),
 * Значение — массив плейсхолдеров которые можно из него сгенерировать.
 */
export const AUTO_FILL_RULES: Array<{
  /** Какие плейсхолдеры заполняются (должны совпадать с backend ALL_TEMPLATE_VARIABLES) */
  keys: string[]
  /** Как получить значения из данных сотрудника */
  build: (empData: Record<string, unknown>) => Record<string, string>
}> = [
  {
    keys: [
      "full_name",
      "short_name",
      "last_name",
      "first_name",
      "middle_name",
      "full_name_upper",
      "full_name_title",
      "full_name_last_caps",
      "last_name_upper",
      "initials_before",
      "last_name_then_initials",
      "initials",
    ],
    build: (empData) => {
      const name = empData.name as string | undefined
      if (!name) return {}

      const parts = name.split(" ")
      const lastName = parts[0] || ""
      const firstName = parts[1] || ""
      const middleName = parts[2] || ""
      const initials = parts.slice(1).map(p => p[0]).join(".")
      const initialsUnderscore = parts.slice(1).map(p => p[0]).join("_")

      return {
        full_name: name,
        short_name: `${lastName} ${initials}`.trim(),
        last_name: lastName,
        first_name: firstName,
        middle_name: middleName,
        full_name_upper: name.toUpperCase(),
        full_name_title: name
          .split(" ")
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" "),
        full_name_last_caps: `${lastName.toUpperCase()} ${firstName} ${middleName}`.trim(),
        last_name_upper: lastName.toUpperCase(),
        initials_before: `${initials}.${lastName}`.trim(),
        last_name_then_initials: `${lastName} ${firstName[0] ? firstName[0] + '.' : ''}${middleName[0] ? middleName[0] + '.' : ''}`.trim(),
        initials: initialsUnderscore,
      }
    },
  },
  {
    keys: ["oznak", "oznak_gender"],
    build: (empData) => {
      const gender = empData.gender as string | undefined
      if (!gender) return {}
      const oznak = gender === "female" ? "ознакомлена" : "ознакомлен"
      return { oznak, oznak_gender: oznak }
    },
  },
  {
    keys: ["hire_date", "hire_order_date", "contract_start"],
    build: (empData) => {
      // hire_date — главное поле. contract_start — зеркало:
      // если в БД есть hire_date → берём его; иначе если есть contract_start → берём его.
      const hireD = isoDate(empData.hire_date)
      const contractStartD = isoDate(empData.contract_start)
      const date = hireD || contractStartD
      if (!date) return {}
      return {
        hire_date: date,
        hire_order_date: date,
        contract_start: date,
      }
    },
  },
  {
    keys: ["contract_end"],
    build: (empData) => {
      const d = isoDate(empData.contract_end)
      return d ? { contract_end: d } : {}
    },
  },
  {
    keys: ["position", "position_cap"],
    build: (empData) => {
      const position = (empData.position as any)?.name
      if (!position) return {}
      return {
        position: position.toLowerCase(),
        position_cap: position.charAt(0).toUpperCase() + position.slice(1).toLowerCase(),
      }
    },
  },
  {
    keys: ["department"],
    build: (empData) => {
      const department = (empData.department as any)?.name
      return department ? { department } : {}
    },
  },
  {
    keys: ["tab_number"],
    build: (empData) => {
      const tab = empData.tab_number
      return tab ? { tab_number: String(tab) } : {}
    },
  },
  {
    keys: [
      "old_contract_start",
      "old_contract_end",
      "new_contract_start",
      "new_contract_end",
      "old_contract_number",
      "new_contract_number",
      "new_contract_years",
    ],
    build: (empData) => {
      const result: Record<string, string> = {}

      if (empData.contract_start) {
        result.old_contract_start = isoDate(empData.contract_start)
      }
      if (empData.contract_end) {
        result.old_contract_end = isoDate(empData.contract_end)

        // Auto-set new contract start to day after old contract end
        const endDate = result.old_contract_end
        if (endDate) {
          const d = new Date(endDate + "T00:00:00")
          d.setDate(d.getDate() + 1)
          result.new_contract_start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        }
      }
      if (empData.contract_number) {
        result.old_contract_number = String(empData.contract_number)
      }

      return result
    },
  },
]

/**
 * Формирует полный набор плейсхолдеров из данных сотрудника.
 * Возвращает объект { placeholder: value } только для тех плейсхолдеров,
 * которые можно заполнить из сотрудника.
 */
export function buildEmployeePlaceholders(employee: Employee): Record<string, string> {
  const empData = employee as unknown as Record<string, unknown>
  const result: Record<string, string> = {}

  for (const rule of AUTO_FILL_RULES) {
    const values = rule.build(empData)
    Object.assign(result, values)
  }

  return result
}

function isoDate(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") return value
  if (value instanceof Date) return value.toISOString().split("T")[0]
  return ""
}
