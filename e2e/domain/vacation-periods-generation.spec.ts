import { test, expect } from '../fixtures'
import type { VacationPeriodData } from '../types'
import { expectPeriodInvariant } from '../helpers/vacation-invariants'

test.describe('Генерация отпускных периодов', () => {
  test.setTimeout(15000)

  test('1) авто-генерация периодов для нового сотрудника', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
    })
    console.log(`[T1] Сотрудник id=${emp.id}`)

    await test.step('Периоды создаются автоматически при запросе', async () => {
      const periods = await apiOps.getPeriods(emp.id)
      console.log(`[T1] Создано периодов: ${periods.length}`)
      expect(periods.length).toBeGreaterThanOrEqual(1)

      for (const p of periods) {
        console.log(`[T1]   Год ${p.year_number}: ${p.period_start} — ${p.period_end}, total=${p.total_days}`)
        expect(p.period_id).toBeTruthy()
        expect(p.year_number).toBeGreaterThanOrEqual(1)
        expect(p.main_days).toBe(24)
        expect(p.total_days).toBeGreaterThanOrEqual(0)
        expectPeriodInvariant(p)
      }
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T1] === Завершено ===')
  })

  test('2) структура дат периода (contract_start + 12мес * year)', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-03-01',
    })

    await test.step('Год 1: 2024-03-01 — 2025-02-28', async () => {
      const periods = await apiOps.getPeriods(emp.id)
      const year1 = periods.find((p: VacationPeriodData) => p.year_number === 1)
      expect(year1).toBeTruthy()
      console.log(`[T2] Год 1: ${year1!.period_start} — ${year1!.period_end}`)
      expect(year1!.period_start).toBe('2024-03-01')
      expect(year1!.period_end).toBe('2025-02-28')
    })

    await test.step('Год 2: 2025-03-01 — 2026-02-28', async () => {
      const periods = await apiOps.getPeriods(emp.id)
      const year2 = periods.find((p: VacationPeriodData) => p.year_number === 2)
      if (year2) {
        console.log(`[T2] Год 2: ${year2.period_start} — ${year2.period_end}`)
        expect(year2.period_start).toBe('2025-03-01')
        expect(year2.period_end).toBe('2026-02-28')
      } else {
        console.log('[T2] Год 2 ещё не создан (будущий)')
      }
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T2] === Завершено ===')
  })

  test('3) поля периода по умолчанию (main=24, additional=0, used=0)', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    await test.step('Каждый период имеет корректные дефолтные поля', async () => {
      const periods = await apiOps.getPeriods(emp.id)
      expect(periods.length).toBeGreaterThanOrEqual(1)

      for (const p of periods) {
        console.log(`[T3] Год ${p.year_number}: main=${p.main_days}, add=${p.additional_days}, used=${p.used_days}, remaining=${p.remaining_days}`)
        expect(p.main_days).toBe(24)
        expect(p.additional_days).toBe(0)
        expect(p.used_days).toBe(0)
        expectPeriodInvariant(p)
      }
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T3] === Завершено ===')
  })

  test('4) баланс текущего периода — accrued пропорционально месяцам', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-06-01',
      additional_vacation_days: 0,
    })

    await test.step('Текущий период: total_days пропорционален прошедшим месяцам', async () => {
      const periods = await apiOps.getPeriods(emp.id)

      const now = new Date()
      const currentPeriod = periods.find((p: VacationPeriodData) => {
        const start = new Date(p.period_start)
        const end = new Date(p.period_end)
        return start <= now && now <= end
      })

      if (currentPeriod) {
        const periodStart = new Date(currentPeriod.period_start)
        let monthsPassed = (now.getFullYear() - periodStart.getFullYear()) * 12
          + (now.getMonth() - periodStart.getMonth())
        if (now.getDate() > 1) monthsPassed += 1

        const expectedAccrued = Math.round(24 / 12 * monthsPassed)
        console.log(`[T4] Текущий период: год ${currentPeriod.year_number}, period_start=${currentPeriod.period_start}, monthsPassed=${monthsPassed}, expectedAccrued=${expectedAccrued}, actual_total=${currentPeriod.total_days}`)
        expect(currentPeriod.total_days).toBe(expectedAccrued)
        expectPeriodInvariant(currentPeriod)
      } else {
        console.log('[T4] Текущий период не найден (сотрудник создан в будущем?)')
      }
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T4] === Завершено ===')
  })

  test('5) изменение additional_vacation_days у сотрудника синхронизирует все периоды', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    let periods = await apiOps.getPeriods(emp.id)
    const countBefore = periods.length
    console.log(`[T5] Периодов до: ${countBefore}`)
    for (const p of periods) {
      expect(p.additional_days).toBe(0)
    }

    await test.step('Установка additional_vacation_days=7', async () => {
      await apiOps.updateEmployee(emp.id, { additional_vacation_days: 7 })
    })

    await test.step('Все периоды обновили additional_days', async () => {
      periods = await apiOps.getPeriods(emp.id)
      expect(periods.length).toBe(countBefore)
      for (const p of periods) {
        console.log(`[T5]   Год ${p.year_number}: additional=${p.additional_days}, total=${p.total_days}`)
        expect(p.additional_days).toBe(7)
      }
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T5] === Завершено ===')
  })

  test('6) adjust — изменение additional_days конкретного периода', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    const periods = await apiOps.getPeriods(emp.id)
    const targetPeriod = periods[periods.length - 1]
    console.log(`[T6] Целевой период: год ${targetPeriod.year_number}, id=${targetPeriod.period_id}`)

    await test.step('Установка additional_days=10 для одного периода', async () => {
      const adjusted = await apiOps.adjustPeriod(targetPeriod.period_id, 10)
      console.log(`[T6] После adjust: additional=${adjusted.additional_days}, total=${adjusted.total_days}, remaining=${adjusted.remaining_days}`)
      expect(adjusted.additional_days).toBe(10)
      expect(adjusted.total_days).toBe(24 + 10)
      expectPeriodInvariant(adjusted)
    })

    await test.step('Баланс периода через GET /{id}/balance подтверждает', async () => {
      const balance = await apiOps.getPeriodBalance(targetPeriod.period_id)
      expect(balance.additional_days).toBe(10)
      expect(balance.total_days).toBe(24 + 10)
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T6] === Завершено ===')
  })

  test('7) close — полное закрытие периода', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 3,
    })

    const periods = await apiOps.getPeriods(emp.id)
    const targetPeriod = periods[periods.length - 1]
    console.log(`[T7] Целевой: год ${targetPeriod.year_number}, total=${targetPeriod.total_days}, remaining=${targetPeriod.remaining_days}`)

    await test.step('Закрытие периода', async () => {
      const closed = await apiOps.closePeriod(targetPeriod.period_id)
      console.log(`[T7] После close: used=${closed.used_days}, remaining=${closed.remaining_days}`)
      expect(closed.remaining_days).toBe(0)
      expect(closed.used_days).toBe(closed.total_days)
    })

    await test.step('Баланс подтверждает нулевой остаток', async () => {
      const balance = await apiOps.getPeriodBalance(targetPeriod.period_id)
      expect(balance.remaining_days).toBe(0)
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T7] === Завершено ===')
  })

  test('8) partial-close — частичное закрытие периода', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    const periods = await apiOps.getPeriods(emp.id)
    const targetPeriod = periods[periods.length - 1]
    const totalBefore = targetPeriod.total_days
    console.log(`[T8] Целевой: год ${targetPeriod.year_number}, total=${totalBefore}`)

    await test.step('Частичное закрытие: оставить 5 дней', async () => {
      const partial = await apiOps.partialClosePeriod(targetPeriod.period_id, 5)
      console.log(`[T8] После partial-close: used=${partial.used_days}, remaining=${partial.remaining_days}`)
      expect(partial.remaining_days).toBe(5)
      expect(partial.used_days).toBe(partial.total_days - 5)
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T8] === Завершено ===')
  })

  test('9) списание дней при создании отпуска — FIFO (старые периоды первые)', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2023-06-01',
      additional_vacation_days: 0,
    })

    let periods = await apiOps.getPeriods(emp.id)
    console.log(`[T9] Периодов: ${periods.length}`)
    for (const p of periods) {
      console.log(`[T9]   Год ${p.year_number}: remaining=${p.remaining_days}`)
    }

    const oldestPeriod = [...periods].sort((a: VacationPeriodData, b: VacationPeriodData) => a.year_number - b.year_number)[0]
    console.log(`[T9] Старейший период: год ${oldestPeriod.year_number}, remaining=${oldestPeriod.remaining_days}`)

    await test.step('Создание отпуска на 5 дней', async () => {
      const vac = await apiOps.createVacation(emp.id, {
        start_date: '2025-01-10',
        end_date: '2025-01-16',
      })
      console.log(`[T9] Отпуск: ${vac.days_count} дней`)
    })

    await test.step('Дни списались из старейшего периода', async () => {
      periods = await apiOps.getPeriods(emp.id)
      const updatedOldest = periods.find((p: VacationPeriodData) => p.year_number === oldestPeriod.year_number)
      if (updatedOldest) {
        console.log(`[T9] Старейший после отпуска: used=${updatedOldest.used_days}, remaining=${updatedOldest.remaining_days}`)
        expect(updatedOldest.used_days).toBeGreaterThan(0)
      }
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T9] === Завершено ===')
  })

  test('10) полный цикл: создание → отпуск → закрытие → проверка', async ({ apiOps }) => {
    const emp = await apiOps.createEmployee({
      contract_start: '2024-01-15',
      additional_vacation_days: 5,
    })

    await test.step('Начальное состояние: total=29 для каждого периода', async () => {
      const periods = await apiOps.getPeriods(emp.id)
      for (const p of periods) {
        console.log(`[T10]   Год ${p.year_number}: main=${p.main_days}, add=${p.additional_days}, total_full=${p.main_days + p.additional_days}`)
        expect(p.main_days).toBe(24)
        expect(p.additional_days).toBe(5)
      }
    })

    await test.step('Создание отпуска на 7 дней', async () => {
      const vac = await apiOps.createVacation(emp.id, {
        start_date: '2024-06-01',
        end_date: '2024-06-09',
      })
      console.log(`[T10] Отпуск: ${vac.days_count} дней`)
    })

    let periodsAfterVacation: VacationPeriodData[]
    await test.step('Баланс изменился', async () => {
      periodsAfterVacation = await apiOps.getPeriods(emp.id)
      const withUsed = periodsAfterVacation!.filter((p: VacationPeriodData) => p.used_days > 0)
      console.log(`[T10] Периодов с used>0: ${withUsed.length}`)
      expect(withUsed.length).toBeGreaterThanOrEqual(1)
    })

    await test.step('Закрытие старейшего периода', async () => {
      const sorted = [...periodsAfterVacation!].sort((a: VacationPeriodData, b: VacationPeriodData) => a.year_number - b.year_number)
      const oldest = sorted[0]
      const closed = await apiOps.closePeriod(oldest.period_id)
      console.log(`[T10] Закрыт год ${oldest.year_number}: used=${closed.used_days}, remaining=${closed.remaining_days}`)
      expect(closed.remaining_days).toBe(0)
    })

    await test.step('Итоговая проверка всех периодов', async () => {
      const finalPeriods = await apiOps.getPeriods(emp.id)
      for (const p of finalPeriods) {
        console.log(`[T10]   Год ${p.year_number}: used=${p.used_days}, remaining=${p.remaining_days}, total=${p.total_days}`)
        expectPeriodInvariant(p)
      }
    })

    await apiOps.cleanupEmployee(emp.id)
    console.log('[T10] === Завершено ===')
  })
})
