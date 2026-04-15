import { test as base, expect } from '@playwright/test'
import type { Employee, EmployeeFormData } from '../types'

/**
 * Расширенные фикстуры для сотрудников
 * Включают архивацию, восстановление, поиск
 */

const API_BASE = 'http://127.0.0.1:8000'

/** Генератор уникального суффикса */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Создание сотрудника с полными данными */
async function createEmployee(request: any, overrides: Record<string, any> = {}): Promise<Employee> {
  const u = uid()
  const deptResp = await request.post(`${API_BASE}/api/departments`, {
    data: { name: `EmpFix-Отдел-${u}`, sort_order: 0 }
  })
  const dept = await deptResp.json()

  const posResp = await request.post(`${API_BASE}/api/positions`, {
    data: { name: `EmpFix-Должность-${u}`, sort_order: 0 }
  })
  const pos = await posResp.json()

  const empData = {
    name: `EmpFix-Сотрудник-${u}`,
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

  const resp = await request.post(`${API_BASE}/api/employees`, { data: empData })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

/** Архивация сотрудника */
async function archiveEmployee(request: any, employeeId: number): Promise<Employee> {
  const resp = await request.post(`${API_BASE}/api/employees/${employeeId}/archive`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

/** Восстановление сотрудника */
async function restoreEmployee(request: any, employeeId: number): Promise<Employee> {
  const resp = await request.post(`${API_BASE}/api/employees/${employeeId}/restore`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

/** Поиск сотрудника по ID */
async function getEmployeeById(request: any, employeeId: number): Promise<Employee> {
  const resp = await request.get(`${API_BASE}/api/employees/${employeeId}`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

/** Поиск сотрудников */
async function searchEmployees(request: any, query: string): Promise<Employee[]> {
  const resp = await request.get(`${API_BASE}/api/employees`, {
    params: { q: query, per_page: 100 }
  })
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  return data.items || []
}

/** Удаление сотрудника (hard) */
async function deleteEmployee(request: any, employeeId: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/employees/${employeeId}?hard=true`)
  expect([200, 204]).toContain(resp.status())
}

/** Удаление подразделения */
async function deleteDepartment(request: any, deptId: number): Promise<void> {
  await request.delete(`${API_BASE}/api/departments/${deptId}`).catch(() => {})
}

/** Удаление должности */
async function deletePosition(request: any, posId: number): Promise<void> {
  await request.delete(`${API_BASE}/api/positions/${posId}`).catch(() => {})
}

/** Типы для трекинга созданных ресурсов */
type CreatedResources = {
  employees: number[]
  departments: number[]
  positions: number[]
}

/** Расширение тестов с фикстурами для сотрудников */
type EmployeesFixtures = {
  employeesApi: {
    uid: () => string
    createEmployee: (overrides?: Record<string, any>) => Promise<Employee>
    archiveEmployee: (employeeId: number) => Promise<Employee>
    restoreEmployee: (employeeId: number) => Promise<Employee>
    getEmployeeById: (employeeId: number) => Promise<Employee>
    searchEmployees: (query: string) => Promise<Employee[]>
    deleteEmployee: (employeeId: number) => Promise<void>
    cleanup: () => Promise<void>
  }
}

export const test = base.extend<EmployeesFixtures>({
  employeesApi: async ({ request }, use) => {
    const resources: CreatedResources = {
      employees: [],
      departments: [],
      positions: [],
    }

    // Перехватываем создание для трекинга
    const createEmployeeTracked = async (overrides?: Record<string, any>) => {
      const emp = await createEmployee(request, overrides)
      resources.employees.push(emp.id)
      // Сохраняем dept/pos для cleanup
      if (emp.department_id) resources.departments.push(emp.department_id)
      if (emp.position_id) resources.positions.push(emp.position_id)
      return emp
    }

    await use({
      uid,
      createEmployee: createEmployeeTracked,
      archiveEmployee: async (employeeId: number) => {
        return archiveEmployee(request, employeeId)
      },
      restoreEmployee: async (employeeId: number) => {
        return restoreEmployee(request, employeeId)
      },
      getEmployeeById: async (employeeId: number) => {
        return getEmployeeById(request, employeeId)
      },
      searchEmployees: async (query: string) => {
        return searchEmployees(request, query)
      },
      deleteEmployee: async (employeeId: number) => {
        await deleteEmployee(request, employeeId)
      },
      cleanup: async () => {
        for (const empId of resources.employees) {
          await deleteEmployee(request, empId).catch(() => {})
        }
        for (const posId of resources.positions) {
          await deletePosition(request, posId).catch(() => {})
        }
        for (const deptId of resources.departments) {
          await deleteDepartment(request, deptId).catch(() => {})
        }
      },
    })

    // Автоматический cleanup
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
