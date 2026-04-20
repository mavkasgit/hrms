import { test as base, expect, type APIRequestContext } from '@playwright/test'
import type {
  Employee,
  Department,
  Position,
  Vacation,
  Order,
  OrderTypeRecord,
  VacationPeriod,
  VacationBalance,
} from '../types'
import { uid } from '../helpers/test-utils'

// =============================================================================
// CONSTANTS
// =============================================================================

export const API_BASE = 'http://127.0.0.1:8000'

// =============================================================================
// RESOURCE TRACKERS
// =============================================================================

type CreatedResources = {
  orders: number[]
  vacations: number[]
  employees: number[]
  positions: number[]
  departments: number[]
}

// =============================================================================
// API OPERATIONS - DEPARTMENTS
// =============================================================================

async function apiCreateDepartment(
  request: APIRequestContext,
  name: string,
  overrides: Record<string, unknown> = {}
): Promise<Department> {
  const resp = await request.post(`${API_BASE}/api/departments`, {
    data: { name, sort_order: 0, ...overrides },
  })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function apiDeleteDepartment(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/departments/${id}`)
  expect([200, 204]).toContain(resp.status())
}

// =============================================================================
// API OPERATIONS - POSITIONS
// =============================================================================

async function apiCreatePosition(
  request: APIRequestContext,
  name: string,
  overrides: Record<string, unknown> = {}
): Promise<Position> {
  const resp = await request.post(`${API_BASE}/api/positions`, {
    data: { name, sort_order: 0, ...overrides },
  })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function apiDeletePosition(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/positions/${id}`)
  expect([200, 204]).toContain(resp.status())
}

// =============================================================================
// API OPERATIONS - EMPLOYEES
// =============================================================================

async function apiCreateEmployee(
  request: APIRequestContext,
  departmentId: number,
  positionId: number,
  overrides: Record<string, unknown> = {}
): Promise<Employee> {
  const u = uid()
  const empData = {
    name: `Сотрудник-${u}`,
    gender: 'М',
    birth_date: '1990-05-15',
    tab_number: Math.floor(100000 + Math.random() * 900000),
    department_id: departmentId,
    position_id: positionId,
    hire_date: '2024-01-15',
    contract_start: '2024-01-15',
    contract_end: '2025-01-14',
    citizenship: true,
    residency: true,
    rate: 25.5,
    payment_form: 'Повременная',
    ...overrides,
  }

  const resp = await request.post(`${API_BASE}/api/employees`, { data: empData })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function apiGetEmployee(request: APIRequestContext, id: number): Promise<Employee> {
  const resp = await request.get(`${API_BASE}/api/employees/${id}`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiUpdateEmployee(
  request: APIRequestContext,
  id: number,
  data: Record<string, unknown>
): Promise<Employee> {
  const resp = await request.put(`${API_BASE}/api/employees/${id}`, { data })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiArchiveEmployee(request: APIRequestContext, id: number): Promise<Employee> {
  const resp = await request.post(`${API_BASE}/api/employees/${id}/archive`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiRestoreEmployee(request: APIRequestContext, id: number): Promise<Employee> {
  const resp = await request.post(`${API_BASE}/api/employees/${id}/restore`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiSearchEmployees(request: APIRequestContext, query: string): Promise<Employee[]> {
  const resp = await request.get(`${API_BASE}/api/employees`, {
    params: { q: query, per_page: 100 },
  })
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

async function apiDeleteEmployee(request: APIRequestContext, id: number): Promise<void> {
  // Сначала удаляем связанные планы отпусков
  const plansResp = await request.get(`${API_BASE}/api/vacation-plans?employee_id=${id}`)
  if (plansResp.status() === 200) {
    const plans = await plansResp.json()
    for (const plan of plans) {
      await request.delete(`${API_BASE}/api/vacation-plans/${plan.id}`)
    }
  }

  const resp = await request.delete(`${API_BASE}/api/employees/${id}?hard=true&confirm=true`)
  expect([200, 204]).toContain(resp.status())
}

// =============================================================================
// API OPERATIONS - VACATIONS
// =============================================================================

async function apiCreateVacation(
  request: APIRequestContext,
  employeeId: number,
  overrides: Record<string, unknown> = {}
): Promise<Vacation> {
  const vacData = {
    employee_id: employeeId,
    start_date: '2024-06-01',
    end_date: '2024-06-14',
    vacation_type: 'Трудовой',
    order_date: '2024-05-25',
    ...overrides,
  }

  const resp = await request.post(`${API_BASE}/api/vacations`, { data: vacData })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function apiDeleteVacation(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/vacations/${id}`)
  expect([200, 204]).toContain(resp.status())
}

async function apiGetVacationBalance(
  request: APIRequestContext,
  employeeId: number
): Promise<VacationBalance> {
  const resp = await request.get(`${API_BASE}/api/vacations/balance`, {
    params: { employee_id: employeeId },
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiGetVacationPeriods(
  request: APIRequestContext,
  employeeId: number
): Promise<VacationPeriod[]> {
  const resp = await request.get(`${API_BASE}/api/vacation-periods`, {
    params: { employee_id: employeeId },
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiGetPeriodBalance(
  request: APIRequestContext,
  periodId: number
): Promise<VacationPeriod> {
  const resp = await request.get(`${API_BASE}/api/vacation-periods/${periodId}/balance`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiClosePeriod(request: APIRequestContext, periodId: number): Promise<VacationPeriod> {
  const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/close`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiPartialClosePeriod(
  request: APIRequestContext,
  periodId: number,
  remainingDays: number
): Promise<VacationPeriod> {
  const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/partial-close`, {
    data: { remaining_days: remainingDays },
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiAdjustPeriod(
  request: APIRequestContext,
  periodId: number,
  additionalDays: number
): Promise<VacationPeriod> {
  const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/adjust`, {
    data: { additional_days: additionalDays },
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

// =============================================================================
// API OPERATIONS - ORDERS
// =============================================================================

async function apiGetOrderTypes(request: APIRequestContext): Promise<OrderTypeRecord[]> {
  const resp = await request.get(`${API_BASE}/api/order-types`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

async function apiGetOrderTypeId(
  request: APIRequestContext,
  params: { code?: string; name?: string; visibleOnly?: boolean }
): Promise<number> {
  const types = await apiGetOrderTypes(request)
  const found = types.find((item) => {
    if (params.visibleOnly && !item.show_in_orders_page) {
      return false
    }
    if (params.code) {
      return item.code === params.code
    }
    if (params.name) {
      return item.name === params.name
    }
    return false
  })
  expect(found, `Order type not found: ${params.code ?? params.name}`).toBeTruthy()
  return found!.id
}

async function apiCreateOrder(
  request: APIRequestContext,
  employeeId: number,
  data: {
    order_type_id?: number
    order_type_code?: string
    order_type_name?: string
    order_date: string
    order_number?: string
    extra_fields?: Record<string, unknown>
  }
): Promise<Order> {
  let orderTypeId = data.order_type_id
  if (!orderTypeId) {
    orderTypeId = await apiGetOrderTypeId(request, {
      code: data.order_type_code,
      name: data.order_type_name,
      visibleOnly: true,
    })
  }

  const orderData = {
    employee_id: employeeId,
    order_type_id: orderTypeId,
    order_date: data.order_date,
    order_number: data.order_number,
    extra_fields: data.extra_fields || {},
  }

  const resp = await request.post(`${API_BASE}/api/orders`, { data: orderData })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function apiCancelOrder(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.put(`${API_BASE}/api/orders/${id}/cancel`)
  expect([200, 204]).toContain(resp.status())
}

async function apiDeleteOrder(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/orders/${id}?hard=true&confirm=true`)
  expect([200, 204]).toContain(resp.status())
}

async function apiGetOrders(
  request: APIRequestContext,
  filters: Record<string, unknown> = {}
): Promise<Order[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    params.append(key, String(value))
  }
  const resp = await request.get(`${API_BASE}/api/orders/all?${params.toString()}`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

// =============================================================================
// FIXTURE TYPES
// =============================================================================

type ApiOperations = {
  uid: () => string
  // Departments
  createDepartment: (name: string, overrides?: Record<string, unknown>) => Promise<Department>
  deleteDepartment: (id: number) => Promise<void>
  // Positions
  createPosition: (name: string, overrides?: Record<string, unknown>) => Promise<Position>
  deletePosition: (id: number) => Promise<void>
  // Employees
  createEmployee: (
    deptId: number,
    posId: number,
    overrides?: Record<string, unknown>
  ) => Promise<Employee>
  getEmployee: (id: number) => Promise<Employee>
  updateEmployee: (id: number, data: Record<string, unknown>) => Promise<Employee>
  archiveEmployee: (id: number) => Promise<Employee>
  restoreEmployee: (id: number) => Promise<Employee>
  searchEmployees: (query: string) => Promise<Employee[]>
  deleteEmployee: (id: number) => Promise<void>
  // Vacations
  createVacation: (empId: number, overrides?: Record<string, unknown>) => Promise<Vacation>
  deleteVacation: (id: number) => Promise<void>
  getVacationBalance: (empId: number) => Promise<VacationBalance>
  getVacationPeriods: (empId: number) => Promise<VacationPeriod[]>
  getPeriodBalance: (periodId: number) => Promise<VacationPeriod>
  closePeriod: (periodId: number) => Promise<VacationPeriod>
  partialClosePeriod: (periodId: number, remainingDays: number) => Promise<VacationPeriod>
  adjustPeriod: (periodId: number, additionalDays: number) => Promise<VacationPeriod>
  // Orders
  getOrderTypes: () => Promise<OrderTypeRecord[]>
  getOrderTypeId: (params: {
    code?: string
    name?: string
    visibleOnly?: boolean
  }) => Promise<number>
  createOrder: (
    empId: number,
    data: {
      order_type_id?: number
      order_type_code?: string
      order_type_name?: string
      order_date: string
      order_number?: string
      extra_fields?: Record<string, unknown>
    }
  ) => Promise<Order>
  cancelOrder: (id: number) => Promise<void>
  deleteOrder: (id: number) => Promise<void>
  getOrders: (filters?: Record<string, unknown>) => Promise<Order[]>
  // Cleanup
  cleanup: () => Promise<void>
}

type CommonFixtures = {
  apiOps: ApiOperations
}

// =============================================================================
// FIXTURE IMPLEMENTATION
// =============================================================================

export const test = base.extend<CommonFixtures>({
  apiOps: async ({ request }, use) => {
    const resources: CreatedResources = {
      orders: [],
      vacations: [],
      employees: [],
      positions: [],
      departments: [],
    }

    const apiOps: ApiOperations = {
      uid,

      // Departments
      createDepartment: async (name: string, overrides?: Record<string, unknown>) => {
        const dept = await apiCreateDepartment(request, name, overrides)
        resources.departments.push(dept.id)
        return dept
      },
      deleteDepartment: async (id: number) => {
        await apiDeleteDepartment(request, id)
      },

      // Positions
      createPosition: async (name: string, overrides?: Record<string, unknown>) => {
        const pos = await apiCreatePosition(request, name, overrides)
        resources.positions.push(pos.id)
        return pos
      },
      deletePosition: async (id: number) => {
        await apiDeletePosition(request, id)
      },

      // Employees
      createEmployee: async (
        deptId: number,
        posId: number,
        overrides?: Record<string, unknown>
      ) => {
        const emp = await apiCreateEmployee(request, deptId, posId, overrides)
        resources.employees.push(emp.id)
        return emp
      },
      getEmployee: async (id: number) => apiGetEmployee(request, id),
      updateEmployee: async (id: number, data: Record<string, unknown>) =>
        apiUpdateEmployee(request, id, data),
      archiveEmployee: async (id: number) => apiArchiveEmployee(request, id),
      restoreEmployee: async (id: number) => apiRestoreEmployee(request, id),
      searchEmployees: async (query: string) => apiSearchEmployees(request, query),
      deleteEmployee: async (id: number) => {
        await apiDeleteEmployee(request, id)
      },

      // Vacations
      createVacation: async (empId: number, overrides?: Record<string, unknown>) => {
        const vac = await apiCreateVacation(request, empId, overrides)
        resources.vacations.push(vac.id)
        return vac
      },
      deleteVacation: async (id: number) => {
        await apiDeleteVacation(request, id)
      },
      getVacationBalance: async (empId: number) => apiGetVacationBalance(request, empId),
      getVacationPeriods: async (empId: number) => apiGetVacationPeriods(request, empId),
      getPeriodBalance: async (periodId: number) => apiGetPeriodBalance(request, periodId),
      closePeriod: async (periodId: number) => apiClosePeriod(request, periodId),
      partialClosePeriod: async (periodId: number, remainingDays: number) =>
        apiPartialClosePeriod(request, periodId, remainingDays),
      adjustPeriod: async (periodId: number, additionalDays: number) =>
        apiAdjustPeriod(request, periodId, additionalDays),

      // Orders
      getOrderTypes: async () => apiGetOrderTypes(request),
      getOrderTypeId: async (params: { code?: string; name?: string; visibleOnly?: boolean }) =>
        apiGetOrderTypeId(request, params),
      createOrder: async (
        empId: number,
        data: {
          order_type_id?: number
          order_type_code?: string
          order_type_name?: string
          order_date: string
          order_number?: string
          extra_fields?: Record<string, unknown>
        }
      ) => {
        const order = await apiCreateOrder(request, empId, data)
        resources.orders.push(order.id)
        return order
      },
      cancelOrder: async (id: number) => apiCancelOrder(request, id),
      deleteOrder: async (id: number) => apiDeleteOrder(request, id),
      getOrders: async (filters?: Record<string, unknown>) => apiGetOrders(request, filters),

      // Cleanup
      cleanup: async () => {
        // Cleanup в правильном порядке: orders -> vacations -> employees -> positions -> departments
        for (const orderId of [...resources.orders].reverse()) {
          await apiDeleteOrder(request, orderId).catch(() => {})
        }
        resources.orders = []

        for (const vacId of [...resources.vacations].reverse()) {
          await apiDeleteVacation(request, vacId).catch(() => {})
        }
        resources.vacations = []

        for (const empId of [...resources.employees].reverse()) {
          await apiDeleteEmployee(request, empId).catch(() => {})
        }
        resources.employees = []

        for (const posId of [...resources.positions].reverse()) {
          await apiDeletePosition(request, posId).catch(() => {})
        }
        resources.positions = []

        for (const deptId of [...resources.departments].reverse()) {
          await apiDeleteDepartment(request, deptId).catch(() => {})
        }
        resources.departments = []
      },
    }

    await use(apiOps)

    // Автоматический cleanup после теста
    // Порядок важен: сначала зависимые сущности (orders, vacations),
    // потом employees, затем positions и departments
    for (const orderId of [...resources.orders].reverse()) {
      await apiDeleteOrder(request, orderId).catch(() => {})
    }

    for (const vacId of [...resources.vacations].reverse()) {
      await apiDeleteVacation(request, vacId).catch(() => {})
    }

    for (const empId of [...resources.employees].reverse()) {
      await apiDeleteEmployee(request, empId).catch(() => {})
    }

    for (const posId of [...resources.positions].reverse()) {
      await apiDeletePosition(request, posId).catch(() => {})
    }

    for (const deptId of [...resources.departments].reverse()) {
      await apiDeleteDepartment(request, deptId).catch(() => {})
    }
  },
})

export { expect } from '@playwright/test'
