import { useEffect } from "react"
import type { Employee } from "@/entities/employee/types"
import { buildEmployeePlaceholders } from "../autoFillConfig"

/**
 * Универсальный хук автозаполнения полей из данных сотрудника.
 * Заполняет ВСЕ возможные плейсхолдеры для ЛЮБОГО типа документа.
 * Конфигурация берется из autoFillConfig.ts — обновлять только там.
 */
export function useAutoFillFields(
  employee: Employee | null,
  _typeCode: string | undefined, // оставлен для обратной совместимости, не используется
  extraFields: Record<string, string | number>,
  setExtraFields: React.Dispatch<React.SetStateAction<Record<string, string | number>>>,
) {
  useEffect(() => {
    if (!employee) return

    const autoFilled = buildEmployeePlaceholders(employee)

    // Не перезаписываем уже заполненные поля
    const filtered: Record<string, string> = {}
    for (const [key, value] of Object.entries(autoFilled)) {
      if (!extraFields[key]) filtered[key] = value
    }

    if (Object.keys(filtered).length > 0) {
      setExtraFields((prev) => ({ ...prev, ...filtered }))
    }
  }, [employee, extraFields, setExtraFields])
}

