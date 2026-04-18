import { test as base, expect } from '@playwright/test'
import { VacationsPage } from '../pages/VacationsPage'

export type EmployeeData = {
  id: number
  name: string
  tab_number: number
  department_id: number
  position_id: number
  contract_start: string
  additional_vacation_days: number
}

export type VacationData = {
  id: number
  employee_id: number
  start_date: string
  end_date: string
  days_count: number
  vacation_type: string
}

export type BalanceData = {
  available_days: number
  used_days: number
  remaining_days: number
  vacation_type_breakdown: Record<string, number>
}

export type VacationPeriodData = {
  period_id: number
  year_number: number
  period_start: string
  period_end: string
  main_days: number
  additional_days: number
  total_days: number
  used_days: number
  remaining_days: number
}

const API_BASE = 'http://127.0.0.1:8000'

async function createDepartment(request: any, name: string): Promise<any> {
  const resp = await request.post(`${API_BASE}/api/departments`, {
    data: { name, sort_order: 0 }
  })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

async function createPosition(request: any, name: string): Promise<any> {
  const resp = await request.post(`${API_BASE}/api/positions`, {
    data: { name, sort_order: 0 }
  })
  expect([200, 201]).toContain(resp.status())
  return resp.json()
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function createEmployee(request: any, overrides: Record<string, any> = {}): Promise<EmployeeData> {
  const u = uid()
  const dept = await createDepartment(request, `Отдел-${u}`)
  const pos = await createPosition(request, `Должность-${u}`)

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
  return resp.json()
}

async function createVacation(request: any, employeeId: number, overrides: Record<string, any> = {}): Promise<VacationData> {
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

async function getBalance(request: any, employeeId: number): Promise<BalanceData> {
  const resp = await request.get(`${API_BASE}/api/vacations/balance`, {
    params: { employee_id: employeeId }
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function updateEmployee(request: any, employeeId: number, data: Record<string, any>): Promise<any> {
  const resp = await request.put(`${API_BASE}/api/employees/${employeeId}`, { data })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function deleteVacation(request: any, vacationId: number): Promise<void> {
  const resp = await request.delete(`${API_BASE}/api/vacations/${vacationId}`)
  expect([200, 204]).toContain(resp.status())
}

async function getPeriods(request: any, employeeId: number): Promise<VacationPeriodData[]> {
  const resp = await request.get(`${API_BASE}/api/vacation-periods`, {
    params: { employee_id: employeeId }
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function getPeriodBalance(request: any, periodId: number): Promise<VacationPeriodData> {
  const resp = await request.get(`${API_BASE}/api/vacation-periods/${periodId}/balance`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function closePeriod(request: any, periodId: number): Promise<VacationPeriodData> {
  const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/close`)
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function partialClosePeriod(request: any, periodId: number, remainingDays: number): Promise<VacationPeriodData> {
  const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/partial-close`, {
    data: { remaining_days: remainingDays }
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function adjustPeriod(request: any, periodId: number, additionalDays: number): Promise<VacationPeriodData> {
  const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/adjust`, {
    data: { additional_days: additionalDays }
  })
  expect(resp.status()).toBe(200)
  return resp.json()
}

async function cleanupEmployee(request: any, employeeId: number): Promise<void> {
  const vacResp = await request.get(`${API_BASE}/api/vacations`, {
    params: { employee_id: employeeId, per_page: 1000 }
  })
  const vacations = (await vacResp.json()).items || []
  for (const vac of vacations) {
    await request.delete(`${API_BASE}/api/vacations/${vac.id}`)
  }

  await request.delete(`${API_BASE}/api/employees/${employeeId}?hard=true&confirm=true`)
}

type VacationsFixtures = {
  vacationsPage: VacationsPage
  apiOps: {
    uid: () => string
    createEmployee: (overrides?: Record<string, any>) => Promise<EmployeeData>
    createVacation: (employeeId: number, overrides?: Record<string, any>) => Promise<VacationData>
    getBalance: (employeeId: number) => Promise<BalanceData>
    updateEmployee: (employeeId: number, data: Record<string, any>) => Promise<any>
    deleteVacation: (vacationId: number) => Promise<void>
    cleanupEmployee: (employeeId: number) => Promise<void>
    getPeriods: (employeeId: number) => Promise<VacationPeriodData[]>
    getPeriodBalance: (periodId: number) => Promise<VacationPeriodData>
    closePeriod: (periodId: number) => Promise<VacationPeriodData>
    partialClosePeriod: (periodId: number, remainingDays: number) => Promise<VacationPeriodData>
    adjustPeriod: (periodId: number, additionalDays: number) => Promise<VacationPeriodData>
  }
}

export const test = base.extend<VacationsFixtures>({
  vacationsPage: async ({ page }, use) => {
    const vacationsPage = new VacationsPage(page)
    await use(vacationsPage)
  },

  apiOps: async ({ request }, use) => {
    await use({
      uid,
      createEmployee: (overrides?: Record<string, any>) => createEmployee(request, overrides),
      createVacation: (employeeId: number, overrides?: Record<string, any>) => createVacation(request, employeeId, overrides),
      getBalance: (employeeId: number) => getBalance(request, employeeId),
      updateEmployee: (employeeId: number, data: Record<string, any>) => updateEmployee(request, employeeId, data),
      deleteVacation: (vacationId: number) => deleteVacation(request, vacationId),
      cleanupEmployee: (employeeId: number) => cleanupEmployee(request, employeeId),
      getPeriods: (employeeId: number) => getPeriods(request, employeeId),
      getPeriodBalance: (periodId: number) => getPeriodBalance(request, periodId),
      closePeriod: (periodId: number) => closePeriod(request, periodId),
      partialClosePeriod: (periodId: number, remainingDays: number) => partialClosePeriod(request, periodId, remainingDays),
      adjustPeriod: (periodId: number, additionalDays: number) => adjustPeriod(request, periodId, additionalDays),
    })
  }
})

export { expect } from '@playwright/test'
