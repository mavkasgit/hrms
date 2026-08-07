import type { QueryClient } from "@tanstack/react-query"
import { fetchEmployee, employeeQueryKey } from "@/entities/employee/api"
import type { Employee } from "@/entities/employee/types"

/**
 * Ссылка на сотрудника в черновике/пейлоаде групповой формы (#28).
 * Единственное место, где описывается проекция строк групповой формы
 * в компактный список {employee_id, vacation_days} — её ключи не должны
 * переписываться в каждой форме.
 */
export interface DraftEmployeeRef {
  employee_id: number
  vacation_days: number
}

/** Строка групповой формы с подгруженным сотрудником. */
export interface HydratedDraftEmployee extends DraftEmployeeRef {
  employee: Employee
}

/** Проекция строк групповой формы в компактный список {employee_id, vacation_days}. */
export function toDraftEmployeeRefs(rows: DraftEmployeeRef[]): DraftEmployeeRef[] {
  return rows.map((e) => ({ employee_id: e.employee_id, vacation_days: e.vacation_days }))
}

/**
 * Через кеш react-query: тот же ключ employeeQueryKey, что у useEmployee, —
 * дедупликация запросов и единая инвалидация.
 * retry: false — сотрудник в черновике мог быть удалён (404): ждать ретраи
 * при восстановлении не нужно, ошибка всё равно кешируется на сессию.
 */
function fetchEmployeeCached(queryClient: QueryClient, employeeId: number): Promise<Employee> {
  return queryClient.fetchQuery({
    queryKey: employeeQueryKey(employeeId),
    queryFn: () => fetchEmployee(employeeId),
    retry: false,
  })
}

/** Подгрузить сотрудника черновика по id; null, если сотрудник удалён. */
export async function fetchDraftEmployee(
  queryClient: QueryClient,
  employeeId: number,
): Promise<Employee | null> {
  try {
    return await fetchEmployeeCached(queryClient, employeeId)
  } catch {
    return null
  }
}

/**
 * Подгрузить сотрудников черновика по id — перевалидация после перезагрузки
 * (в отличии от сохранённой копии объект сотрудника может измениться/быть удалён).
 */
export async function hydrateDraftEmployees(
  queryClient: QueryClient,
  employees: DraftEmployeeRef[],
): Promise<HydratedDraftEmployee[]> {
  return Promise.all(
    employees.map(async (e) => {
      const employee = await fetchEmployeeCached(queryClient, e.employee_id)
      return { employee_id: e.employee_id, vacation_days: e.vacation_days, employee }
    }),
  )
}
