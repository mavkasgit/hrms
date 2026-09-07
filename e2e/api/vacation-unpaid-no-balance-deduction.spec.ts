/**
 * Регрессия c16d740: «Отпуск за свой счет» через прямой приказ
 * (POST /orders с order_type_code=vacation_unpaid) НЕ должен уменьшать
 * баланс трудового отпуска сотрудника.
 *
 * Бэкенд-механика (kwarg vacation_type, ValueError в auto_use_days,
 * gate в _create_auto_vacation) покрыта backend pytest
 * (test_vacation_unpaid_no_deduction.py). Этот e2e проверяет,
 * что HTTP-контракт действительно не трогает vacation_periods.
 */
import { test, expect } from '../fixtures/index'

test.describe('Unpaid vacation order does not touch paid balance @api', () => {
  test.setTimeout(60_000)

  test('@api POST /orders vacation_unpaid → period balance unchanged', async ({
    apiOps,
  }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-vac-unpaid-${u}`,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })
    const unpaidTypeId = await apiOps.getOrderTypeId({ code: 'vacation_unpaid' })
    const orderNumber = `E2EUNP${Date.now().toString().slice(-6)}`

    let orderId: number | undefined
    try {
      // Baseline: capture per-period used_days before creating unpaid order.
      const beforePeriods = await apiOps.getVacationPeriods(emp.id)
      const totalBefore = beforePeriods.reduce(
        (sum, p) =>
          sum +
          ((p.main_days || 0) +
            (p.additional_days || 0) -
            (p.used_days || 0)),
        0,
      )
      const usedBefore = beforePeriods.map((p) => ({
        id: p.id,
        used_days: p.used_days,
        used_days_auto: p.used_days_auto ?? 0,
      }))

      // Create vacation_unpaid order (the path that c16d740 broke).
      const order = await apiOps.createOrder(emp.id, {
        order_type_id: unpaidTypeId,
        order_number: orderNumber,
        order_date: '2027-04-01',
        extra_fields: {
          vacation_start: '2027-04-05',
          vacation_end: '2027-04-09',
        },
      })
      orderId = order.id
      expect(order.order_type_code).toBe('vacation_unpaid')

      // Total remaining paid balance must be unchanged.
      const afterPeriods = await apiOps.getVacationPeriods(emp.id)
      const totalAfter = afterPeriods.reduce(
        (sum, p) =>
          sum +
          ((p.main_days || 0) +
            (p.additional_days || 0) -
            (p.used_days || 0)),
        0,
      )
      expect(totalAfter).toBe(totalBefore)

      // Per-period used_days must be unchanged.
      for (const before of usedBefore) {
        const after = afterPeriods.find((p) => p.id === before.id)
        expect(after, `period ${before.id} must still exist`).toBeDefined()
        expect(after!.used_days).toBe(before.used_days)
        expect(after!.used_days_auto).toBe(before.used_days_auto)
      }
    } finally {
      if (orderId) await apiOps.deleteOrder(orderId).catch(() => {})
      await apiOps.deleteEmployee(emp.id).catch(() => {})
    }
  })
})
