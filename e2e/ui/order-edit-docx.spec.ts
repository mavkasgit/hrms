import { test, expect } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'
import {
  dismissOnlyOfficeDialogs,
  saveExistingOrderFromEditor,
} from '../helpers/onlyoffice-editor'

/**
 * UTC calendar date (YYYY-MM-DD). Prefer over local "today": BE uses date.today()
 * which may be UTC, so local midnight+ can 422 "order_date in the future".
 */
function utcDateISO(daysAgo = 0): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

/**
 * UI P0-2: existing order → «Редактировать DOCX» → OnlyOffice config →
 * «Сохранить приказ» → forcesave (no commit).
 *
 * Seed: prefer apiOps.createOrder (transfer) — backend generate_document sets file_path.
 * Requires: FE, BE, OnlyOffice DS (ONLYOFFICE_PUBLIC_URL, e.g. :8085).
 */
test.describe('Orders edit existing DOCX @ui', () => {
  test.setTimeout(180_000)

  test('@ui orders: open edit-docx → OnlyOffice → forcesave (no commit)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-edit-oo-${u}`
    // Same year as default UI year filter; not future for BE (UTC-safe).
    const orderDate = utcDateISO(1)
    const transferDate = utcDateISO(0)

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    const transferOrderTypeId = await apiOps.getOrderTypeId({
      code: 'transfer',
      visibleOnly: true,
    })

    // Like catalog.spec.ts: omit custom order_number (backend assigns numeric-like №).
    const order = await apiOps.createOrder(employee.id, {
      order_type_id: transferOrderTypeId,
      order_date: orderDate,
      extra_fields: {
        transfer_date: transferDate,
        transfer_reason: 'e2e edit-docx',
      },
    })
    expect(order.id).toBeGreaterThan(0)
    expect(order.order_number, 'backend must assign order_number').toBeTruthy()
    // Direct create generates DOCX (order_service.generate_document); file required for OO config
    expect(order.file_path, 'createOrder must yield file_path for edit-docx').toBeTruthy()

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()

    page.on('dialog', (d) => d.accept().catch(() => {}))

    // Backend-assigned number (not custom alphanumeric); page object scopes filter to «Фильтры».
    const editor = await ordersPage.openEditDocxForOrder(String(order.order_number))
    editor.on('dialog', (d) => d.accept().catch(() => {}))

    // openEditDocxForOrder already waited GET .../orders/{id}/onlyoffice/config ok
    await expect(editor).toHaveURL(new RegExp(`/orders/${order.id}/edit-docx`))

    await dismissOnlyOfficeDialogs(editor)
    await saveExistingOrderFromEditor(editor)

    // Cleanup: order first (FK), employee via fixture teardown
    await apiOps.deleteOrder(order.id).catch(() => {})
  })
})
