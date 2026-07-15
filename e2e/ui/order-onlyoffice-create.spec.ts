import { test, expect } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'

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

    const saveBtn = editor.getByRole('button', { name: 'Сохранить приказ' })
    await expect(saveBtn).toBeVisible({ timeout: 90_000 })

    // Dismiss OnlyOffice onboarding / co-edit name dialogs inside iframe(s)
    async function dismissOnlyOfficeDialogs() {
      for (const frame of editor.frames()) {
        const ok = frame.getByRole('button', { name: /^OK$/i })
        if (await ok.isVisible().catch(() => false)) {
          await ok.click().catch(() => {})
        }
        const otmena = frame.getByRole('button', { name: /отмена/i })
        // prefer OK on name prompt
        const nameOk = frame.locator('button').filter({ hasText: /^OK$/i }).first()
        if (await nameOk.isVisible().catch(() => false)) {
          await nameOk.click().catch(() => {})
        }
      }
      // Top-level OK if any
      const topOk = editor.getByRole('button', { name: /^OK$/i })
      if (await topOk.first().isVisible().catch(() => false)) {
        await topOk.first().click().catch(() => {})
      }
    }

    await dismissOnlyOfficeDialogs()
    await editor.waitForTimeout(1500)
    await dismissOnlyOfficeDialogs()

    // Commit on opener after successful forceSave + postMessage
    const commitPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/orders/drafts/') &&
        r.url().includes('/commit') &&
        r.request().method() === 'POST',
      { timeout: 120_000 }
    )

    // Retry save: forcesave may 502 while Document Server warms up
    let forceSaveOk = false
    for (let attempt = 1; attempt <= 4; attempt++) {
      await dismissOnlyOfficeDialogs()
      const forcePromise = editor.waitForResponse(
        (r) =>
          r.url().includes('/onlyoffice/forcesave') && r.request().method() === 'POST',
        { timeout: 45_000 }
      )
      await saveBtn.click()
      const forceResp = await forcePromise.catch(() => null)
      if (forceResp && forceResp.ok()) {
        forceSaveOk = true
        break
      }
      // Wait DS / retry
      await editor.waitForTimeout(2000 * attempt)
    }
    expect(forceSaveOk, 'OnlyOffice forcesave should succeed (is DS on :8085?)').toBeTruthy()

    const commitResp = await commitPromise
    expect(commitResp.ok(), `commit status ${commitResp.status()}`).toBeTruthy()
    const committed = await commitResp.json()
    const orderId = committed?.id as number | undefined
    expect(orderId, 'committed order id').toBeTruthy()

    await editor.waitForEvent('close', { timeout: 30_000 }).catch(() => {
      /* may already be closed */
    })

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
