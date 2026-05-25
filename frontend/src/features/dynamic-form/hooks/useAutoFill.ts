import { useEffect } from "react"
import { nextDay } from "@/shared/utils/date"
import type { Employee } from "@/entities/employee/types"

/**
 * Конфигурация автозаполнения для одного типа документа.
 */
type AutoFillRule = {
  /** Поля сотрудника → ключи в extraFields */
  fromEmployee?: Record<string, string>
  /** Автоматические расчёты: из какого поля → в какое поле */
  autoCalcNextDay?: { from: string; to: string }[]
}

const AUTOFILL_RULES: Record<string, AutoFillRule> = {
  contract_extension: {
    fromEmployee: {
      contract_start: "old_contract_start",
      contract_end: "old_contract_end",
    },
    autoCalcNextDay: [{ from: "old_contract_end", to: "new_contract_start" }],
  },
  hire: {
    fromEmployee: {
      hire_date: "hire_date",
      contract_start: "contract_start",
    },
  },
  contract_expiry: {
    fromEmployee: {
      contract_start: "old_contract_start",
    },
  },
}

function isoDate(value: Date | string | null | undefined): string {
  if (!value) return ""
  if (typeof value === "string") return value
  return new Date(value).toISOString().split("T")[0]
}

/**
 * Универсальный хук автозаполнения полей из данных сотрудника.
 * Правила задаются через AUTOFILL_RULES.
 */
export function useAutoFillFields(
  employee: Employee | null,
  typeCode: string | undefined,
  extraFields: Record<string, string | number>,
  setExtraFields: React.Dispatch<React.SetStateAction<Record<string, string | number>>>,
) {
  useEffect(() => {
    if (!employee || !typeCode) return

    const rule = AUTOFILL_RULES[typeCode]
    if (!rule) return

    const autoFilled: Record<string, string | number> = {}

    // Заполняем из сотрудника
    if (rule.fromEmployee) {
      for (const [empField, targetKey] of Object.entries(rule.fromEmployee)) {
        const empValue = (employee as unknown as Record<string, unknown>)[empField]
        if (empValue && !extraFields[targetKey]) {
          autoFilled[targetKey] = isoDate(empValue as Date | string)
        }
      }
    }

    // Авто-расчёт nextDay
    if (rule.autoCalcNextDay) {
      for (const { from, to } of rule.autoCalcNextDay) {
        const fromValue = extraFields[from] as string | undefined
        if (fromValue && !extraFields[to]) {
          autoFilled[to] = nextDay(fromValue)
        }
      }
    }

    if (Object.keys(autoFilled).length > 0) {
      setExtraFields((prev) => {
        const merged = { ...prev }
        for (const [key, value] of Object.entries(autoFilled)) {
          if (!merged[key]) {
            merged[key] = value
          }
        }
        return merged
      })
    }
  }, [employee, typeCode, extraFields, setExtraFields])
}
