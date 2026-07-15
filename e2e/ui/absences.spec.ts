import { test, expect } from '../fixtures/index'

/**
 * Absences UI: unpaid leaves, weekend calls, sick leaves.
 * Legacy: unpaid-leaves-and-weekend-calls.spec.ts (7 intents).
 */
test.describe('Absences @ui', () => {
  test.setTimeout(60_000)

  test('@ui absences: sidebar links under Отсутствия', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Отсутствия' }).click()

    await expect(page.getByRole('link', { name: 'Трудовой отпуск' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Отпуск за свой счет' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Вызовы в выходные дни' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Больничные' })).toBeVisible()
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

    await page.goto('/unpaid-leaves')
    await expect(
      page.getByRole('heading', { name: 'Отпуск за свой счет', exact: true })
    ).toBeVisible({ timeout: 15_000 })
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

    await page.goto('/weekend-calls')
    await expect(
      page.getByRole('heading', { name: 'Вызовы в выходные дни' })
    ).toBeVisible({ timeout: 15_000 })
    await requestPromise
  })

  test('@ui absences: /sick-leaves page renders', async ({ page }) => {
    await page.goto('/sick-leaves')
    await expect(page.getByRole('heading', { name: 'Больничные листы' })).toBeVisible({
      timeout: 15_000,
    })
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

    await page.goto('/unpaid-leaves')
    await expect(page.getByTitle('Просмотр DOCX').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTitle('Скачать приказ').first()).toBeVisible()
    await expect(page.getByTitle('Удалить приказ').first()).toBeVisible()
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

    await page.goto('/unpaid-leaves')

    await page.locator('[data-testid="unpaid-period-from"] input').fill('01.04.2026')
    await page.locator('[data-testid="unpaid-period-to"] input').fill('12.04.2026')

    await expect(page.getByTestId('unpaid-total-orders')).toHaveText(
      'Всего отпусков за период: 2'
    )
    await expect(page.getByTestId('unpaid-total-days')).toHaveText('Всего дней отпуска: 6')
    await expect(page.getByRole('cell', { name: employee.name }).first()).toBeVisible()

    await page.locator('[data-testid="unpaid-period-to"] input').fill('07.04.2026')

    await expect(page.getByTestId('unpaid-total-orders')).toHaveText(
      'Всего отпусков за период: 1'
    )
    await expect(page.getByTestId('unpaid-total-days')).toHaveText('Всего дней отпуска: 3')

    await expect(page.getByTitle('Просмотр DOCX').first()).toBeVisible()
    await expect(page.getByTitle('Скачать приказ').first()).toBeVisible()
    await expect(page.getByTitle('Удалить приказ').first()).toBeVisible()
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

    await page.goto('/weekend-calls')

    await page.locator('[data-testid="weekend-period-from"] input').fill('01.04.2026')
    await page.locator('[data-testid="weekend-period-to"] input').fill('12.04.2026')

    await expect(page.getByTestId('weekend-total-calls')).toHaveText(
      'Всего вызовов за период: 2'
    )
    await expect(page.getByTestId('weekend-total-days')).toHaveText('Всего дней вызова: 4')
    await expect(page.getByRole('cell', { name: employee.name }).first()).toBeVisible()

    await page.locator('[data-testid="weekend-period-to"] input').fill('04.04.2026')

    await expect(page.getByTestId('weekend-total-calls')).toHaveText(
      'Всего вызовов за период: 1'
    )
    await expect(page.getByTestId('weekend-total-days')).toHaveText('Всего дней вызова: 1')

    await expect(page.getByTitle('Просмотр DOCX').first()).toBeVisible()
    await expect(page.getByTitle('Скачать приказ').first()).toBeVisible()
    await expect(page.getByTitle('Удалить приказ').first()).toBeVisible()
  })
})
