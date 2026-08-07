// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"

const mockGet = vi.fn()
vi.mock("@/shared/api/client", () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))

import { revalidateEmployeeAndType, type RestorableType } from "./revalidateEmployeeAndType"

const EMPLOYEE = { id: 1, full_name: "Иван Иванов" }

const TYPES: RestorableType[] = [
  { id: 1, name: "Активный", is_active: true },
  { id: 2, name: "Неактивный", is_active: false },
]

let queryClient: QueryClient

beforeEach(() => {
  mockGet.mockClear()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  })
})

describe("revalidateEmployeeAndType", () => {
  it("загружает сотрудника по id и проставляет активный тип", async () => {
    mockGet.mockResolvedValueOnce({ data: EMPLOYEE })
    const setEmployee = vi.fn()
    const setTypeId = vi.fn()
    const setTypeSearch = vi.fn()

    const changed = revalidateEmployeeAndType({
      queryClient,
      employeeId: 1,
      typeId: 1,
      types: TYPES,
      selectedTypeId: null,
      setEmployee,
      setTypeId,
      setTypeSearch,
      extraFields: {},
      setExtraFields: vi.fn(),
    })

    expect(changed).toBe(true)
    expect(setTypeId).toHaveBeenCalledWith(1)
    expect(setTypeSearch).toHaveBeenCalledWith("Активный")
    await vi.waitFor(() => expect(setEmployee).toHaveBeenCalledWith(EMPLOYEE))
  })

  it("возвращает false, если тип не изменился", () => {
    const setTypeId = vi.fn()
    const setTypeSearch = vi.fn()

    const changed = revalidateEmployeeAndType({
      queryClient,
      employeeId: null,
      typeId: 1,
      types: TYPES,
      selectedTypeId: 1,
      setEmployee: vi.fn(),
      setTypeId,
      setTypeSearch,
      extraFields: {},
      setExtraFields: vi.fn(),
    })

    expect(changed).toBe(false)
    expect(setTypeId).toHaveBeenCalledWith(1)
    expect(setTypeSearch).toHaveBeenCalledWith("Активный")
  })

  it("не проставляет неактивный тип из черновика, если типы загружены", () => {
    const setTypeId = vi.fn()
    const setTypeSearch = vi.fn()

    const changed = revalidateEmployeeAndType({
      queryClient,
      employeeId: null,
      typeId: 2,
      types: TYPES,
      selectedTypeId: null,
      setEmployee: vi.fn(),
      setTypeId,
      setTypeSearch,
      extraFields: {},
      setExtraFields: vi.fn(),
    })

    expect(changed).toBe(false)
    expect(setTypeId).not.toHaveBeenCalled()
    expect(setTypeSearch).not.toHaveBeenCalled()
  })

  it("фолбэк на id из черновика, если типы ещё не загрузились", () => {
    const setTypeId = vi.fn()
    const setTypeSearch = vi.fn()

    const changed = revalidateEmployeeAndType({
      queryClient,
      employeeId: null,
      typeId: 5,
      types: [],
      selectedTypeId: null,
      setEmployee: vi.fn(),
      setTypeId,
      setTypeSearch,
      extraFields: {},
      setExtraFields: vi.fn(),
    })

    expect(changed).toBe(true)
    expect(setTypeId).toHaveBeenCalledWith(5)
    expect(setTypeSearch).not.toHaveBeenCalled()
  })

  it("проставляет extra_fields, если они не пусты", () => {
    const setExtraFields = vi.fn()

    revalidateEmployeeAndType({
      queryClient,
      employeeId: null,
      typeId: 1,
      types: TYPES,
      selectedTypeId: 1,
      setEmployee: vi.fn(),
      setTypeId: vi.fn(),
      setTypeSearch: vi.fn(),
      extraFields: { contract_number: "1" },
      setExtraFields,
    })

    expect(setExtraFields).toHaveBeenCalledWith({ contract_number: "1" })
  })

  it("не проставляет пустые extra_fields", () => {
    const setExtraFields = vi.fn()

    revalidateEmployeeAndType({
      queryClient,
      employeeId: null,
      typeId: 1,
      types: TYPES,
      selectedTypeId: 1,
      setEmployee: vi.fn(),
      setTypeId: vi.fn(),
      setTypeSearch: vi.fn(),
      extraFields: {},
      setExtraFields,
    })

    expect(setExtraFields).not.toHaveBeenCalled()
  })

  it("не загружает сотрудника и не трогает тип, если в черновике их нет", () => {
    const changed = revalidateEmployeeAndType({
      queryClient,
      employeeId: null,
      typeId: null,
      types: TYPES,
      selectedTypeId: null,
      setEmployee: vi.fn(),
      setTypeId: vi.fn(),
      setTypeSearch: vi.fn(),
      extraFields: {},
      setExtraFields: vi.fn(),
    })

    expect(changed).toBe(false)
    expect(mockGet).not.toHaveBeenCalled()
  })
})
