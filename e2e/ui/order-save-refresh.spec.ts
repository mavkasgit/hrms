import { test, expect } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'

/**
 * #102: созданный приказ должен появляться в таблице сразу после сигнала
 * сохранения из редактора — без перезагрузки страницы.
 *
 * Не требует OnlyOffice: сигнал `hrms:draft-order-save` диспатчим из самой
 * страницы (тот же путь, что и opener-postMessage редактора), затем ждём
 * повторный GET /api/orders/all (инвалидация глобальным слушателем в Layout)
 * и появление строки в уже открытой таблице.
 */
test.describe('Orders save-signal refresh @ui', () => {
  test('@ui orders: draft-save signal → table refetches → new order visible without reload', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-refresh-${u}`
    const orderNumber = `E2E${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    let orderTypeId = await apiOps.getOrderTypeId({ code: 'transfer' }).catch(() => undefined)
    if (!orderTypeId) {
      const types = await apiOps.getOrderTypes()
      const pick = types.find((t) => t.code === 'transfer') ||
        types.find((t) => t.code !== 'dismissal' && t.code !== 'general_order' && t.show_in_orders_page !== false) ||
        types[0]
      orderTypeId = pick?.id
      expect(orderTypeId, 'no usable order type').toBeTruthy()
    }

    // Базовый приказ — таблица непустая, начальная загрузка завершена.
    await apiOps.createOrder(employee.id, {
      order_type_id: orderTypeId,
      order_date: new Date().toISOString().split('T')[0],
      order_number: orderNumber,
    })

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })

    // Создаём второй приказ напрямую через API (моделируем коммит редактором).
    const secondNumber = `E2E${Date.now().toString().slice(-6)}-2`
    await apiOps.createOrder(employee.id, {
      order_type_id: orderTypeId,
      order_date: new Date().toISOString().split('T')[0],
      order_number: secondNumber,
    })

    // Сигнал «черновик приказа сохранён» — тот же wire-формат, что шлёт редактор.
    const refetchPromise = page.waitForResponse(
      (r) => r.url().includes('/api/orders/all') && r.request().method() === 'GET',
      { timeout: 15_000 }
    )
    await page.evaluate(() => {
      window.postMessage(
        { type: 'hrms:draft-order-save', draftId: 'e2e-refresh-signal' },
        window.location.origin
      )
    })
    await refetchPromise

    // Новая строка видна в уже открытой таблице — без reload (регрессия #102).
    await expect(
      page.locator('tbody tr').filter({ hasText: secondNumber }).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})

