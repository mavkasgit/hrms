/**
 * Slim vacation-balance smoke (legacy domain/vacation-balance).
 * Edge math (overclose, multi-year matrices) → backend pytest.
 */
import { test, expect } from '../fixtures/index'
import type { VacationPeriod } from '../types'
import {
  expectBalanceInvariant,
  expectNonNegativeAvailable,
  expectPeriodInvariant,
} from '../helpers/vacation-invariants'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Vacation balance smoke @api', () => {
  test.setTimeout(30_000)

  test('@api balance without vacations is positive and consistent', async ({
    apiOps,
    playwright,
  }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    // Trigger period generation
    await apiOps.getPeriods(emp.id)

    const balance = await apiOps.getBalance(emp.id)
    expect(balance.available_days).toBeGreaterThan(0)
    expect(balance.used_days).toBe(0)
    expect(balance.remaining_days).toBe(balance.available_days)
    expectBalanceInvariant(balance)
    expectNonNegativeAvailable(balance)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.get('/api/vacations/balance', {
        params: { employee_id: emp.id, year: 2024 },
      })
      expect(resp.status()).toBe(200)
      const balance2024 = await resp.json()
      expect(balance2024.available_days).toBe(24)
    } finally {
      await dispose()
    }
  })

  test('@api vacation decreases balance; delete restores', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    await apiOps.getPeriods(emp.id)

    const balanceBefore = await apiOps.getBalance(emp.id)
    expect(balanceBefore.used_days).toBe(0)

    const vac = await apiOps.createVacation(emp.id, {
      start_date: '2024-06-01',
      end_date: '2024-06-03',
      vacation_type: 'Трудовой',
      order_date: '2024-05-25',
    })
    expect(vac.days_count).toBe(3)

    const periodsAfter = await apiOps.getPeriods(emp.id)
    const year1 = periodsAfter.find((p: VacationPeriod) => p.year_number === 1)
    expect(year1).toBeTruthy()
    expect(year1!.used_days).toBe(3)
    expectPeriodInvariant(year1!)

    const balanceAfter = await apiOps.getBalance(emp.id)
    expect(balanceAfter.used_days).toBe(3)
    expect(balanceAfter.remaining_days).toBe(balanceAfter.available_days - 3)
    expectBalanceInvariant(balanceAfter)

    await apiOps.deleteVacation(vac.id)

    const periodsRestored = await apiOps.getPeriods(emp.id)
    const year1Restored = periodsRestored.find(
      (p: VacationPeriod) => p.year_number === 1
    )
    expect(year1Restored!.used_days).toBe(0)
    expectPeriodInvariant(year1Restored!)

    const balanceRestored = await apiOps.getBalance(emp.id)
    expect(balanceRestored.used_days).toBe(0)
    expect(balanceRestored.remaining_days).toBe(balanceRestored.available_days)
    expectBalanceInvariant(balanceRestored)
  })

  test('@api additional_vacation_days reflected in balance', async ({
    apiOps,
    playwright,
  }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
      additional_vacation_days: 7,
    })

    const periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    expect(year1).toBeTruthy()
    expect(year1!.main_days).toBe(24)
    expect(year1!.additional_days).toBe(7)
    expect(year1!.total_days).toBe(31)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.get('/api/vacations/balance', {
        params: { employee_id: emp.id, year: 2024 },
      })
      expect(resp.status()).toBe(200)
      const balance2024 = await resp.json()
      expect(balance2024.available_days).toBe(31)
    } finally {
      await dispose()
    }
  })
})
