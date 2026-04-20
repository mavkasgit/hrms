/**
 * @deprecated Используйте import { test, expect } from './fixtures'
 * 
 * Этот файл оставлен для обратной совместимости.
 * Он реэкспортирует современные фикстуры из index.ts
 * с маппингом старых имен
 */

import { test as base, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { VacationsPage } from '../pages/VacationsPage'
import type { Employee, Vacation, VacationPeriod, VacationBalance } from '../types'

const API_BASE = 'http://127.0.0.1:8000'

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export type VacationPeriodData = VacationPeriod
export type BalanceData = VacationBalance
export type EmployeeData = Employee
export type VacationData = Vacation

type VacationsFixtures = {
  vacationsPage: VacationsPage
  apiOps: {
    uid: () => string
    createEmployee: (overrides?: Record<string, unknown>) => Promise<Employee>
    createVacation: (employeeId: number, overrides?: Record<string, unknown>) => Promise<Vacation>
    getBalance: (employeeId: number) => Promise<VacationBalance>
    updateEmployee: (employeeId: number, data: Record<string, unknown>) => Promise<Employee>
    deleteVacation: (vacationId: number) => Promise<void>
    cleanupEmployee: (employeeId: number) => Promise<void>
    getPeriods: (employeeId: number) => Promise<VacationPeriod[]>
    getPeriodBalance: (periodId: number) => Promise<VacationPeriod>
    closePeriod: (periodId: number) => Promise<VacationPeriod>
    partialClosePeriod: (periodId: number, remainingDays: number) => Promise<VacationPeriod>
    adjustPeriod: (periodId: number, additionalDays: number) => Promise<VacationPeriod>
  }
}

export const test = base.extend<VacationsFixtures>({
  vacationsPage: async ({ page }, use) => {
    const vacationsPage = new VacationsPage(page)
    await use(vacationsPage)
  },

  apiOps: async ({ request }, use) => {
    const employees: number[] = []
    const vacations: number[] = []

    async function createDepartment(name: string) {
      const resp = await request.post(`${API_BASE}/api/departments`, {
        data: { name, sort_order: 0 }
      })
      expect([200, 201]).toContain(resp.status())
      return resp.json()
    }

    async function createPosition(name: string) {
      const resp = await request.post(`${API_BASE}/api/positions`, {
        data: { name, sort_order: 0 }
      })
      expect([200, 201]).toContain(resp.status())
      return resp.json()
    }

    async function createEmployee(overrides: Record<string, unknown> = {}): Promise<Employee> {
      const u = uid()
      const dept = await createDepartment(`Отдел-${u}`)
      const pos = await createPosition(`Должность-${u}`)

      const empData = {
        name: `Сотрудник-${u}`,
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
      const emp = await resp.json()
      employees.push(emp.id)
      return emp
    }

    async function deleteVacation(id: number): Promise<void> {
      const resp = await request.delete(`${API_BASE}/api/vacations/${id}`)
      expect([200, 204]).toContain(resp.status())
    }

    await use({
      uid,
      createEmployee: async (overrides?: Record<string, unknown>) => {
        return createEmployee(overrides)
      },
      createVacation: async (employeeId: number, overrides?: Record<string, unknown>) => {
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
        const vac = await resp.json()
        vacations.push(vac.id)
        return vac
      },
      getBalance: async (employeeId: number) => {
        const resp = await request.get(`${API_BASE}/api/vacations/balance`, {
          params: { employee_id: employeeId }
        })
        expect(resp.status()).toBe(200)
        return resp.json()
      },
      updateEmployee: async (employeeId: number, data: Record<string, unknown>) => {
        const resp = await request.put(`${API_BASE}/api/employees/${employeeId}`, { data })
        expect(resp.status()).toBe(200)
        return resp.json()
      },
      deleteVacation: async (vacationId: number) => {
        await deleteVacation(vacationId)
      },
      cleanupEmployee: async (employeeId: number) => {
        const vacResp = await request.get(`${API_BASE}/api/vacations`, {
          params: { employee_id: employeeId, per_page: 1000 }
        })
        const vacs = (await vacResp.json()).items || []
        for (const vac of vacs) {
          await request.delete(`${API_BASE}/api/vacations/${vac.id}`)
        }
        await request.delete(`${API_BASE}/api/employees/${employeeId}?hard=true&confirm=true`)
      },
      getPeriods: async (employeeId: number) => {
        const resp = await request.get(`${API_BASE}/api/vacation-periods`, {
          params: { employee_id: employeeId }
        })
        expect(resp.status()).toBe(200)
        return resp.json()
      },
      getPeriodBalance: async (periodId: number) => {
        const resp = await request.get(`${API_BASE}/api/vacation-periods/${periodId}/balance`)
        expect(resp.status()).toBe(200)
        return resp.json()
      },
      closePeriod: async (periodId: number) => {
        const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/close`)
        expect(resp.status()).toBe(200)
        return resp.json()
      },
      partialClosePeriod: async (periodId: number, remainingDays: number) => {
        const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/partial-close`, {
          data: { remaining_days: remainingDays }
        })
        expect(resp.status()).toBe(200)
        return resp.json()
      },
      adjustPeriod: async (periodId: number, additionalDays: number) => {
        const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/adjust`, {
          data: { additional_days: additionalDays }
        })
        expect(resp.status()).toBe(200)
        return resp.json()
      },
    })

    // Cleanup
    for (const vacId of vacations.reverse()) {
      await request.delete(`${API_BASE}/api/vacations/${vacId}`).catch(() => {})
    }
    for (const empId of employees.reverse()) {
      await request.delete(`${API_BASE}/api/employees/${empId}?hard=true&confirm=true`).catch(() => {})
    }
  }
})

export { expect } from '@playwright/test'
