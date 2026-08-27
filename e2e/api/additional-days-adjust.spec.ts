/**
 * Additional days adjust (#123): увеличение доп. дней с выбором границы.
 * Граница «с указанного периода» / «с первого»; переоткрытие закрытых периодов.
 */
import { test, expect } from '../fixtures/index'
import type { VacationPeriod } from '../types'
import { expectPeriodInvariant } from '../helpers/vacation-invariants'

test.describe('Additional days adjust @api', () => {
  test.setTimeout(25_000)

  test('@api increase from specific period leaves older periods untouched', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2023-01-15',
      contract_start: '2023-01-15',
      additional_vacation_days: 1,
    })

    let periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    const year2 = periods.find((p: VacationPeriod) => p.year_number === 2)
    const year3 = periods.find((p: VacationPeriod) => p.year_number === 3)
    expect(year1).toBeTruthy()
    expect(year2).toBeTruthy()
    expect(year3).toBeTruthy()

    // Закрываем первый период и увеличиваем с указанного (2-й) периода
    await apiOps.closePeriod(year1!.period_id)

    const result = await apiOps.increaseAdditionalDays(emp.id, {
      new_value: 3,
      from_period: 'specific',
      period_id: year2!.period_id,
      reason: 'e2e specific',
    })
    expect(result.adjustment.old_value).toBe(1)
    expect(result.adjustment.new_value).toBe(3)

    const after = result.periods
    const after1 = after.find((p: VacationPeriod) => p.year_number === 1)
    const after2 = after.find((p: VacationPeriod) => p.year_number === 2)
    const after3 = after.find((p: VacationPeriod) => p.year_number === 3)

    // Старее границы — не тронуты
    expect(after1!.additional_days).toBe(1)
    expect(after1!.remaining_days).toBe(0)
    // Граница и далее — обновлены
    expect(after2!.additional_days).toBe(3)
    expect(after3!.additional_days).toBe(3)

    // Повторный GET периодов не перезаписывает старые (граница держится)
    const refreshed = await apiOps.getPeriods(emp.id)
    const refreshed1 = refreshed.find((p: VacationPeriod) => p.year_number === 1)
    expect(refreshed1!.additional_days).toBe(1)
  })

  test('@api increase from first reopens closed period and debits FIFO', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2023-01-15',
      contract_start: '2023-01-15',
      additional_vacation_days: 1,
    })

    let periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    expect(year1).toBeTruthy()

    // Полностью закрываем первый период: 24+1=25 → used 25, remaining 0
    const closed = await apiOps.closePeriod(year1!.period_id)
    expect(closed.remaining_days).toBe(0)
    expect(closed.used_days).toBe(closed.total_days)

    // Увеличиваем с первого: 1 → 3. Переоткрытие на дельту 2.
    const result = await apiOps.increaseAdditionalDays(emp.id, {
      new_value: 3,
      from_period: 'first',
      reason: 'e2e first',
    })
    const after1 = result.periods.find((p: VacationPeriod) => p.year_number === 1)
    expect(after1!.additional_days).toBe(3)
    expect(after1!.used_days).toBe(25)
    expect(after1!.remaining_days).toBe(2)
    expectPeriodInvariant(after1!)

    // Отпуск 2 дня → списывается с переоткрытого первого периода (FIFO)
    await apiOps.createVacation(emp.id, {
      start_date: '2023-06-01',
      end_date: '2023-06-02',
      vacation_type: 'Трудовой',
      order_date: '2023-05-20',
    })

    const afterVac = await apiOps.getPeriods(emp.id)
    const year1AfterVac = afterVac.find((p: VacationPeriod) => p.year_number === 1)
    expect(year1AfterVac!.used_days).toBe(27)
    expect(year1AfterVac!.remaining_days).toBe(0)
  })

  test('@api history lists adjustments newest-first', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    await apiOps.increaseAdditionalDays(emp.id, { new_value: 2, from_period: 'last', reason: 'первое' })
    await apiOps.increaseAdditionalDays(emp.id, { new_value: 4, from_period: 'last', reason: 'второе' })

    const history = await apiOps.getAdditionalDaysHistory(emp.id)
    expect(history.length).toBe(2)
    // Новые → старые
    expect(history[0].new_value).toBe(4)
    expect(history[0].old_value).toBe(2)
    expect(history[1].new_value).toBe(2)
    expect(history[1].old_value).toBe(0)
  })
})