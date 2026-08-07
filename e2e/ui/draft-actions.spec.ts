import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'
import {
  dismissOnlyOfficeDialogs,
  saveDraftOrderFromEditor,
  saveNotificationFromEditor,
} from '../helpers/onlyoffice-editor'

/**
 * UI: действия с черновиками (#86).
 *
 * Разведены «Заполнить» / «Открыть» / «Восстановить» / «Удалить»:
 * - «Восстановить» открывает редактор (edit-docx) с самим документом;
 * - после «Сохранить приказ» черновик коммитится (эндпоинт выбирается по
 *   флагу группового черновика), исчезает из списка, документ — в реестре;
 * - уведомление: «Восстановить» → «Сохранить уведомление» → finalize через
 *   callback OnlyOffice → черновик исчез, уведомление в списке.
 *
 * Requires: FE, BE, OnlyOffice DS (ONLYOFFICE_PUBLIC_URL, e.g. :8085).
 * Только проект `ui` (ночной прогон с DS).
 */
test.describe('Draft actions @ui', () => {
  test('@ui draft actions: single order → /drafts → «Восстановить» → save → committed', async ({
    page,
    apiOps,
    playwright,
  }) => {
    test.setTimeout(180_000)

    const u = apiOps.uid()
    const empName = `e2e-emp-dact-${u}`
    const orderNumber = `E2ED${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)
    const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let draftId: string | undefined
    try {
      const createResp = await request.post(`${API_BASE}/api/orders/drafts`, {
        data: {
          employee_id: employee.id,
          order_type_id: typeId,
          order_date: '2026-01-01',
          order_number: orderNumber,
        },
      })
      expect(createResp.status()).toBe(200)
      draftId = (await createResp.json()).draft_id as string
      expect(draftId).toBeTruthy()

      await page.goto('/drafts')
      await expect(page.getByRole('heading', { name: 'Черновики' })).toBeVisible({
        timeout: 30_000,
      })

      // Счётчик черновиков в сайдбаре до коммита.
      const badge = page.getByRole('button', { name: /Черновики:/ })
      await expect(badge).toBeVisible({ timeout: 30_000 })
      const beforeCount = Number((await badge.getAttribute('aria-label'))?.replace(/\D+/g, '') || '')

      // Строка черновика: четыре понятных действия.
      const row = page.locator('tr').filter({ hasText: orderNumber })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row.getByRole('button', { name: 'Заполнить' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Открыть' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Восстановить' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Удалить черновик' })).toBeVisible()

      // «Восстановить» открывает редактор с самим документом (edit-docx).
      const popupPromise = page.waitForEvent('popup', { timeout: 60_000 })
      await row.getByRole('button', { name: 'Восстановить' }).click()
      const editor = await popupPromise
      editor.on('dialog', (d) => d.accept().catch(() => {}))
      await editor.waitForURL(new RegExp(`/drafts/${draftId}/edit-docx`), { timeout: 60_000 })
      await editor.waitForResponse(
        (r) => r.url().includes('/onlyoffice/config') && r.url().includes('/drafts/') && r.ok(),
        { timeout: 60_000 }
      )

      const { orderId } = await saveDraftOrderFromEditor(editor)
      expect(orderId).toBeTruthy()

      // Черновик исчез из списка (commit удаляет его).
      await expect
        .poll(
          async () => {
            const resp = await request.get(`${API_BASE}/api/orders/drafts`)
            const drafts = (await resp.json()) as Array<{ draft_id: string }>
            return !drafts.some((d) => d.draft_id === draftId)
          },
          { timeout: 20_000, intervals: [1000, 2000, 3000] }
        )
        .toBe(true)

      // Приказ появился в реестре.
      const orders = await apiOps.getOrders({ employee_id: employee.id })
      const found = orders.find(
        (o) => o.id === orderId || String(o.order_number).includes(orderNumber)
      )
      expect(found, 'order present via API after editor commit').toBeTruthy()

      // UI: на свежей странице черновиков строки больше нет, счётчик упал.
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Черновики' })).toBeVisible({
        timeout: 20_000,
      })
      await expect(page.locator('tr').filter({ hasText: orderNumber })).not.toBeVisible({
        timeout: 20_000,
      })
      const afterCount = Number(
        (await badge.getAttribute('aria-label'))?.replace(/\D+/g, '') || ''
      )
      expect(afterCount, 'draft counter dropped after commit').toBeLessThan(beforeCount)

      if (found?.id) {
        await apiOps.deleteOrder(found.id).catch(() => {})
      }
    } finally {
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })

  test('@ui draft actions: group order via popup → editor → commit to group endpoint', async ({
    page,
    apiOps,
    playwright,
  }) => {
    test.setTimeout(180_000)

    const u = apiOps.uid()
    const nameA = `e2e-emp-dact-grp-${u}-a`
    const nameB = `e2e-emp-dact-grp-${u}-b`
    const orderNumber = `E2EDG${Date.now().toString().slice(-6)}`

    const empA = await apiOps.createEmployee({ name: nameA })
    const empB = await apiOps.createEmployee({ name: nameB })
    expect(empA.id).toBeGreaterThan(0)
    expect(empB.id).toBeGreaterThan(0)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let draftId: string | undefined
    try {
      const resp = await request.post(`${API_BASE}/api/orders/group-drafts`, {
        data: {
          order_type_code: 'vacation_unpaid_group',
          order_date: '2026-01-05',
          order_number: orderNumber,
          employees: [
            { employee_id: empA.id, vacation_days: 1 },
            { employee_id: empB.id, vacation_days: 1 },
          ],
          vacation_start: '2026-01-06',
        },
      })
      expect(resp.status()).toBe(200)
      draftId = (await resp.json()).draft_id as string
      expect(draftId).toBeTruthy()

      // Попап сайдбара: у документного черновика «Заполнить»/«Открыть»/«Восстановить».
      await page.goto('/')
      const badge = page.getByRole('button', { name: /Черновики:/ })
      await expect(badge).toBeVisible({ timeout: 30_000 })
      await badge.click()
      await expect(page.getByText(/Черновики \(\d+\)/)).toBeVisible()

      // Строка черновика в попапе (li): номер уникален, но берём first() —
      // рядом могут быть строки черновиков форм с тем же текстом.
      const popupRow = page.locator('li').filter({ hasText: orderNumber }).first()
      await expect(popupRow).toBeVisible({ timeout: 20_000 })
      await expect(popupRow.getByRole('button', { name: 'Заполнить' })).toBeVisible()
      await expect(popupRow.getByRole('button', { name: 'Открыть' })).toBeVisible()
      await expect(popupRow.getByRole('button', { name: 'Восстановить' })).toBeVisible()

      // «Восстановить» → редактор → «Сохранить приказ» → commit в групповой эндпоинт.
      const popupPromise = page.waitForEvent('popup', { timeout: 60_000 })
      await popupRow.getByRole('button', { name: 'Восстановить' }).click()
      const editor = await popupPromise
      editor.on('dialog', (d) => d.accept().catch(() => {}))
      await editor.waitForURL(new RegExp(`/drafts/${draftId}/edit-docx`), { timeout: 60_000 })
      await editor.waitForResponse(
        (r) => r.url().includes('/onlyoffice/config') && r.url().includes('/drafts/') && r.ok(),
        { timeout: 60_000 }
      )

      await dismissOnlyOfficeDialogs(editor)
      const { orderId } = await saveDraftOrderFromEditor(editor, {
        commitPathIncludes: '/api/orders/group-drafts/',
      })
      expect(orderId).toBeTruthy()

      // Групповой commit → заказы на обоих сотрудников.
      const forA = await apiOps.getOrders({ employee_id: empA.id })
      const forB = await apiOps.getOrders({ employee_id: empB.id })
      const foundA = forA.find(
        (o) => o.id === orderId || String(o.order_number).includes(orderNumber)
      )
      const foundB = forB.find(
        (o) => o.id === orderId || String(o.order_number).includes(orderNumber)
      )
      expect(foundA, 'group order linked to employee A').toBeTruthy()
      expect(foundB, 'group order linked to employee B').toBeTruthy()
      expect(foundA!.id).toBe(foundB!.id)

      await apiOps.deleteOrder(foundA!.id).catch(() => {})
    } finally {
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })

  test('@ui draft actions: notification via API → /drafts → «Восстановить» → save → finalized', async ({
    page,
    apiOps,
    playwright,
  }) => {
    test.setTimeout(180_000)

    const u = apiOps.uid()
    const empName = `e2e-emp-dact-notif-${u}`
    const notifNumber = `E2EDN${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)
    const types = await apiOps.getNotificationTypes(true)
    expect(types.length, 'active notification types must exist').toBeGreaterThan(0)
    const pick = types[0]

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let notifId: number | undefined
    try {
      const resp = await request.post(`${API_BASE}/api/notifications/drafts`, {
        data: {
          title: `Уведомление ${notifNumber}`,
          number: notifNumber,
          date: '2026-01-01',
          employee_id: employee.id,
          notification_type_id: pick.id,
        },
      })
      expect(resp.status()).toBe(200)
      notifId = (await resp.json()).notification_id as number
      expect(notifId, 'notification draft id').toBeTruthy()
      apiOps.trackNotification(notifId)

      await page.goto('/drafts')
      await expect(page.getByRole('heading', { name: 'Черновики' })).toBeVisible({
        timeout: 30_000,
      })
      const row = page.locator('tr').filter({ hasText: notifNumber })
      await expect(row).toBeVisible({ timeout: 20_000 })

      // «Восстановить» → редактор уведомления (edit-docx) → «Сохранить уведомление».
      const popupPromise = page.waitForEvent('popup', { timeout: 60_000 })
      await row.getByRole('button', { name: 'Восстановить' }).click()
      const editor = await popupPromise
      editor.on('dialog', (d) => d.accept().catch(() => {}))
      await editor.waitForURL(new RegExp(`/notifications/${notifId}/edit-docx`), {
        timeout: 60_000,
      })
      await editor.waitForResponse(
        (r) => r.url().includes('/onlyoffice/config') && r.url().includes('/notifications/') && r.ok(),
        { timeout: 60_000 }
      )

      await dismissOnlyOfficeDialogs(editor)
      await saveNotificationFromEditor(editor)

      // finalize через callback OnlyOffice → черновик исчез из /drafts.
      await expect
        .poll(
          async () => {
            const resp = await request.get(`${API_BASE}/api/drafts`)
            const drafts = (await resp.json()) as Array<{ draft_id: string }>
            return !drafts.some((d) => d.draft_id === `notification:${notifId}`)
          },
          { timeout: 30_000, intervals: [2000, 3000, 5000] }
        )
        .toBe(true)

      // Уведомление появилось в списке (is_draft=false).
      const items = await apiOps.getNotifications({ employee_id: employee.id })
      const found = items.find(
        (n) => n.id === notifId || (n.number && String(n.number).includes(notifNumber))
      )
      expect(found, 'notification present via API after OO save').toBeTruthy()
    } finally {
      if (notifId) {
        await apiOps.deleteNotification(notifId).catch(() => {})
      }
      await dispose()
    }
  })
})
