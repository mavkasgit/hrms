/**
 * apiOps fixture for the e2e suite.
 *
 * Cleanup policy (mandatory):
 * - Every create is tracked; fixture teardown DELETEs in reverse FK order.
 * - Default entity names use prefix `e2e-` + uid (worker-aware when multi-worker).
 * - Create without track = bug — always go through apiOps.create*.
 * - No full DB wipe between tests.
 */
import {
  test as base,
  expect,
  type APIRequestContext,
  type PlaywrightTestArgs,
  type PlaywrightWorkerArgs,
} from '@playwright/test'
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
import { uid, workerPrefix } from '../helpers/test-utils'
import { getAdminTokenFromStorage } from './auth'

// =============================================================================
// CONSTANTS
// =============================================================================

export const API_BASE = process.env.E2E_API_URL
  ? process.env.E2E_API_URL.replace(/\/api$/, '')
  : 'http://127.0.0.1:8011'

// =============================================================================
// RESOURCE TRACKERS
// =============================================================================

type CreatedResources = {
  notifications: number[]
  users: number[]
  tags: number[]
  orders: number[]
  vacations: number[]
  employees: number[]
  positions: number[]
  departments: number[]
}

export type TagRecord = {
  id: number
  name: string
  category?: string | null
  color?: string | null
  sort_order?: number
}

export type UserRecord = {
  id: number
  username: string
  full_name?: string | null
  role?: string
  employee_id?: number | null
}

// =============================================================================
// LOW-LEVEL API HELPERS
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

async function apiCreateEmployee(
  request: APIRequestContext,
  departmentId: number,
  positionId: number,
  overrides: Record<string, unknown> = {}
): Promise<Employee> {
  const u = uid()
  // tab_number: timestamp+noise cuts multi-worker collisions (override via overrides)
  const empData = {
    name: `e2e-emp-${u}`,
    gender: 'М',
    birth_date: '1990-05-15',
    // unique-ish under multi-worker; stay within signed int32-ish range
    tab_number: 100_000_000 + Math.floor(Math.random() * 800_000_000) + (Date.now() % 1000),
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

async function apiDismissEmployee(request: APIRequestContext, id: number): Promise<Employee> {
  const resp = await request.post(`${API_BASE}/api/employees/${id}/dismiss`)
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
  if (![200, 201].includes(resp.status())) {
    throw new Error(`createOrder failed: ${resp.status()} ${await resp.text()}`)
  }
  return resp.json()
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


async function apiGetNotificationTypes(
  request: APIRequestContext,
  activeOnly = true
): Promise<Array<{ id: number; name: string; code: string; is_active?: boolean; field_schema?: Array<{ key: string; required?: boolean; label?: string }> }>> {
  const resp = await request.get(`${API_BASE}/api/notification-types`, {
    params: { active_only: activeOnly ? 'true' : 'false' },
  })
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return Array.isArray(data) ? data : data.items || []
}

async function apiDeleteNotification(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/notifications/${id}`)
  expect([200, 204]).toContain(resp.status())
}

async function apiGetNotifications(
  request: APIRequestContext,
  filters: Record<string, unknown> = {}
): Promise<Array<{ id: number; number?: string | null; employee_id?: number | null; title?: string }>> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) params.append(key, String(value))
  }
  const qs = params.toString()
  const resp = await request.get(`${API_BASE}/api/notifications${qs ? `?${qs}` : ''}`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

async function apiListDepartments(request: APIRequestContext): Promise<Department[]> {
  const resp = await request.get(`${API_BASE}/api/departments`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return Array.isArray(data) ? data : data.items || data.nodes || []
}

async function apiListPositions(request: APIRequestContext): Promise<Position[]> {
  const resp = await request.get(`${API_BASE}/api/positions`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return Array.isArray(data) ? data : data.items || []
}

async function apiCreateTag(
  request: APIRequestContext,
  name: string,
  overrides: Record<string, unknown> = {}
): Promise<TagRecord> {
  const resp = await request.post(`${API_BASE}/api/tags`, {
    data: { name, sort_order: 0, ...overrides },
  })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function apiDeleteTag(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/tags/${id}`)
  expect([200, 204]).toContain(resp.status())
}

async function apiListTags(request: APIRequestContext): Promise<TagRecord[]> {
  const resp = await request.get(`${API_BASE}/api/tags`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return Array.isArray(data) ? data : data.items || []
}

async function apiCreateUser(
  request: APIRequestContext,
  data: {
    username: string
    full_name?: string
    employee_id?: number
    role?: string
    password?: string
  }
): Promise<UserRecord> {
  const resp = await request.post(`${API_BASE}/api/users`, {
    data: {
      role: 'viewer',
      full_name: data.full_name || data.username,
      ...data,
    },
  })
  if (![200, 201].includes(resp.status())) {
    const body = await resp.text().catch(() => '')
    throw new Error(`createUser failed: ${resp.status()} ${body}`)
  }
  return resp.json()
}

async function apiDeleteUser(request: APIRequestContext, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/users/${id}`)
  expect([200, 204]).toContain(resp.status())
}

async function apiGenerateInvite(
  request: APIRequestContext,
  userId: number
): Promise<{ invite_code: string }> {
  const resp = await request.post(`${API_BASE}/api/users/${userId}/generate-invite`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function apiCreateGroupDraft(
  request: APIRequestContext,
  payload: Record<string, unknown>
): Promise<{ draft_id: string; edit_url: string }> {
  const resp = await request.post(`${API_BASE}/api/orders/group-drafts`, {
    data: payload,
  })
  if (![200, 201].includes(resp.status())) {
    const body = await resp.text().catch(() => '')
    throw new Error(`createGroupDraft failed: ${resp.status()} ${body}`)
  }
  return resp.json()
}

async function apiCommitGroupDraft(
  request: APIRequestContext,
  draftId: string
): Promise<unknown> {
  const resp = await request.post(`${API_BASE}/api/orders/group-drafts/${draftId}/commit`)
  if (![200, 201].includes(resp.status())) {
    const body = await resp.text().catch(() => '')
    throw new Error(`commitGroupDraft failed: ${resp.status()} ${body}`)
  }
  return resp.json().catch(() => ({}))
}

// =============================================================================
// FIXTURE TYPES
// =============================================================================

export type ApiOperations = {
  uid: () => string
  // Departments
  createDepartment: (name: string, overrides?: Record<string, unknown>) => Promise<Department>
  deleteDepartment: (id: number) => Promise<void>
  // Positions
  createPosition: (name: string, overrides?: Record<string, unknown>) => Promise<Position>
  deletePosition: (id: number) => Promise<void>
  // Employees
  createEmployee: (
    deptIdOrOverrides: number | Record<string, unknown>,
    posIdOrOverrides?: number | Record<string, unknown>,
    overrides?: Record<string, unknown>
  ) => Promise<Employee>
  getEmployee: (id: number) => Promise<Employee>
  updateEmployee: (id: number, data: Record<string, unknown>) => Promise<Employee>
  dismissEmployee: (id: number) => Promise<Employee>
  restoreEmployee: (id: number) => Promise<Employee>
  searchEmployees: (query: string) => Promise<Employee[]>
  deleteEmployee: (id: number) => Promise<void>
  // Vacations
  createVacation: (empId: number, overrides?: Record<string, unknown>) => Promise<Vacation>
  deleteVacation: (id: number) => Promise<void>
  getVacationBalance: (empId: number) => Promise<VacationBalance>
  getVacationPeriods: (empId: number) => Promise<VacationPeriod[]>
  getBalance: (empId: number) => Promise<VacationBalance>
  getPeriods: (empId: number) => Promise<VacationPeriod[]>
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
  deleteOrder: (id: number) => Promise<void>
  getOrders: (filters?: Record<string, unknown>) => Promise<Order[]>
  // Notifications
  getNotificationTypes: (activeOnly?: boolean) => Promise<
    Array<{
      id: number
      name: string
      code: string
      is_active?: boolean
      field_schema?: Array<{ key: string; required?: boolean; label?: string }>
    }>
  >
  getNotifications: (
    filters?: Record<string, unknown>
  ) => Promise<Array<{ id: number; number?: string | null; employee_id?: number | null; title?: string }>>
  trackNotification: (id: number) => void
  deleteNotification: (id: number) => Promise<void>
  // Tags
  createTag: (name: string, overrides?: Record<string, unknown>) => Promise<TagRecord>
  deleteTag: (id: number) => Promise<void>
  listTags: () => Promise<TagRecord[]>
  trackTag: (id: number) => void
  // Users
  createUser: (data: {
    username: string
    full_name?: string
    employee_id?: number
    role?: string
    password?: string
  }) => Promise<UserRecord>
  deleteUser: (id: number) => Promise<void>
  generateInvite: (userId: number) => Promise<{ invite_code: string }>
  trackUser: (id: number) => void
  // Structure list / track (UI-created entities)
  listDepartments: () => Promise<Department[]>
  listPositions: () => Promise<Position[]>
  trackDepartment: (id: number) => void
  trackPosition: (id: number) => void
  // Group drafts (OO path — commit creates orders; track orders separately)
  createGroupDraft: (
    payload: Record<string, unknown>
  ) => Promise<{ draft_id: string; edit_url: string }>
  commitGroupDraft: (draftId: string) => Promise<unknown>
  // Cleanup
  cleanup: () => Promise<void>
  cleanupEmployee: (id: number) => Promise<void>
}

type ApiFixtures = {
  apiOps: ApiOperations
}

// =============================================================================
// FIXTURE IMPLEMENTATION
// =============================================================================

/**
 * Resolve APIRequestContext with Bearer token from storageState (after setup).
 * Falls back to the project `request` fixture if token file is missing.
 */
async function resolveApiRequest(
  request: APIRequestContext,
  playwright: PlaywrightWorkerArgs['playwright']
): Promise<{ request: APIRequestContext; dispose: () => Promise<void> }> {
  const token = getAdminTokenFromStorage()
  if (!token) {
    return { request, dispose: async () => {} }
  }
  const ctx = await playwright.request.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  })
  return {
    request: ctx,
    dispose: async () => {
      await ctx.dispose()
    },
  }
}

export const test = base.extend<ApiFixtures>({
  apiOps: async (
    { request, playwright }: PlaywrightTestArgs & PlaywrightWorkerArgs,
    use
  ) => {
    const tag = workerPrefix(test.info().parallelIndex)
    const scopedUid = () => uid(tag)

    const { request: apiRequest, dispose } = await resolveApiRequest(request, playwright)

    const resources: CreatedResources = {
      notifications: [],
      users: [],
      tags: [],
      orders: [],
      vacations: [],
      employees: [],
      positions: [],
      departments: [],
    }

    const apiOps: ApiOperations = {
      uid: scopedUid,

      createDepartment: async (name: string, overrides?: Record<string, unknown>) => {
        const dept = await apiCreateDepartment(apiRequest, name, overrides)
        resources.departments.push(dept.id)
        return dept
      },
      deleteDepartment: async (id: number) => {
        await apiDeleteDepartment(apiRequest, id)
      },

      createPosition: async (name: string, overrides?: Record<string, unknown>) => {
        const pos = await apiCreatePosition(apiRequest, name, overrides)
        resources.positions.push(pos.id)
        return pos
      },
      deletePosition: async (id: number) => {
        await apiDeletePosition(apiRequest, id)
      },

      createEmployee: async (
        deptIdOrOverrides: number | Record<string, unknown>,
        posIdOrOverrides?: number | Record<string, unknown>,
        overrides?: Record<string, unknown>
      ) => {
        let deptId: number
        let posId: number
        let employeeOverrides: Record<string, unknown> | undefined

        if (typeof deptIdOrOverrides === 'number') {
          deptId = deptIdOrOverrides
          posId = posIdOrOverrides as number
          employeeOverrides = overrides
        } else {
          const autoOverrides = deptIdOrOverrides
          const autoUid = scopedUid()
          // Auto-seed deps with e2e- prefix + track for teardown
          const dept = await apiCreateDepartment(apiRequest, `e2e-dept-${autoUid}`)
          const pos = await apiCreatePosition(apiRequest, `e2e-pos-${autoUid}`)
          resources.departments.push(dept.id)
          resources.positions.push(pos.id)
          deptId = dept.id
          posId = pos.id
          employeeOverrides = autoOverrides
        }

        const emp = await apiCreateEmployee(apiRequest, deptId, posId, {
          name: `e2e-emp-${scopedUid()}`,
          ...employeeOverrides,
        })
        resources.employees.push(emp.id)
        return emp
      },
      getEmployee: async (id: number) => apiGetEmployee(apiRequest, id),
      updateEmployee: async (id: number, data: Record<string, unknown>) =>
        apiUpdateEmployee(apiRequest, id, data),
      dismissEmployee: async (id: number) => apiDismissEmployee(apiRequest, id),
      restoreEmployee: async (id: number) => apiRestoreEmployee(apiRequest, id),
      searchEmployees: async (query: string) => apiSearchEmployees(apiRequest, query),
      deleteEmployee: async (id: number) => {
        await apiDeleteEmployee(apiRequest, id)
      },

      createVacation: async (empId: number, overrides?: Record<string, unknown>) => {
        const vac = await apiCreateVacation(apiRequest, empId, overrides)
        resources.vacations.push(vac.id)
        return vac
      },
      deleteVacation: async (id: number) => {
        await apiDeleteVacation(apiRequest, id)
      },
      getVacationBalance: async (empId: number) => apiGetVacationBalance(apiRequest, empId),
      getVacationPeriods: async (empId: number) => apiGetVacationPeriods(apiRequest, empId),
      getBalance: async (empId: number) => apiGetVacationBalance(apiRequest, empId),
      getPeriods: async (empId: number) => apiGetVacationPeriods(apiRequest, empId),
      getPeriodBalance: async (periodId: number) => apiGetPeriodBalance(apiRequest, periodId),
      closePeriod: async (periodId: number) => apiClosePeriod(apiRequest, periodId),
      partialClosePeriod: async (periodId: number, remainingDays: number) =>
        apiPartialClosePeriod(apiRequest, periodId, remainingDays),
      adjustPeriod: async (periodId: number, additionalDays: number) =>
        apiAdjustPeriod(apiRequest, periodId, additionalDays),

      getOrderTypes: async () => apiGetOrderTypes(apiRequest),
      getOrderTypeId: async (params: { code?: string; name?: string; visibleOnly?: boolean }) =>
        apiGetOrderTypeId(apiRequest, params),
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
        const order = await apiCreateOrder(apiRequest, empId, data)
        resources.orders.push(order.id)
        return order
      },
      deleteOrder: async (id: number) => apiDeleteOrder(apiRequest, id),
      getOrders: async (filters?: Record<string, unknown>) => apiGetOrders(apiRequest, filters),

      getNotificationTypes: async (activeOnly = true) => apiGetNotificationTypes(apiRequest, activeOnly),
      getNotifications: async (filters?: Record<string, unknown>) =>
        apiGetNotifications(apiRequest, filters),
      trackNotification: (id: number) => {
        if (!resources.notifications.includes(id)) resources.notifications.push(id)
      },
      deleteNotification: async (id: number) => {
        await apiDeleteNotification(apiRequest, id)
        resources.notifications = resources.notifications.filter((x) => x !== id)
      },

      createTag: async (name: string, overrides?: Record<string, unknown>) => {
        const tag = await apiCreateTag(apiRequest, name, overrides)
        resources.tags.push(tag.id)
        return tag
      },
      deleteTag: async (id: number) => {
        await apiDeleteTag(apiRequest, id)
        resources.tags = resources.tags.filter((x) => x !== id)
      },
      listTags: async () => apiListTags(apiRequest),
      trackTag: (id: number) => {
        if (!resources.tags.includes(id)) resources.tags.push(id)
      },

      createUser: async (data) => {
        const user = await apiCreateUser(apiRequest, data)
        resources.users.push(user.id)
        return user
      },
      deleteUser: async (id: number) => {
        await apiDeleteUser(apiRequest, id)
        resources.users = resources.users.filter((x) => x !== id)
      },
      generateInvite: async (userId: number) => apiGenerateInvite(apiRequest, userId),
      trackUser: (id: number) => {
        if (!resources.users.includes(id)) resources.users.push(id)
      },

      listDepartments: async () => apiListDepartments(apiRequest),
      listPositions: async () => apiListPositions(apiRequest),
      trackDepartment: (id: number) => {
        if (!resources.departments.includes(id)) resources.departments.push(id)
      },
      trackPosition: (id: number) => {
        if (!resources.positions.includes(id)) resources.positions.push(id)
      },

      createGroupDraft: async (payload) => apiCreateGroupDraft(apiRequest, payload),
      commitGroupDraft: async (draftId) => apiCommitGroupDraft(apiRequest, draftId),

      // Explicit cleanup (also runs automatically after each test)
      cleanup: async () => {
        // users → notifications → tags → orders → vacations → employees → positions → departments
        for (const userId of [...resources.users].reverse()) {
          await apiDeleteUser(apiRequest, userId).catch(() => {})
        }
        resources.users = []
        for (const notifId of [...resources.notifications].reverse()) {
          await apiDeleteNotification(apiRequest, notifId).catch(() => {})
        }
        resources.notifications = []
        for (const tagId of [...resources.tags].reverse()) {
          await apiDeleteTag(apiRequest, tagId).catch(() => {})
        }
        resources.tags = []
        for (const orderId of [...resources.orders].reverse()) {
          await apiDeleteOrder(apiRequest, orderId).catch(() => {})
        }
        resources.orders = []
        for (const vacId of [...resources.vacations].reverse()) {
          await apiDeleteVacation(apiRequest, vacId).catch(() => {})
        }
        resources.vacations = []
        for (const empId of [...resources.employees].reverse()) {
          await apiDeleteEmployee(apiRequest, empId).catch(() => {})
        }
        resources.employees = []
        for (const posId of [...resources.positions].reverse()) {
          await apiDeletePosition(apiRequest, posId).catch(() => {})
        }
        resources.positions = []
        for (const deptId of [...resources.departments].reverse()) {
          await apiDeleteDepartment(apiRequest, deptId).catch(() => {})
        }
        resources.departments = []
      },
      cleanupEmployee: async (id: number) => {
        await apiDeleteEmployee(apiRequest, id).catch(() => {})
      },
    }

    await use(apiOps)

    // Auto teardown: reverse FK order
    for (const userId of [...resources.users].reverse()) {
      await apiDeleteUser(apiRequest, userId).catch(() => {})
    }
    for (const notifId of [...resources.notifications].reverse()) {
      await apiDeleteNotification(apiRequest, notifId).catch(() => {})
    }
    for (const tagId of [...resources.tags].reverse()) {
      await apiDeleteTag(apiRequest, tagId).catch(() => {})
    }
    for (const orderId of [...resources.orders].reverse()) {
      await apiDeleteOrder(apiRequest, orderId).catch(() => {})
    }
    for (const vacId of [...resources.vacations].reverse()) {
      await apiDeleteVacation(apiRequest, vacId).catch(() => {})
    }
    for (const empId of [...resources.employees].reverse()) {
      await apiDeleteEmployee(apiRequest, empId).catch(() => {})
    }
    for (const posId of [...resources.positions].reverse()) {
      await apiDeletePosition(apiRequest, posId).catch(() => {})
    }
    for (const deptId of [...resources.departments].reverse()) {
      await apiDeleteDepartment(apiRequest, deptId).catch(() => {})
    }

    await dispose()
  },
})

export { expect } from '@playwright/test'

