/**
 * @deprecated Используйте import { test, expect } from './fixtures'
 * 
 * Этот файл оставлен для обратной совместимости.
 * Он реэкспортирует современные фикстуры из index.ts
 * с маппингом старых имен (ordersApi -> apiOps)
 */

import { test as base, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import type { Order, OrderTypeRecord } from '../types'

const API_BASE = 'http://127.0.0.1:8000'

async function getOrderTypes(request: APIRequestContext): Promise<OrderTypeRecord[]> {
  const resp = await request.get(`${API_BASE}/api/order-types`)
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

async function getOrderTypeId(
  request: APIRequestContext,
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

type OrdersApiFixtures = {
  ordersApi: {
    uid: () => string
    getOrderTypeId: (params: { code?: string; name?: string; visibleOnly?: boolean }) => Promise<number>
    getOrders: () => Promise<Order[]>
    createEmployee: (overrides?: Record<string, unknown>) => Promise<unknown>
    createOrder: (
      employeeId: number,
      data: {
        order_type_id?: number
        order_type_code?: string
        order_type_name?: string
        order_date: string
        extra_fields?: Record<string, unknown>
      }
    ) => Promise<Order>
    cancelOrder: (orderId: number) => Promise<void>
    deleteOrder: (orderId: number) => Promise<void>
    cleanup: () => Promise<void>
  }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export const test = base.extend<OrdersApiFixtures>({
  ordersApi: async ({ request }, use) => {
    const employees: number[] = []
    const orders: number[] = []

    await use({
      uid,
      getOrderTypeId: async (params) => getOrderTypeId(request, params),
      getOrders: async () => {
        const resp = await request.get(`${API_BASE}/api/orders/all`)
        expect(resp.status()).toBe(200)
        const data = await resp.json()
        return data.items || []
      },
      createEmployee: async (overrides = {}) => {
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
        const emp = await empResp.json()
        employees.push(emp.id)
        return emp
      },
      createOrder: async (employeeId, data) => {
        let orderTypeId = data.order_type_id
        if (!orderTypeId) {
          orderTypeId = await getOrderTypeId(request, {
            code: data.order_type_code,
            name: data.order_type_name,
            visibleOnly: true,
          })
        }

        const orderData = {
          employee_id: employeeId,
          order_type_id: orderTypeId,
          order_date: data.order_date,
          extra_fields: data.extra_fields || {},
        }

        const resp = await request.post(`${API_BASE}/api/orders`, { data: orderData })
        expect([200, 201]).toContain(resp.status())
        const order = await resp.json()
        orders.push(order.id)
        return order
      },
      cancelOrder: async (orderId) => {
        const resp = await request.put(`${API_BASE}/api/orders/${orderId}/cancel`)
        expect([200, 204]).toContain(resp.status())
      },
      deleteOrder: async (orderId) => {
        const resp = await request.delete(`${API_BASE}/api/orders/${orderId}?hard=true&confirm=true`)
        expect([200, 204]).toContain(resp.status())
      },
      cleanup: async () => {
        for (const orderId of orders.reverse()) {
          await request.delete(`${API_BASE}/api/orders/${orderId}?hard=true&confirm=true`).catch(() => {})
        }
        for (const empId of employees.reverse()) {
          await request.delete(`${API_BASE}/api/employees/${empId}?hard=true&confirm=true`).catch(() => {})
        }
      },
    })

    // Cleanup
    for (const orderId of orders.reverse()) {
      await request.delete(`${API_BASE}/api/orders/${orderId}?hard=true&confirm=true`).catch(() => {})
    }
    for (const empId of employees.reverse()) {
      await request.delete(`${API_BASE}/api/employees/${empId}?hard=true&confirm=true`).catch(() => {})
    }
  }
})

export { expect } from '@playwright/test'
