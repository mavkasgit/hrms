import { test, expect } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'
import {
  dismissOnlyOfficeDialogs,
  saveDraftOrderFromEditor,
} from '../helpers/onlyoffice-editor'

/**
 * UI P1-10: contract_extension + general_order via /orders create form +
 * OnlyOffice draft → save/commit.
 * Requires: FE, BE, OnlyOffice DS (ONLYOFFICE_PUBLIC_URL, e.g. :8085).
 * new_contract: out of scope this wave.
 *
 * Dates: FE prefill uses toISOString (UTC today) — avoid local-today future 422.
 */
test.describe('Orders other types OnlyOffice @ui', () => {
  test.setTimeout(180_000)

  test('@ui orders: contract_extension → OnlyOffice draft → save → order in list', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-ce-oo-${u}`
    const orderNumber = `E2ECE${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    await apiOps.getOrderTypeId({ code: 'contract_extension' })
    const types = await apiOps.getOrderTypes()
    const ceType = types.find((t) => t.code === 'contract_extension')
    expect(ceType, 'contract_extension order type must exist').toBeTruthy()
    const typeName = ceType!.name

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName(typeName)
    await ordersPage.fillOrderNumber(orderNumber)

    // Layout extras are optional (required: false). Leave empty if validation allows.
    // Order date is prefilled (UTC via FE toISOString); leave as-is.

    const draftRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/orders/drafts') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/commit') &&
        r.status() < 400,
      { timeout: 60_000 }
    )

    page.on('dialog', (d) => d.accept().catch(() => {}))
    const editor = await ordersPage.createOrderOpenEditor()
    editor.on('dialog', (d) => d.accept().catch(() => {}))

    const draftResp = await draftRespPromise
    const draftBody = await draftResp.json().catch(() => ({} as { draft_id?: string }))
    expect(draftBody.draft_id || editor.url()).toBeTruthy()

    await editor.waitForResponse(
      (r) =>
        r.url().includes('/onlyoffice/config') &&
        r.url().includes('/drafts/') &&
        r.ok(),
      { timeout: 60_000 }
    )

    await dismissOnlyOfficeDialogs(editor)
    const { orderId } = await saveDraftOrderFromEditor(editor)

    await page.goto('/orders')
    await expect(ordersPage.heading).toBeVisible({ timeout: 15_000 })

    const items = await apiOps.getOrders({ employee_id: employee.id })
    const found = items.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber) ||
        (o.employee_name && o.employee_name.includes(empName))
    )
    expect(found, 'contract_extension order present via API after OO save').toBeTruthy()

    if (found?.id) {
      await apiOps.deleteOrder(found.id).catch(() => {})
    } else if (orderId) {
      await apiOps.deleteOrder(orderId).catch(() => {})
    }
  })

  test('@ui orders: general_order tab → OnlyOffice draft → save → order in list', async ({
    page,
    apiOps,
  }) => {
    // Numeric-ish base; general_order has no letter suffix.
    const orderNumber = `e2e-g${Date.now().toString().slice(-7)}`

    // Ensure type exists (seed)
    const generalTypeId = await apiOps.getOrderTypeId({ code: 'general_order' })
    expect(generalTypeId).toBeGreaterThan(0)

    const ordersPage = new OrdersPage(page)

    // Race: FE builds payload with generalOrderType?.id ?? 0 until /orders/types loads.
    // Attach wait BEFORE navigation so we do not miss the response.
    const typesRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/orders/types') &&
        r.request().method() === 'GET' &&
        r.ok(),
      { timeout: 30_000 }
    )

    await ordersPage.goto()
    await typesRespPromise

    await ordersPage.switchToGeneralTab()

    // When generalOrderType resolves, OrderNumberField enables next-number fetch.
    const numberField = page.getByLabel(/номер приказа/i).first()
    await expect(numberField).toBeVisible({ timeout: 10_000 })
    await page
      .waitForResponse(
        (r) =>
          r.url().includes('/orders/next-number') &&
          r.url().includes(`order_type_id=${generalTypeId}`) &&
          r.ok(),
        { timeout: 15_000 }
      )
      .catch(() => {
        /* may already be cached / fired before wait */
      })

    await ordersPage.fillOrderNumber(orderNumber)

    const draftRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/orders/drafts') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/commit') &&
        r.status() < 400,
      { timeout: 60_000 }
    )

    page.on('dialog', (d) => d.accept().catch(() => {}))
    const editor = await ordersPage.createOrderOpenEditor()
    editor.on('dialog', (d) => d.accept().catch(() => {}))

    const draftResp = await draftRespPromise
    const draftBody = await draftResp.json().catch(() => ({} as { draft_id?: string }))
    expect(draftBody.draft_id || editor.url()).toBeTruthy()

    await editor.waitForResponse(
      (r) =>
        r.url().includes('/onlyoffice/config') &&
        r.url().includes('/drafts/') &&
        r.ok(),
      { timeout: 60_000 }
    )

    await dismissOnlyOfficeDialogs(editor)
    const { orderId } = await saveDraftOrderFromEditor(editor)

    // Return to general tab list and API assert
    await page.goto('/orders')
    await expect(ordersPage.heading).toBeVisible({ timeout: 15_000 })
    await ordersPage.switchToGeneralTab()

    const items = await apiOps.getOrders({ order_type_code: 'general_order' })
    const found = items.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber)
    )
    expect(found, 'general_order present via API after OO save').toBeTruthy()

    if (found?.id) {
      await apiOps.deleteOrder(found.id).catch(() => {})
    } else if (orderId) {
      await apiOps.deleteOrder(orderId).catch(() => {})
    }
  })
})
