import { test as base, expect } from '@playwright/test'
import type { OrderTypeRecord } from '../types'

export type DepartmentData = {
  id: number
  name: string
  short_name?: string
  sort_order: number
}

export type PositionData = {
  id: number
  name: string
  sort_order: number
}

export type EmployeeData = {
  id: number
  name: string
  gender: string
  birth_date: string
  tab_number: number
  department_id: number
  position_id: number
  hire_date: string
  contract_start: string
  contract_end: string
  citizenship: boolean
  residency: boolean
  rate: number
  payment_form: string
}

export type VacationData = {
  id: number
  employee_id: number
  start_date: string
  end_date: string
  days_count: number
  vacation_type: string
  order_date?: string
}

export type OrderData = {
  id: number
  employee_id: number
  order_type_id: number
  order_type_name: string
  order_type_code: string
  order_date: string
  order_number?: string
  extra_fields?: Record<string, any>
}

const API_BASE = 'http://127.0.0.1:8000'

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function getOrderTypes(request: any): Promise<OrderTypeRecord[]> {
  const resp = await request.get(`${API_BASE}/api/order-types`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

async function getOrderTypeId(
  request: any,
  params: { code?: string; name?: string; visibleOnly?: boolean }
): Promise<number> {
  const types = await getOrderTypes(request)
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

async function createDepartment(
  request: any,
  name: string,
  overrides: Record<string, any> = {}
): Promise<DepartmentData> {
  const resp = await request.post(`${API_BASE}/api/departments`, {
    data: { name, sort_order: 0, ...overrides }
  })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function createPosition(
  request: any,
  name: string,
  overrides: Record<string, any> = {}
): Promise<PositionData> {
  const resp = await request.post(`${API_BASE}/api/positions`, {
    data: { name, sort_order: 0, ...overrides }
  })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function createEmployee(
  request: any,
  departmentId: number,
  positionId: number,
  overrides: Record<string, any> = {}
): Promise<EmployeeData> {
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

async function createVacation(
  request: any,
  employeeId: number,
  overrides: Record<string, any> = {}
): Promise<VacationData> {
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

async function createOrder(
  request: any,
  employeeId: number,
  overrides: Record<string, any> = {}
): Promise<OrderData> {
  const defaultOrderTypeId = await getOrderTypeId(request, { code: 'transfer', visibleOnly: true })
  const orderData = {
    employee_id: employeeId,
    order_type_id: defaultOrderTypeId,
    order_date: '2024-06-15',
    ...overrides,
  }

  const resp = await request.post(`${API_BASE}/api/orders`, { data: orderData })
  console.log('[DEBUG] Order create status:', resp.status())
  console.log('[DEBUG] Order create body:', await resp.text())
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function deleteDepartment(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/departments/${id}`)
  expect([200, 204]).toContain(resp.status())
}

async function deletePosition(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/positions/${id}`)
  expect([200, 204]).toContain(resp.status())
}

async function deleteEmployee(request: any, id: number): Promise<void> {
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

async function deleteVacation(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/vacations/${id}`)
  expect([200, 204]).toContain(resp.status())
}

async function deleteOrder(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/orders/${id}?hard=true&confirm=true`)
  expect([200, 204]).toContain(resp.status())
}

type CreatedResources = {
  departments: number[]
  positions: number[]
  employees: number[]
  vacations: number[]
  orders: number[]
}

type CommonFixtures = {
  apiOps: {
    uid: () => string
    createDepartment: (name: string, overrides?: Record<string, any>) => Promise<DepartmentData>
    createPosition: (name: string, overrides?: Record<string, any>) => Promise<PositionData>
    createEmployee: (deptId: number, posId: number, overrides?: Record<string, any>) => Promise<EmployeeData>
    createVacation: (empId: number, overrides?: Record<string, any>) => Promise<VacationData>
    createOrder: (empId: number, overrides?: Record<string, any>) => Promise<OrderData>
    getOrderTypeId: (params: { code?: string; name?: string; visibleOnly?: boolean }) => Promise<number>
  }
}

export const test = base.extend<CommonFixtures>({
  apiOps: async ({ request }, use) => {
    const resources: CreatedResources = {
      departments: [],
      positions: [],
      employees: [],
      vacations: [],
      orders: [],
    }

    await use({
      uid,
      createDepartment: async (name: string, overrides?: Record<string, any>) => {
        const dept = await createDepartment(request, name, overrides)
        resources.departments.push(dept.id)
        return dept
      },
      createPosition: async (name: string, overrides?: Record<string, any>) => {
        const pos = await createPosition(request, name, overrides)
        resources.positions.push(pos.id)
        return pos
      },
      createEmployee: async (deptId: number, posId: number, overrides?: Record<string, any>) => {
        const emp = await createEmployee(request, deptId, posId, overrides)
        resources.employees.push(emp.id)
        return emp
      },
      createVacation: async (empId: number, overrides?: Record<string, any>) => {
        const vac = await createVacation(request, empId, overrides)
        resources.vacations.push(vac.id)
        return vac
      },
      createOrder: async (empId: number, overrides?: Record<string, any>) => {
        const order = await createOrder(request, empId, overrides)
        resources.orders.push(order.id)
        return order
      },
      getOrderTypeId: async (params: { code?: string; name?: string; visibleOnly?: boolean }) => {
        return getOrderTypeId(request, params)
      },
    })

    for (const orderId of resources.orders) {
      await deleteOrder(request, orderId).catch(() => {})
    }
    for (const vacationId of resources.vacations) {
      await deleteVacation(request, vacationId).catch(() => {})
    }
    for (const empId of resources.employees) {
      await deleteEmployee(request, empId).catch(() => {})
    }
    for (const posId of resources.positions) {
      await deletePosition(request, posId).catch(() => {})
    }
    for (const deptId of resources.departments) {
      await deleteDepartment(request, deptId).catch(() => {})
    }
  }
})

export { expect } from '@playwright/test'
