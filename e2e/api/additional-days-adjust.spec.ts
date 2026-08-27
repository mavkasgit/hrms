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

  test('@api per-period manual tweak reopens closed period and reverts one back', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2023-01-15',
      contract_start: '2023-01-15',
      additional_vacation_days: 1,
    })

    let periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    const year3 = periods.find((p: VacationPeriod) => p.year_number === 3)
    expect(year1).toBeTruthy()
    expect(year3).toBeTruthy()

    // Закрываем 1-й год и применяем «с последнего»: 1 → 3
    await apiOps.closePeriod(year1!.period_id)
    await apiOps.increaseAdditionalDays(emp.id, { new_value: 3, from_period: 'last' })

    periods = await apiOps.getPeriods(emp.id)
    const year1AfterBulk = periods.find((p: VacationPeriod) => p.year_number === 1)
    const year3AfterBulk = periods.find((p: VacationPeriod) => p.year_number === 3)
    expect(year1AfterBulk!.additional_days).toBe(1) // старый не тронут границей
    expect(year3AfterBulk!.additional_days).toBe(3)

    // Ручная корректировка: 1-й → 2 (переоткрытие на 1), 3-й → 1 (откат назад)
    const after = await apiOps.adjustPeriodsAdditionalDays(emp.id, [
      { period_id: year1AfterBulk!.period_id, additional_days: 2 },
      { period_id: year3AfterBulk!.period_id, additional_days: 1 },
    ])

    const year1After = after.find((p: VacationPeriod) => p.year_number === 1)
    const year3After = after.find((p: VacationPeriod) => p.year_number === 3)
    expect(year1After!.additional_days).toBe(2)
    expect(year1After!.used_days).toBe(25)
    expect(year1After!.remaining_days).toBe(1)
    expectPeriodInvariant(year1After!)
    expect(year3After!.additional_days).toBe(1)
  })

  test('@api repeated change: bulk reopen → bulk revert closes → manual single period again', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2023-01-15',
      contract_start: '2023-01-15',
      additional_vacation_days: 1,
    })

    let periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p: VacationPeriod) => p.year_number === 1)
    expect(year1).toBeTruthy()
    await apiOps.closePeriod(year1!.period_id)

    // 1) «с первого»: 1 → 3 — переоткрытие на 2
    await apiOps.increaseAdditionalDays(emp.id, { new_value: 3, from_period: 'first' })
    periods = await apiOps.getPeriods(emp.id)
    const afterFirst = periods.find((p: VacationPeriod) => p.year_number === 1)
    expect(afterFirst!.remaining_days).toBe(2)

    // 2) повторно «с первого»: 3 → 1 — откат, период снова закрыт
    await apiOps.increaseAdditionalDays(emp.id, { new_value: 1, from_period: 'first' })
    periods = await apiOps.getPeriods(emp.id)
    const afterRevert = periods.find((p: VacationPeriod) => p.year_number === 1)
    expect(afterRevert!.additional_days).toBe(1)
    expect(afterRevert!.remaining_days).toBe(0)
    expectPeriodInvariant(afterRevert!)

    // 3) ручная правка одного периода: 1 → 2 — снова переоткрытие
    const afterManual = await apiOps.adjustPeriodsAdditionalDays(emp.id, [
      { period_id: afterRevert!.period_id, additional_days: 2 },
    ])
    const year1Final = afterManual.find((p: VacationPeriod) => p.year_number === 1)
    expect(year1Final!.additional_days).toBe(2)
    expect(year1Final!.used_days).toBe(25)
    expect(year1Final!.remaining_days).toBe(1)
    expectPeriodInvariant(year1Final!)
  })
})