import { test as base, expect } from '@playwright/test'
import type { DepartmentData, PositionData, EmployeeData, VacationData, OrderData } from '../types'

/**
 * Общие фикстуры для lifecycle тестов
 * Автоматическая очистка данных после каждого теста
 */

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
  order_type: string
  order_date: string
  order_number?: string
  extra_fields?: Record<string, any>
}

const API_BASE = 'http://127.0.0.1:8000'

/** Генератор уникального суффикса */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Создание подразделения */
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

/** Создание должности */
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

/** Создание сотрудника */
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

/** Создание отпуска */
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

/** Создание приказа */
async function createOrder(
  request: any,
  employeeId: number,
  overrides: Record<string, any> = {}
): Promise<OrderData> {
  const orderData = {
    employee_id: employeeId,
    order_type: 'Отпуск трудовой',
    order_date: '2024-06-15',
    ...overrides,
  }

  const resp = await request.post(`${API_BASE}/api/orders`, { data: orderData })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

/** Удаление подразделения */
async function deleteDepartment(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/departments/${id}`)
  expect([200, 204]).toContain(resp.status())
}

/** Удаление должности */
async function deletePosition(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/positions/${id}`)
  expect([200, 204]).toContain(resp.status())
}

/** Удаление сотрудника (hard delete) */
async function deleteEmployee(request: any, id: number): Promise<void> {
  // Сначала удаляем все vacation_plans сотрудника
  const plansResp = await request.get(`${API_BASE}/api/vacation-plans?employee_id=${id}`)
  if (plansResp.status() === 200) {
    const plans = await plansResp.json()
    console.log(`[deleteEmployee] Найдено ${plans.length} vacation_plans для сотрудника ${id}`)
    for (const plan of plans) {
      console.log(`[deleteEmployee] Удаляем vacation_plan ${plan.id} (месяц ${plan.month})...`)
      const deleteResp = await request.delete(`${API_BASE}/api/vacation-plans/${plan.id}`)
      if (deleteResp.status() === 200 || deleteResp.status() === 204) {
        console.log(`[deleteEmployee] vacation_plan ${plan.id} удалён`)
      } else {
        console.error(`[deleteEmployee] Не удалось удалить vacation_plan ${plan.id}: ${deleteResp.status()}`)
      }
    }
  }
  // Теперь удаляем сотрудника с параметром confirm=true
  console.log(`[deleteEmployee] Удаляем сотрудника ${id}...`)
  const resp = await request.delete(`${API_BASE}/api/employees/${id}?hard=true&confirm=true`)
  expect([200, 204]).toContain(resp.status())
}

/** Удаление отпуска */
async function deleteVacation(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/vacations/${id}`)
  expect([200, 204]).toContain(resp.status())
}

/** Удаление приказа */
async function deleteOrder(request: any, id: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/orders/${id}?hard=true&confirm=true`)
  expect([200, 204]).toContain(resp.status())
}

/** Типы для трекинга созданных ресурсов */
type CreatedResources = {
  departments: number[]
  positions: number[]
  employees: number[]
  vacations: number[]
  orders: number[]
}

/** Расширение тестов с общими фикстурами */
type CommonFixtures = {
  apiOps: {
    uid: () => string
    createDepartment: (name: string, overrides?: Record<string, any>) => Promise<DepartmentData>
    createPosition: (name: string, overrides?: Record<string, any>) => Promise<PositionData>
    createEmployee: (deptId: number, posId: number, overrides?: Record<string, any>) => Promise<EmployeeData>
    createVacation: (empId: number, overrides?: Record<string, any>) => Promise<VacationData>
    createOrder: (empId: number, overrides?: Record<string, any>) => Promise<OrderData>
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
    })

    // Cleanup: удаляем ресурсы в обратном порядке
    console.log('[CLEANUP] Начинаем очистку...')
    
    for (const orderId of resources.orders) {
      console.log(`[CLEANUP] Удаляем приказ ${orderId}...`)
      await deleteOrder(request, orderId).catch((err) => {
        console.error(`[CLEANUP] Ошибка при удалении приказа ${orderId}:`, err.message)
      })
      console.log(`[CLEANUP] Приказ ${orderId} удалён`)
    }
    for (const vacationId of resources.vacations) {
      console.log(`[CLEANUP] Удаляем отпуск ${vacationId}...`)
      await deleteVacation(request, vacationId).catch((err) => {
        console.error(`[CLEANUP] Ошибка при удалении отпуска ${vacationId}:`, err.message)
      })
      console.log(`[CLEANUP] Отпуск ${vacationId} удалён`)
    }
    for (const empId of resources.employees) {
      console.log(`[CLEANUP] Удаляем сотрудника ${empId}...`)
      await deleteEmployee(request, empId).catch((err) => {
        console.error(`[CLEANUP] Ошибка при удалении сотрудника ${empId}:`, err.message)
      })
      console.log(`[CLEANUP] Сотрудник ${empId} удалён`)
    }
    for (const posId of resources.positions) {
      console.log(`[CLEANUP] Удаляем должность ${posId}...`)
      await deletePosition(request, posId).catch((err) => {
        console.error(`[CLEANUP] Ошибка при удалении должности ${posId}:`, err.message)
      })
      console.log(`[CLEANUP] Должность ${posId} удалена`)
    }
    for (const deptId of resources.departments) {
      console.log(`[CLEANUP] Удаляем отдел ${deptId}...`)
      await deleteDepartment(request, deptId).catch((err) => {
        console.error(`[CLEANUP] Ошибка при удалении отдела ${deptId}:`, err.message)
      })
      console.log(`[CLEANUP] Отдел ${deptId} удалён`)
    }
    
    console.log('[CLEANUP] Очистка завершена!')
  }
})

export { expect } from '@playwright/test'
