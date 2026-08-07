import { test, expect } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'
import {
  dismissOnlyOfficeDialogs,
  saveDraftOrderFromEditor,
} from '../helpers/onlyoffice-editor'

/**
 * UI: создать приказ для конкретного сотрудника → редактор OnlyOffice (draft)
 * → «Сохранить приказ» → commit → приказ виден в реестре.
 *
 * Prefill: employee via API (apiOps). Order type: Перевод (transfer) — минимум extra fields.
 * Requires: FE, BE, OnlyOffice DS (ONLYOFFICE_PUBLIC_URL, e.g. :8085).
 */
test.describe('Orders OnlyOffice create @ui', () => {
  test.setTimeout(180_000)

  test('@ui orders: select employee → OnlyOffice draft → save → order in list', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-ord-oo-${u}`
    const orderNumber = `E2E${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    // Prefer «Перевод» / transfer — optional fields only
    let typeName = 'Перевод'
    try {
      await apiOps.getOrderTypeId({ code: 'transfer' })
    } catch {
      // fallback: first non-dismissal from list
      const types = await apiOps.getOrderTypes()
      const pick =
        types.find((t) => t.code === 'transfer') ||
        types.find((t) => t.code !== 'dismissal' && t.code !== 'general_order' && t.show_in_orders_page !== false) ||
        types[0]
      typeName = pick?.name || 'Перевод'
    }

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName(typeName)

    // Order number — required; date usually prefilled today
    await ordersPage.fillOrderNumber(orderNumber)

    // Draft create + OnlyOffice popup
    const draftRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/orders/drafts') &&
        r.request().method() === 'POST' &&
        r.status() < 400,
      { timeout: 60_000 }
    )

    // Accept browser alerts (e.g. forceSave failure messages)
    page.on('dialog', (d) => d.accept().catch(() => {}))
    const editor = await ordersPage.createOrderOpenEditor()
    editor.on('dialog', (d) => d.accept().catch(() => {}))

    const draftResp = await draftRespPromise
    const draftBody = await draftResp.json().catch(() => ({} as { draft_id?: string }))
    const draftId = draftBody.draft_id as string | undefined
    expect(draftId || editor.url()).toBeTruthy()

    // Wait OnlyOffice config ready (document key)
    await editor.waitForResponse(
      (r) =>
        r.url().includes('/onlyoffice/config') &&
        r.url().includes('/drafts/') &&
        r.ok(),
      { timeout: 60_000 }
    )

    // Warm-up dismiss (same sequence as before helper extraction)
    await dismissOnlyOfficeDialogs(editor)

    const { orderId } = await saveDraftOrderFromEditor(editor)

    // Verify in registry: reload list, search by number / employee
    await page.goto('/orders')
    await expect(ordersPage.heading).toBeVisible({ timeout: 15_000 })

    // Filter by order number if filter exists
    const numberFilter = page.getByPlaceholder(/номер/i).first()
    if (await numberFilter.isVisible().catch(() => false)) {
      await numberFilter.fill(orderNumber)
      await page.keyboard.press('Enter').catch(() => {})
    }

    await expect(
      page.getByText(orderNumber, { exact: false }).or(page.getByText(empName, { exact: false })).first()
    ).toBeVisible({ timeout: 20_000 })

    // Stronger: API sees the order
    const items = await apiOps.getOrders({ employee_id: employee.id })
    const found = items.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber) ||
        (o.employee_name && o.employee_name.includes(empName))
    )
    expect(found, 'order present via API after OO save').toBeTruthy()

    if (found?.id) {
      await apiOps.deleteOrder(found.id).catch(() => {})
    } else if (orderId) {
      await apiOps.deleteOrder(orderId).catch(() => {})
    }
  })
})
