/**
 * Slim vacation-periods smoke (legacy domain/vacation-periods-generation).
 * Full math matrix stays in backend pytest; here: high-value happy paths only.
 */
import { test, expect } from '../fixtures/index'
import type { VacationPeriod } from '../types'
import { expectPeriodInvariant } from '../helpers/vacation-invariants'

test.describe('Vacation periods smoke @api', () => {
  test.setTimeout(25_000)

  test('@api auto-generate periods for new employee', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
    })

    const periods = await apiOps.getPeriods(emp.id)
    expect(periods.length).toBeGreaterThanOrEqual(1)

    for (const p of periods) {
      expect(p.period_id).toBeTruthy()
      expect(p.year_number).toBeGreaterThanOrEqual(1)
      expect(p.main_days).toBe(24)
      expect(p.total_days).toBeGreaterThanOrEqual(0)
      expectPeriodInvariant(p)
    }
  })

  test('@api period dates from contract_start (year 1)', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2024-03-01',
      contract_start: '2024-03-01',
    })

    const periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    expect(year1).toBeTruthy()
    expect(year1!.period_start).toBe('2024-03-01')
    expect(year1!.period_end).toBe('2025-02-28')
  })

  test('@api default period fields (main=24, add=0, used=0)', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    const periods = await apiOps.getPeriods(emp.id)
    expect(periods.length).toBeGreaterThanOrEqual(1)

    for (const p of periods) {
      expect(p.main_days).toBe(24)
      expect(p.additional_days).toBe(0)
      expect(p.used_days).toBe(0)
      expectPeriodInvariant(p)
    }
  })

  test('@api adjust additional_days on period', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    const periods = await apiOps.getPeriods(emp.id)
    const target = periods[periods.length - 1]

    const adjusted = await apiOps.adjustPeriod(target.period_id, 10)
    expect(adjusted.additional_days).toBe(10)
    expect(adjusted.total_days).toBe(24 + 10)
    expectPeriodInvariant(adjusted)

    const balance = await apiOps.getPeriodBalance(target.period_id)
    expect(balance.additional_days).toBe(10)
    expect(balance.total_days).toBe(34)
  })

  test('@api vacation debit + close period (lifecycle)', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2023-06-01',
      additional_vacation_days: 0,
    })

    let periods = await apiOps.getPeriods(emp.id)
    expect(periods.length).toBeGreaterThanOrEqual(1)

    const oldest = [...periods].sort(
      (a: VacationPeriod, b: VacationPeriod) => a.year_number - b.year_number
    )[0]

    await apiOps.createVacation(emp.id, {
      start_date: '2025-01-10',
      end_date: '2025-01-16',
    })

    periods = await apiOps.getPeriods(emp.id)
    const afterVac = periods.find(
      (p: VacationPeriod) => p.year_number === oldest.year_number
    )
    expect(afterVac).toBeTruthy()
    expect(afterVac!.used_days).toBeGreaterThan(0)

    const closed = await apiOps.closePeriod(afterVac!.period_id)
    expect(closed.remaining_days).toBe(0)
    expect(closed.used_days).toBe(closed.total_days)
  })

  test('@api partially-closed period is debited first, then next open', async ({
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2023-01-15',
      contract_start: '2023-01-15',
      additional_vacation_days: 0,
    })

    let periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    const year2 = periods.find((p: VacationPeriod) => p.year_number === 2)
    expect(year1).toBeTruthy()
    expect(year2).toBeTruthy()

    // Частично закрываем первый период: остаток 21.
    const partial = await apiOps.partialClosePeriod(year1!.period_id, 21)
    expect(partial.remaining_days).toBe(21)
    expect(partial.used_days).toBe(partial.total_days - 21)

    // Отпуск 27 дней: 21 с частично закрытого (до 0), 6 со следующего.
    const vac = await apiOps.createVacation(emp.id, {
      start_date: '2024-06-01',
      end_date: '2024-06-27',
      vacation_type: 'Трудовой',
      order_date: '2024-05-25',
    })
    expect(vac.days_count).toBe(27)

    periods = await apiOps.getPeriods(emp.id)
    const after1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    const after2 = periods.find((p: VacationPeriod) => p.year_number === 2)

    // Частично закрытый период доеден до нуля (стал полностью закрытым).
    expect(after1!.used_days).toBe(after1!.total_days)
    expect(after1!.remaining_days).toBe(0)
    expectPeriodInvariant(after1!)

    // Остаток списан со следующего открытого периода.
    expect(after2!.used_days).toBe(6)
    expectPeriodInvariant(after2!)
  })

  test('@api fully-closed period is skipped, debit goes to next open', async ({
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2023-01-15',
      contract_start: '2023-01-15',
      additional_vacation_days: 0,
    })

    let periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    const year2 = periods.find((p: VacationPeriod) => p.year_number === 2)
    expect(year1).toBeTruthy()
    expect(year2).toBeTruthy()

    // Полностью закрываем первый период.
    const closed = await apiOps.closePeriod(year1!.period_id)
    expect(closed.remaining_days).toBe(0)

    // Отпуск 8 дней должен целиком уйти во второй (открытый) период.
    await apiOps.createVacation(emp.id, {
      start_date: '2024-06-01',
      end_date: '2024-06-08',
      vacation_type: 'Трудовой',
      order_date: '2024-05-25',
    })

    periods = await apiOps.getPeriods(emp.id)
    const after1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    const after2 = periods.find((p: VacationPeriod) => p.year_number === 2)

    expect(after1!.used_days).toBe(after1!.total_days)
    expect(after1!.remaining_days).toBe(0)
    expect(after2!.used_days).toBe(8)
    expectPeriodInvariant(after2!)
  })
})
