/**
 * Регрессия update-пути отпуска (ADR-0012, «Дополнение 2026-09-07»):
 * PUT /vacations/{id} при смене дат обязан пересчитать баланс периодов —
 * сторнировать старые транзакции списания и списать заново с новым days_count
 * (reverse + reapply по образцу recall_vacation). До фикса update удалял
 * старый приказ через hard_delete_order — CASCADE убивал
 * vacation_period_transactions, баланс «зависал».
 *
 * Покрытие pytest: test_vacation_update_recalculates_balance.py.
 * Здесь — HTTP-контракт.
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Vacation update recalculates period balance @api', () => {
  test.setTimeout(60_000)

  test('@api PUT /vacations extend dates → used_days grows by delta', async ({
    apiOps,
  }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-vac-upd-${u}`,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    // 7 календарных дней трудового отпуска
    const vac = await apiOps.createVacation(emp.id, {
      start_date: '2027-04-01',
      end_date: '2027-04-07',
      vacation_type: 'Трудовой',
    })

    const usedBefore = (await apiOps.getVacationPeriods(emp.id)).reduce(
      (sum, p) => sum + (p.used_days || 0),
      0,
    )
    expect(usedBefore).toBe(7)

    // 7 → 14 дней: баланс должен вырасти на 7
    const updated = await apiOps.updateVacation(vac.id, {
      start_date: '2027-04-01',
      end_date: '2027-04-14',
    })
    expect(updated.days_count).toBe(14)

    const usedAfter = (await apiOps.getVacationPeriods(emp.id)).reduce(
      (sum, p) => sum + (p.used_days || 0),
      0,
    )
    expect(usedAfter).toBe(14)
  })

  test('@api PUT /vacations shorten dates → used_days shrinks by delta', async ({
    apiOps,
  }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-vac-shr-${u}`,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    const vac = await apiOps.createVacation(emp.id, {
      start_date: '2027-04-01',
      end_date: '2027-04-14',
      vacation_type: 'Трудовой',
    })

    const usedBefore = (await apiOps.getVacationPeriods(emp.id)).reduce(
      (sum, p) => sum + (p.used_days || 0),
      0,
    )
    expect(usedBefore).toBe(14)

    // 14 → 7 дней: 7 дней возвращается в баланс
    const updated = await apiOps.updateVacation(vac.id, {
      start_date: '2027-04-01',
      end_date: '2027-04-07',
    })
    expect(updated.days_count).toBe(7)

    const usedAfter = (await apiOps.getVacationPeriods(emp.id)).reduce(
      (sum, p) => sum + (p.used_days || 0),
      0,
    )
    expect(usedAfter).toBe(7)
  })

  test('@api PUT /vacations type change → 409, balance untouched', async ({
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-vac-type-${u}`,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    const vac = await apiOps.createVacation(emp.id, {
      start_date: '2027-04-01',
      end_date: '2027-04-07',
      vacation_type: 'Трудовой',
    })
    const usedBefore = (await apiOps.getVacationPeriods(emp.id)).reduce(
      (sum, p) => sum + (p.used_days || 0),
      0,
    )
    expect(usedBefore).toBe(7)

    // Смена типа через update запрещена (ADR-0012) — 409, не 500
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.put(`/api/vacations/${vac.id}`, {
        data: { vacation_type: 'За свой счет' },
      })
      expect(resp.status()).toBe(409)
    } finally {
      await dispose()
    }

    const usedAfter = (await apiOps.getVacationPeriods(emp.id)).reduce(
      (sum, p) => sum + (p.used_days || 0),
      0,
    )
    expect(usedAfter).toBe(7)
  })
})
