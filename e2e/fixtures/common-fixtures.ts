/**
 * @deprecated Используйте import { test, expect } from './fixtures'
 * 
 * Этот файл оставлен для обратной совместимости.
 * Он реэкспортирует современные фикстуры из index.ts
 * с маппингом старых имен
 */

import { test as base, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import type { OrderTypeRecord, Employee, Department, Position, Vacation, Order } from '../types'

const API_BASE = 'http://127.0.0.1:8000'

export type DepartmentData = Department
export type PositionData = Position
export type EmployeeData = Employee
export type VacationData = Vacation
export type OrderData = Order

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

type CommonFixtures = {
  apiOps: {
    uid: () => string
    createDepartment: (name: string, overrides?: Record<string, unknown>) => Promise<Department>
    createPosition: (name: string, overrides?: Record<string, unknown>) => Promise<Position>
    createEmployee: (
      deptId: number,
      posId: number,
      overrides?: Record<string, unknown>
    ) => Promise<Employee>
    createVacation: (empId: number, overrides?: Record<string, unknown>) => Promise<Vacation>
    createOrder: (empId: number, overrides?: Record<string, unknown>) => Promise<Order>
    getOrderTypeId: (params: { code?: string; name?: string; visibleOnly?: boolean }) => Promise<number>
  }
}

export const test = base.extend<CommonFixtures>({
  apiOps: async ({ request }, use) => {
    const departments: number[] = []
    const positions: number[] = []
    const employees: number[] = []
    const vacations: number[] = []
    const orders: number[] = []

    async function getOrderTypes(): Promise<OrderTypeRecord[]> {
      const resp = await request.get(`${API_BASE}/api/order-types`)
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      return data.items || []
    }

    async function getOrderTypeId(params: { code?: string; name?: string; visibleOnly?: boolean }): Promise<number> {
      const types = await getOrderTypes()
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

    await use({
      uid,
      createDepartment: async (name: string, overrides?: Record<string, unknown>) => {
        const resp = await request.post(`${API_BASE}/api/departments`, {
          data: { name, sort_order: 0, ...overrides }
        })
        expect([200, 201]).toContain(resp.status())
        const dept = await resp.json()
        departments.push(dept.id)
        return dept
      },
      createPosition: async (name: string, overrides?: Record<string, unknown>) => {
        const resp = await request.post(`${API_BASE}/api/positions`, {
          data: { name, sort_order: 0, ...overrides }
        })
        expect([200, 201]).toContain(resp.status())
        const pos = await resp.json()
        positions.push(pos.id)
        return pos
      },
      createEmployee: async (
        deptId: number,
        posId: number,
        overrides?: Record<string, unknown>
      ) => {
        const u = uid()
        const empData = {
          name: `Сотрудник-${u}`,
          gender: 'М',
          birth_date: '1990-05-15',
          tab_number: Math.floor(100000 + Math.random() * 900000),
          department_id: deptId,
          position_id: posId,
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
        const emp = await resp.json()
        employees.push(emp.id)
        return emp
      },
      createVacation: async (empId: number, overrides?: Record<string, unknown>) => {
        const vacData = {
          employee_id: empId,
          start_date: '2024-06-01',
          end_date: '2024-06-14',
          vacation_type: 'Трудовой',
          order_date: '2024-05-25',
          ...overrides,
        }

        const resp = await request.post(`${API_BASE}/api/vacations`, { data: vacData })
        expect([200, 201]).toContain(resp.status())
        const vac = await resp.json()
        vacations.push(vac.id)
        return vac
      },
      createOrder: async (empId: number, overrides?: Record<string, unknown>) => {
        const orderTypeId = await getOrderTypeId({ code: 'transfer', visibleOnly: true })
        const orderData = {
          employee_id: empId,
          order_type_id: orderTypeId,
          order_date: '2024-06-15',
          ...overrides,
        }

        const resp = await request.post(`${API_BASE}/api/orders`, { data: orderData })
        expect([200, 201]).toContain(resp.status())
        const order = await resp.json()
        orders.push(order.id)
        return order
      },
      getOrderTypeId: async (params: { code?: string; name?: string; visibleOnly?: boolean }) => {
        return getOrderTypeId(params)
      },
    })

    // Cleanup в правильном порядке
    for (const orderId of orders.reverse()) {
      await request.delete(`${API_BASE}/api/orders/${orderId}?hard=true&confirm=true`).catch(() => {})
    }
    for (const vacId of vacations.reverse()) {
      await request.delete(`${API_BASE}/api/vacations/${vacId}`).catch(() => {})
    }
    for (const empId of employees.reverse()) {
      // Удаляем связанные планы отпусков
      const plansResp = await request.get(`${API_BASE}/api/vacation-plans?employee_id=${empId}`)
      if (plansResp.status() === 200) {
        const plans = await plansResp.json()
        for (const plan of plans) {
          await request.delete(`${API_BASE}/api/vacation-plans/${plan.id}`).catch(() => {})
        }
      }
      await request.delete(`${API_BASE}/api/employees/${empId}?hard=true&confirm=true`).catch(() => {})
    }
    for (const posId of positions.reverse()) {
      await request.delete(`${API_BASE}/api/positions/${posId}`).catch(() => {})
    }
    for (const deptId of departments.reverse()) {
      await request.delete(`${API_BASE}/api/departments/${deptId}`).catch(() => {})
    }
  }
})

export { expect } from '@playwright/test'
