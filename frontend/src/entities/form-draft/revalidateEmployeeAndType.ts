import type { QueryClient } from "@tanstack/react-query"
import type { Employee } from "@/entities/employee/types"
import { fetchDraftEmployee } from "./groupDraft"

/**
 * Структурный минимум типа документа, нужный при ревалидации восстановления:
 * {id, name, is_active}. Порядок: ищем активный тип в актуальном списке;
 * если типы ещё не загрузились — фолбэк на id из черновика.
 */
export interface RestorableType {
  id: number
  name: string
  is_active: boolean
}

export interface RevalidateEmployeeAndTypeParams<T extends RestorableType> {
  queryClient: QueryClient
  /** Сотрудник из черновика: загружается по id (перевалидация после перезагрузки). */
  employeeId: number | null
  /** Тип документа из черновика. */
  typeId: number | null
  /** Актуальный список типов (может быть пуст, если ещё не загрузились). */
  types: T[]
  /** Текущий выбранный тип — для сравнения «изменился ли тип». */
  selectedTypeId: number | null
  setEmployee: (employee: Employee) => void
  setTypeId: (id: number) => void
  setTypeSearch: (name: string) => void
  /** Доп. поля черновика: проставляются целиком, если не пусты. */
  extraFields: Record<string, string | number>
  setExtraFields: (fields: Record<string, string | number>) => void
}

/**
 * Общая ревалидация при восстановлении черновика формы (#76): сотрудник
 * загружается по id через fetchDraftEmployee, тип ищется в актуальном списке
 * с проверкой is_active (фолбэк на id из черновика, если типы ещё не загрузились),
 * extra_fields проставляются целиком. Хосты оставляют только свои сеттеры полей.
 *
 * Возвращает true, если восстановление изменило тип документа — смена типа
 * сбрасывает extra_fields, поэтому хост-сброс пропускается один раз (см.
 * restoreGuardRef в useDraftRecoveryFor).
 */
export function revalidateEmployeeAndType<T extends RestorableType>(
  params: RevalidateEmployeeAndTypeParams<T>,
): boolean {
  const { queryClient, employeeId, typeId, types, selectedTypeId } = params
  let typeChanged = false

  if (employeeId) {
    fetchDraftEmployee(queryClient, employeeId).then((employee) => {
      if (employee) params.setEmployee(employee)
    })
  }

  if (typeId) {
    const type = types.find((t) => t.id === typeId && t.is_active)
    if (type) {
      if (type.id !== selectedTypeId) typeChanged = true
      params.setTypeId(type.id)
      params.setTypeSearch(type.name)
    } else if (types.length === 0) {
      // Типы ещё не загрузились — выставляем id по черновику; layout появится позже
      if (typeId !== selectedTypeId) typeChanged = true
      params.setTypeId(typeId)
    }
  }

  if (params.extraFields && Object.keys(params.extraFields).length > 0) {
    params.setExtraFields(params.extraFields)
  }

  return typeChanged
}
