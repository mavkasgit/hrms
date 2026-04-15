import { test as base, expect } from '@playwright/test'
import type { Order, OrderFormData, OrderExtraFields, OrderType } from '../types'

/**
 * Фикстуры для приказов с автоматической очисткой
 * Включают методы создания, отмены, удаления приказов разных типов
 */

const API_BASE = 'http://127.0.0.1:8000'

/** Генератор уникачного суффикса */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Создание сотрудника для приказов */
async function createEmployeeForOrder(request: any, overrides: Record<string, any> = {}) {
  const u = uid()
  const deptResp = await request.post(`${API_BASE}/api/departments`, {
    data: { name: `Ord-Отдел-${u}`, sort_order: 0 }
  })
  const dept = await deptResp.json()

  const posResp = await request.post(`${API_BASE}/api/positions`, {
    data: { name: `Ord-Должность-${u}`, sort_order: 0 }
  })
  const pos = await posResp.json()

  const empData = {
    name: `Ord-Сотрудник-${u}`,
    gender: 'М',
    birth_date: '1990-05-15',
    tab_number: Math.floor(100000 + Math.random() * 900000),
    department_id: dept.id,
    position_id: pos.id,
    hire_date: '2024-01-15',
    contract_start: '2024-01-15',
    contract_end: '2025-01-14',
    citizenship: true,
    residency: true,
    rate: 25.5,
    payment_form: 'Повременная',
    ...overrides,
  }

  const empResp = await request.post(`${API_BASE}/api/employees`, { data: empData })
  expect([200, 201]).toContain(empResp.status())
  return empResp.json()
}

/** Создание приказа */
async function createOrder(
  request: any,
  employeeId: number,
  data: {
    order_type: OrderType
    order_date: string
    order_number?: string
    extra_fields?: OrderExtraFields
  }
): Promise<Order> {
  const orderData = {
    employee_id: employeeId,
    order_type: data.order_type,
    order_date: data.order_date,
    extra_fields: data.extra_fields || {},
  }

  const resp = await request.post(`${API_BASE}/api/orders`, { data: orderData })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

/** Отмена приказа */
async function cancelOrder(request: any, orderId: number): Promise<void> {
  const resp = await request.put(`${API_BASE}/api/orders/${orderId}/cancel`)
  expect([200, 204]).toContain(resp.status())
}

/** Удаление приказа */
async function deleteOrder(request: any, orderId: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/orders/${orderId}?hard=true&confirm=true`)
  expect([200, 204]).toContain(resp.status())
}

/** Получение списка приказов */
async function getOrders(request: any, filters: Record<string, any> = {}): Promise<Order[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    params.append(key, String(value))
  }
  const resp = await request.get(`${API_BASE}/api/orders/all?${params.toString()}`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

/** Получение приказов по типу */
async function getOrdersByType(request: any, orderType: OrderType): Promise<Order[]> {
  const orders = await getOrders(request)
  return orders.filter(o => o.order_type === orderType)
}

/** Удаление сотрудника (hard) */
async function deleteEmployee(request: any, employeeId: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/employees/${employeeId}?hard=true`)
  expect([200, 204]).toContain(resp.status())
}

/** Типы для трекинга созданных ресурсов */
type CreatedResources = {
  employees: number[]
  orders: number[]
}

/** Расширение тестов с фикстурами для приказов */
type OrdersFixtures = {
  ordersApi: {
    uid: () => string
    createEmployee: (overrides?: Record<string, any>) => Promise<any>
    createOrder: (employeeId: number, data: { order_type: OrderType; order_date: string; extra_fields?: OrderExtraFields }) => Promise<Order>
    cancelOrder: (orderId: number) => Promise<void>
    deleteOrder: (orderId: number) => Promise<void>
    getOrders: (filters?: Record<string, any>) => Promise<Order[]>
    getOrdersByType: (orderType: OrderType) => Promise<Order[]>
    cleanup: () => Promise<void>
  }
}

export const test = base.extend<OrdersFixtures>({
  ordersApi: async ({ request }, use) => {
    const resources: CreatedResources = {
      employees: [],
      orders: [],
    }

    await use({
      uid,
      createEmployee: async (overrides?: Record<string, any>) => {
        const emp = await createEmployeeForOrder(request, overrides)
        resources.employees.push(emp.id)
        return emp
      },
      createOrder: async (employeeId: number, data: { order_type: OrderType; order_date: string; extra_fields?: OrderExtraFields }) => {
        const order = await createOrder(request, employeeId, data)
        resources.orders.push(order.id)
        return order
      },
      cancelOrder: async (orderId: number) => {
        await cancelOrder(request, orderId)
      },
      deleteOrder: async (orderId: number) => {
        await deleteOrder(request, orderId)
      },
      getOrders: async (filters?: Record<string, any>) => {
        return getOrders(request, filters)
      },
      getOrdersByType: async (orderType: OrderType) => {
        return getOrdersByType(request, orderType)
      },
      cleanup: async () => {
        // Удаление в обратном порядке
        for (const orderId of resources.orders) {
          await deleteOrder(request, orderId).catch(() => {})
        }
        for (const empId of resources.employees) {
          await deleteEmployee(request, empId).catch(() => {})
        }
      },
    })

    // Автоматический cleanup после каждого теста
    for (const orderId of resources.orders) {
      await deleteOrder(request, orderId).catch(() => {})
    }
    for (const empId of resources.employees) {
      await deleteEmployee(request, empId).catch(() => {})
    }
  }
})

export { expect } from '@playwright/test'
