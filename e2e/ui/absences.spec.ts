import { test, expect } from '../fixtures/index'
import { AbsencesPage } from '../pages/AbsencesPage'

/**
 * Absences UI: unpaid leaves, weekend calls, sick leaves.
 */
test.describe('Absences @ui', () => {
  test.setTimeout(60_000)

  test('@ui absences: sidebar links under Отсутствия', async ({ page }) => {
    const abs = new AbsencesPage(page)
    await abs.openSidebarLinks()
  })

  test('@ui absences: /unpaid-leaves filters order_type_code=vacation_unpaid', async ({
    page,
  }) => {
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'GET' &&
        request.url().includes('/api/orders/all') &&
        request.url().includes('order_type_code=vacation_unpaid')
    )

    const abs = new AbsencesPage(page)
    await abs.gotoUnpaidLeaves()
    await requestPromise
  })

  test('@ui absences: /weekend-calls filters order_type_code=weekend_call', async ({
    page,
  }) => {
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'GET' &&
        request.url().includes('/api/orders/all') &&
        request.url().includes('order_type_code=weekend_call')
    )

    const abs = new AbsencesPage(page)
    await abs.gotoWeekendCalls()
    await requestPromise
  })

  test('@ui absences: /sick-leaves page renders', async ({ page }) => {
    const abs = new AbsencesPage(page)
    await abs.gotoSickLeaves()
  })

  test('@ui absences: unpaid leaves page shows order actions', async ({ page, apiOps }) => {
    const employee = await apiOps.createEmployee({
      name: `e2e-emp-unpaid-${apiOps.uid()}`,
    })
    const unpaidTypeId = await apiOps.getOrderTypeId({ code: 'vacation_unpaid' })

    await apiOps.createOrder(employee.id, {
      order_type_id: unpaidTypeId,
      order_date: '2026-04-03',
      order_number: `92${Date.now() % 100}`,
      extra_fields: {
        vacation_start: '2026-04-10',
        vacation_end: '2026-04-12',
        vacation_days: 3,
      },
    })

    const abs = new AbsencesPage(page)
    await abs.gotoUnpaidLeaves()
    await abs.expectOrderRowActions()
  })

  test('@ui absences: unpaid totals for selected period', async ({ page, apiOps }) => {
    const employee = await apiOps.createEmployee({
      name: `e2e-emp-unpaid-stat-${apiOps.uid()}`,
    })
    const unpaidTypeId = await apiOps.getOrderTypeId({ code: 'vacation_unpaid' })

    await apiOps.createOrder(employee.id, {
      order_type_id: unpaidTypeId,
      order_date: '2026-04-01',
      order_number: `93${Date.now() % 100}`,
      extra_fields: {
        vacation_start: '2026-04-05',
        vacation_end: '2026-04-07',
        vacation_days: 3,
      },
    })

    await apiOps.createOrder(employee.id, {
      order_type_id: unpaidTypeId,
      order_date: '2026-04-02',
      order_number: `94${Date.now() % 100}`,
      extra_fields: {
        vacation_start: '2026-04-10',
        vacation_end: '2026-04-12',
        vacation_days: 3,
      },
    })

    const abs = new AbsencesPage(page)
    await abs.gotoUnpaidLeaves()

    await abs.setUnpaidPeriod('01.04.2026', '12.04.2026')

    await expect(abs.unpaidTotalOrders()).toHaveText('Всего отпусков за период: 2')
    await expect(abs.unpaidTotalDays()).toHaveText('Всего дней отпуска: 6')
    await expect(page.getByRole('cell', { name: employee.name }).first()).toBeVisible()

    await abs.setUnpaidPeriod('01.04.2026', '07.04.2026')

    await expect(abs.unpaidTotalOrders()).toHaveText('Всего отпусков за период: 1')
    await expect(abs.unpaidTotalDays()).toHaveText('Всего дней отпуска: 3')
    await abs.expectOrderRowActions()
  })

  test('@ui absences: weekend-call totals for selected period', async ({ page, apiOps }) => {
    const employee = await apiOps.createEmployee({
      name: `e2e-emp-weekend-${apiOps.uid()}`,
    })
    const weekendTypeId = await apiOps.getOrderTypeId({ code: 'weekend_call' })

    await apiOps.createOrder(employee.id, {
      order_type_id: weekendTypeId,
      order_date: '2026-04-01',
      order_number: `90${Date.now() % 100}`,
      extra_fields: { call_date: '2026-04-04' },
    })

    await apiOps.createOrder(employee.id, {
      order_type_id: weekendTypeId,
      order_date: '2026-04-02',
      order_number: `91${Date.now() % 100}`,
      extra_fields: { call_date_start: '2026-04-10', call_date_end: '2026-04-12' },
    })

    const abs = new AbsencesPage(page)
    await abs.gotoWeekendCalls()

    await abs.setWeekendPeriod('01.04.2026', '12.04.2026')

    await expect(abs.weekendTotalCalls()).toHaveText('Всего вызовов за период: 2')
    await expect(abs.weekendTotalDays()).toHaveText('Всего дней вызова: 4')
    await expect(page.getByRole('cell', { name: employee.name }).first()).toBeVisible()

    await abs.setWeekendPeriod('01.04.2026', '04.04.2026')

    await expect(abs.weekendTotalCalls()).toHaveText('Всего вызовов за период: 1')
    await expect(abs.weekendTotalDays()).toHaveText('Всего дней вызова: 1')
    await abs.expectOrderRowActions()
  })
})
