// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"

const mockGet = vi.fn()
vi.mock("@/shared/api/axios", () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))

import { fetchDraftEmployee, hydrateDraftEmployees, toDraftEmployeeRefs } from "./groupDraft"

const EMPLOYEE = { id: 1, full_name: "Иван Иванов" }

let queryClient: QueryClient

beforeEach(() => {
  mockGet.mockClear()
  queryClient = new QueryClient({
    // staleTime как в приложении (main.tsx: 30s) — иначе второй fetchQuery
    // считает данные устаревшими и дедупликацию не проверить
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  })
})

describe("toDraftEmployeeRefs", () => {
  it("проецирует строки групповой формы в компактный список {employee_id, vacation_days}", () => {
    expect(toDraftEmployeeRefs([
      { employee_id: 1, vacation_days: 7 },
      { employee_id: 2, vacation_days: 3 },
    ])).toEqual([
      { employee_id: 1, vacation_days: 7 },
      { employee_id: 2, vacation_days: 3 },
    ])
  })
})

describe("fetchDraftEmployee", () => {
  it("возвращает сотрудника по id через кеш react-query", async () => {
    mockGet.mockResolvedValueOnce({ data: EMPLOYEE })
    await expect(fetchDraftEmployee(queryClient, 1)).resolves.toEqual(EMPLOYEE)
    expect(mockGet).toHaveBeenCalledWith("/employees/1")
  })

  it("дедуплицирует повторный запрос через кеш (второй вызов без сети)", async () => {
    mockGet.mockResolvedValueOnce({ data: EMPLOYEE })
    await fetchDraftEmployee(queryClient, 1)
    await fetchDraftEmployee(queryClient, 1)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it("возвращает null, если сотрудник удалён (запрос упал)", async () => {
    mockGet.mockRejectedValueOnce(new Error("404"))
    await expect(fetchDraftEmployee(queryClient, 1)).resolves.toBeNull()
  })
})

describe("hydrateDraftEmployees", () => {
  it("подгружает сотрудников по id", async () => {
    mockGet.mockResolvedValueOnce({ data: { ...EMPLOYEE, id: 1 } })
    mockGet.mockResolvedValueOnce({ data: { ...EMPLOYEE, id: 2 } })

    const rows = await hydrateDraftEmployees(queryClient, [
      { employee_id: 1, vacation_days: 7 },
      { employee_id: 2, vacation_days: 3 },
    ])

    expect(rows).toEqual([
      { employee_id: 1, vacation_days: 7, employee: { ...EMPLOYEE, id: 1 } },
      { employee_id: 2, vacation_days: 3, employee: { ...EMPLOYEE, id: 2 } },
    ])
    expect(mockGet).toHaveBeenCalledTimes(2)
  })
})
