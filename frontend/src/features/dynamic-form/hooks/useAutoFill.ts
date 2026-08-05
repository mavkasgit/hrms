import { useEffect, useRef } from "react"
import type { Employee } from "@/entities/employee/types"
import { buildEmployeePlaceholders } from "../autoFillConfig"

/**
 * Универсальный хук автозаполнения полей из данных сотрудника.
 * Заполняет ВСЕ возможные плейсхолдеры для ЛЮБОГО типа документа.
 * Конфигурация берется из autoFillConfig.ts — обновлять только там.
 */
export function useAutoFillFields(
  employee: Employee | null,
  typeCode: string | undefined,
  extraFields: Record<string, string | number>,
  setExtraFields: React.Dispatch<React.SetStateAction<Record<string, string | number>>>,
) {
  // Поля, которые пользователь изменил или очистил вручную — автозаполнение их не трогает.
  const touchedRef = useRef<Set<string>>(new Set())
  // Значения, которые автозаполнение применило в последний раз —
  // по ним отличаем ручные правки пользователя от автозаполнения.
  const appliedRef = useRef<Record<string, string>>({})
  // Контекст автозаполнения: сотрудник + тип приказа. При смене контекста начинаем заново.
  const contextRef = useRef("")
  const contextKey = `${employee?.id ?? ""}:${typeCode ?? ""}`

  // Распознаём ручные правки: если значение поля отличается от того, что автозаполнение
  // применило в последний раз (пользователь изменил или очистил поле) — помечаем «тронутым»,
  // чтобы не перезаполнять его снова.
  useEffect(() => {
    const applied = appliedRef.current
    let changed = false
    for (const [key, appliedValue] of Object.entries(applied)) {
      if (String(extraFields[key] ?? "") !== appliedValue) {
        touchedRef.current.add(key)
        changed = true
      }
    }
    if (changed) touchedRef.current = new Set(touchedRef.current)
  }, [extraFields])

  // Автозаполнение запускается только при смене сотрудника или типа приказа, а НЕ при
  // каждом изменении extraFields — иначе очищенные пользователем поля тут же заполнялись
  // бы заново старыми данными.
  useEffect(() => {
    if (contextRef.current !== contextKey) {
      contextRef.current = contextKey
      touchedRef.current = new Set()
      appliedRef.current = {}
    }
    if (!employee) return

    const autoFilled = buildEmployeePlaceholders(employee)
    const candidates: Record<string, string> = {}
    for (const [key, value] of Object.entries(autoFilled)) {
      if (!touchedRef.current.has(key)) candidates[key] = value
    }
    if (Object.keys(candidates).length === 0) return

    // Запоминаем значения, которые собираемся применить — по ним распознаём ручные правки.
    appliedRef.current = { ...appliedRef.current, ...candidates }

    setExtraFields((prev) => {
      let changed = false
      const next = { ...prev }
      for (const [key, value] of Object.entries(candidates)) {
        if (prev[key] === undefined || prev[key] === "") {
          next[key] = value
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [employee, typeCode, contextKey, setExtraFields])
}

