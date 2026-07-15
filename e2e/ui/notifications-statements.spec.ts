import { test, expect } from '../fixtures/index'
import {
  dismissOnlyOfficeDialogs,
  saveNotificationFromEditor,
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
 * UI P1-8: Notifications / Statements
 * - Shallow: tabs from /orders → h1 + create form headings
 * - Deep (notif only): draft → OnlyOffice «Сохранить уведомление» → list → cleanup
 *
 * Requires: FE, BE; deep test also OnlyOffice DS (e.g. :8085).
 *
 * Note: shared UI TabsTrigger is a plain <button> (no role=tab) — use button name.
 */
test.describe('Notifications / Statements @ui', () => {
  test('@ui notifications/statements: shallow tabs + create form headings', async ({ page }) => {
    await page.goto('/orders')
    await expect(page.getByRole('heading', { name: /^Приказы$/, level: 1 })).toBeVisible({
      timeout: 20_000,
    })

    // Tab «Уведомления» (custom TabsTrigger → button, not role=tab)
    await page.getByRole('button', { name: 'Уведомления', exact: true }).click()
    await expect(page).toHaveURL(/\/orders\/notifications/)
    await expect(page.getByRole('heading', { name: 'Уведомления', level: 1 })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('heading', { name: 'Создать уведомление' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Создать уведомление' })).toBeVisible()

    // Tab «Заявления»
    await page.getByRole('button', { name: 'Заявления', exact: true }).click()
    await expect(page).toHaveURL(/\/orders\/statements/)
    await expect(page.getByRole('heading', { name: 'Заявления', level: 1 })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('heading', { name: 'Создать заявление' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Создать заявление' })).toBeVisible()
  })

  test('@ui notifications: create draft → OnlyOffice save → row in list', async ({
    page,
    apiOps,
  }) => {
    test.setTimeout(180_000)

    const u = apiOps.uid()
    const empName = `e2e-emp-notif-oo-${u}`
    // Distinct number reduces list collision under residual data
    const notifNumber = `E2EN${Date.now().toString().slice(-6)}`

    const types = await apiOps.getNotificationTypes(true)
    expect(
      types.length,
      'active notification types must exist (seed/default types)'
    ).toBeGreaterThan(0)
    const pick = types[0]
    expect(pick.name, 'notification type name').toBeTruthy()

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    await page.goto('/orders/notifications')
    await expect(page.getByRole('heading', { name: 'Уведомления', level: 1 })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('heading', { name: 'Создать уведомление' })).toBeVisible()

    // Type first, then employee — type change resets extra_fields; employee auto-fills contracts
    const typeInput = page.getByPlaceholder('Выберите тип...')
    await expect(typeInput).toBeVisible({ timeout: 10_000 })
    await typeInput.click()
    await typeInput.fill(pick.name)
    const typeOption = page.locator('button').filter({ hasText: pick.name }).first()
    await expect(typeOption).toBeVisible({ timeout: 8_000 })
    await typeOption.click()
    await expect(page.getByText(pick.name, { exact: true }).first()).toBeVisible({ timeout: 5_000 })

    // Employee search (notifications placeholder differs from orders)
    const empSearch = page.getByPlaceholder('Выберите сотрудника').first()
    await expect(empSearch).toBeVisible({ timeout: 10_000 })
    await empSearch.click()
    await empSearch.fill(empName)
    const empOption = page.locator('button').filter({ hasText: empName }).first()
    await expect(empOption).toBeVisible({ timeout: 10_000 })
    await empOption.click()
    await expect(page.getByText(empName, { exact: false }).first()).toBeVisible({ timeout: 5_000 })

    // Number (required)
    const numberInput = page.getByLabel(/номер уведомления/i)
    await expect(numberInput).toBeVisible({ timeout: 10_000 })
    await numberInput.click()
    await numberInput.fill(notifNumber)
    await numberInput.blur()

    // Required new_contract_end (layout labels «Конец» ×2 — second is «Новый контракт»)
    // Employee auto-fill sets old_* + new_contract_start from contract_end; end of new is still empty.
    const endLabels = page.locator('label').filter({ hasText: /^Конец/ })
    const endCount = await endLabels.count()
    if (endCount >= 2) {
      // nth: second «Конец» under «Новый контракт»
      const endInput = endLabels.nth(1).locator('..').locator('input').first()
      if (await endInput.isVisible().catch(() => false)) {
        const cur = await endInput.inputValue().catch(() => '')
        if (!cur) {
          await endInput.click()
          await endInput.fill(todayDisplay())
          await endInput.blur()
        }
      }
    } else {
      // Fallback: any empty required date under create form
      const newEnd = page
        .getByLabel(/новая дата конца|конец нового|дата конца/i)
        .first()
      if (await newEnd.isVisible().catch(() => false)) {
        const cur = await newEnd.inputValue().catch(() => '')
        if (!cur) {
          await newEnd.fill(todayDisplay())
          await newEnd.blur()
        }
      }
    }

    page.on('dialog', (d) => d.accept().catch(() => {}))

    const draftRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/notifications/drafts') &&
        r.request().method() === 'POST' &&
        r.status() < 400,
      { timeout: 60_000 }
    )

    const popupPromise = page.waitForEvent('popup', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Создать уведомление' }).click()
    const editor = await popupPromise
    editor.on('dialog', (d) => d.accept().catch(() => {}))

    const draftResp = await draftRespPromise
    const draftBody = (await draftResp.json().catch(() => ({}))) as {
      notification_id?: number
      draft_id?: string
    }
    const notificationId = draftBody.notification_id
    expect(notificationId, 'draft notification_id').toBeTruthy()
    if (notificationId) apiOps.trackNotification(notificationId)

    // Wait OnlyOffice config for notification entity
    await editor.waitForLoadState('domcontentloaded')
    await editor.waitForURL(new RegExp(`/notifications/${notificationId}/edit-docx`), {
      timeout: 60_000,
    })
    await editor.waitForResponse(
      (r) =>
        r.url().includes('/onlyoffice/config') &&
        r.url().includes('/notifications/') &&
        r.ok(),
      { timeout: 60_000 }
    )

    await dismissOnlyOfficeDialogs(editor)
    await saveNotificationFromEditor(editor)

    // List: reload + assert row (employee and/or number)
    await page.goto('/orders/notifications')
    await expect(page.getByRole('heading', { name: 'Уведомления', level: 1 })).toBeVisible({
      timeout: 15_000,
    })

    // Expand filters and search by number if available
    const filtersHeading = page.locator('h2').filter({ hasText: 'Фильтры' })
    if (await filtersHeading.isVisible().catch(() => false)) {
      const numberFilter = page.getByPlaceholder(/поиск по номеру/i)
      if (!(await numberFilter.isVisible().catch(() => false))) {
        await filtersHeading.click().catch(() => {})
      }
      if (await numberFilter.isVisible().catch(() => false)) {
        await numberFilter.fill(notifNumber)
        await page
          .waitForResponse(
            (r) =>
              r.url().includes('/api/notifications') &&
              r.request().method() === 'GET' &&
              r.ok(),
            { timeout: 15_000 }
          )
          .catch(() => {})
      }
    }

    await expect(
      page
        .getByText(empName, { exact: false })
        .or(page.getByText(notifNumber, { exact: false }))
        .first()
    ).toBeVisible({ timeout: 20_000 })

    // Stronger: API list contains notification
    const items = await apiOps.getNotifications({ employee_id: employee.id })
    const found = items.find(
      (n) =>
        n.id === notificationId ||
        (n.number && String(n.number).includes(notifNumber))
    )
    expect(found, 'notification present via API after OO save').toBeTruthy()

    // Cleanup DELETE (also tracked for fixture teardown)
    if (found?.id) {
      await apiOps.deleteNotification(found.id).catch(() => {})
    } else if (notificationId) {
      await apiOps.deleteNotification(notificationId).catch(() => {})
    }
  })
})
