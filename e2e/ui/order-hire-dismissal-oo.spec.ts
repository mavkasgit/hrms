import { test, expect } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'
import {
  dismissOnlyOfficeDialogs,
  saveDraftOrderFromEditor,
} from '../helpers/onlyoffice-editor'

/** Today as DD.MM.YYYY for DatePicker inputs */
function todayDisplay(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

/**
 * UI P0: hire + dismissal orders via /orders create form + OnlyOffice draft → save/commit.
 * Requires: FE, BE, OnlyOffice DS (ONLYOFFICE_PUBLIC_URL, e.g. :8085).
 */
test.describe('Orders hire/dismissal OnlyOffice @ui', () => {
  test.setTimeout(180_000)

  test('@ui orders: hire → OnlyOffice draft → save → order in list', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-hire-oo-${u}`
    const orderNumber = `E2EH${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    // Resolve type name from API (seed code hire)
    await apiOps.getOrderTypeId({ code: 'hire' })
    const types = await apiOps.getOrderTypes()
    const hireType = types.find((t) => t.code === 'hire')
    expect(hireType, 'hire order type must exist').toBeTruthy()
    const typeName = hireType!.name

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName(typeName)
    await ordersPage.fillOrderNumber(orderNumber)

    // Extra fields (layout hire): Дата приема — today if empty; contract if required (none in schema)
    const hireDateInput = page.getByLabel(/дата приема/i).first()
    if (await hireDateInput.isVisible().catch(() => false)) {
      const cur = await hireDateInput.inputValue().catch(() => '')
      if (!cur) {
        await ordersPage.fillExtraFieldByLabel(/дата приема/i, todayDisplay())
      }
    }
    // Contract number if field shown and empty (optional in schema)
    const contractNum = page.getByLabel(/^номер$/i).first()
    if (await contractNum.isVisible().catch(() => false)) {
      const v = await contractNum.inputValue().catch(() => '')
      if (!v) {
        await ordersPage.fillExtraFieldByLabel(/^номер$/i, `e2e-cn-${u}`)
      }
    }

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
    expect(found, 'hire order present via API after OO save').toBeTruthy()

    if (found?.id) {
      await apiOps.deleteOrder(found.id).catch(() => {})
    } else if (orderId) {
      await apiOps.deleteOrder(orderId).catch(() => {})
    }
  })

  test('@ui orders: dismissal confirm → OnlyOffice draft → save → order in list', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-dis-oo-${u}`
    const orderNumber = `E2ED${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    await apiOps.getOrderTypeId({ code: 'dismissal' })
    const types = await apiOps.getOrderTypes()
    const dismissalType = types.find((t) => t.code === 'dismissal')
    expect(dismissalType, 'dismissal order type must exist').toBeTruthy()
    const typeName = dismissalType!.name

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName(typeName)
    await ordersPage.fillOrderNumber(orderNumber)

    // Extra: Дата увольнения if shown
    const dismissalDate = page.getByLabel(/дата увольнения/i).first()
    if (await dismissalDate.isVisible().catch(() => false)) {
      const cur = await dismissalDate.inputValue().catch(() => '')
      if (!cur) {
        await ordersPage.fillExtraFieldByLabel(/дата увольнения/i, todayDisplay())
      }
    }

    const draftRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/orders/drafts') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/commit') &&
        r.status() < 400,
      { timeout: 60_000 }
    )

    page.on('dialog', (d) => d.accept().catch(() => {}))

    // Dismissal: create → confirm dialog «Уволить сотрудника?» → «Уволить» → popup
    const popupPromise = page.waitForEvent('popup', { timeout: 60_000 })
    await ordersPage.createOrderButton.click()
    await ordersPage.confirmDismissalDialog()
    const editor = await popupPromise
    editor.on('dialog', (d) => d.accept().catch(() => {}))
    await editor.waitForLoadState('domcontentloaded')
    await editor.waitForURL(/\/drafts\/[^/]+\/edit-docx/, { timeout: 60_000 })

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

    // API: order exists (employee may be archived as side effect)
    const items = await apiOps.getOrders({ employee_id: employee.id })
    const found = items.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber) ||
        (o.employee_name && o.employee_name.includes(empName))
    )
    expect(found, 'dismissal order present via API after OO save').toBeTruthy()

    // Cleanup: delete order first (may restore employee per backend), then employee via fixture
    if (found?.id) {
      await apiOps.deleteOrder(found.id).catch(() => {})
    } else if (orderId) {
      await apiOps.deleteOrder(orderId).catch(() => {})
    }
  })
})
