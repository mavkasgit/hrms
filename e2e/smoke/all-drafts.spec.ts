import { test, expect, API_BASE } from '../fixtures/index'
import type { ApiOperations } from '../fixtures/index'
import type { Playwright } from '@playwright/test'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Smoke: объединённые черновики (#58–#63).
 *
 * Сценарии:
 * - бейдж в сайдбаре = сумма всех трёх видов; попап показывает приказ, уведомление и заявление;
 * - страница /orders/drafts — типовая таблица со всеми видами;
 * - удаление через диалог подтверждения работает для каждого вида;
 * - просмотр открывается в read-only режиме (без прав редактирования).
 *
 * Не требует Document Server: черновики создаются через API, редактор не открывается.
 * Требует ONLYOFFICE_ENABLED=true на бэкенде (в CI e2e-smoke включён в workflow).
 */
test.describe('Unified drafts @smoke', () => {
  test.setTimeout(150_000)

  async function createThreeDrafts(playwright: Playwright, apiOps: ApiOperations, u: string) {
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    // Базовое число черновиков в БД (допустимы остаточные данные после сбоев).
    const baseline = (
      (await request.get(`${API_BASE}/api/drafts`).then((r) => r.json())) as Array<unknown>
    ).length

    const empOrder = await apiOps.createEmployee({ name: `e2e-emp-odr-${u}` })
    const empNotif = await apiOps.createEmployee({ name: `e2e-emp-ntf-${u}` })
    const empStmt = await apiOps.createEmployee({ name: `e2e-emp-stm-${u}` })

    const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })

    const orderNumber = `E2EO${Date.now().toString().slice(-6)}`
    let orderDraftId: string | undefined
    let notifId: number | undefined
    let stmtId: number | undefined

    try {
      const orderResp = await request.post(`${API_BASE}/api/orders/drafts`, {
        data: {
          employee_id: empOrder.id,
          order_type_id: typeId,
          order_date: '2026-01-01',
          order_number: orderNumber,
        },
      })
      expect(orderResp.status()).toBe(200)
      orderDraftId = (await orderResp.json()).draft_id
      expect(orderDraftId).toBeTruthy()

      const notifResp = await request.post(`${API_BASE}/api/notifications/drafts`, {
        data: {
          title: `Уведомление ${u}`,
          date: '2026-01-02',
          employee_id: empNotif.id,
        },
      })
      expect(notifResp.status()).toBe(200)
      const notifBody = (await notifResp.json()) as { notification_id: number }
      notifId = notifBody.notification_id
      expect(notifId).toBeTruthy()
      apiOps.trackNotification(notifId)

      const stmtResp = await request.post(`${API_BASE}/api/statements/drafts`, {
        data: {
          title: `Заявление ${u}`,
          date: '2026-01-03',
          employee_id: empStmt.id,
        },
      })
      expect(stmtResp.status()).toBe(200)
      const stmtBody = (await stmtResp.json()) as { statement_id: number }
      stmtId = stmtBody.statement_id
      expect(stmtId).toBeTruthy()

      return {
        request,
        dispose,
        cleanup: async () => {
          if (orderDraftId) {
            await request.delete(`${API_BASE}/api/orders/drafts/${orderDraftId}`).catch(() => {})
          }
          if (notifId) {
            await request.delete(`${API_BASE}/api/notifications/${notifId}`).catch(() => {})
          }
          if (stmtId) {
            await request.delete(`${API_BASE}/api/statements/${stmtId}`).catch(() => {})
          }
          await dispose()
        },
        baseline,
        empOrder,
        empNotif,
        empStmt,
        orderNumber,
        orderDraftId,
        notifId,
        stmtId,
      }
    } catch (err) {
      if (orderDraftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${orderDraftId}`).catch(() => {})
      }
      if (notifId) {
        await request.delete(`${API_BASE}/api/notifications/${notifId}`).catch(() => {})
      }
      if (stmtId) {
        await request.delete(`${API_BASE}/api/statements/${stmtId}`).catch(() => {})
      }
      await dispose()
      throw err
    }
  }

  test('@smoke drafts: badge counts all kinds, popup and page list them', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const { cleanup, baseline, empOrder, empNotif, empStmt, orderNumber } =
      await createThreeDrafts(playwright, apiOps, u)
    const expectedCount = baseline + 3

    try {
      // ── Бейдж = сумма всех трёх видов (#61) ──
      await page.goto('/')
      const badge = page.getByRole('button', { name: /Черновики:/ })
      await expect(badge).toBeVisible({ timeout: 30_000 })
      await expect(badge).toContainText(String(expectedCount))

      // ── Попап показывает все три вида ──
      await badge.click()
      await expect(page.getByText(`Черновики (${expectedCount})`)).toBeVisible()
      for (const name of [empOrder.name, empNotif.name, empStmt.name]) {
        await expect(page.getByText(name, { exact: false }).first()).toBeVisible()
      }
      await expect(page.getByText(orderNumber, { exact: false }).first()).toBeVisible()
      // Статус сохранения виден только для приказа (#61).
      await expect(page.getByText('Не сохранялся').first()).toBeVisible()

      // ── Страница «Все черновики»: типовая таблица со всеми видами (#62) ──
      await page.getByRole('link', { name: /Все черновики/ }).click()
      await expect(page).toHaveURL(/\/orders\/drafts$/)
      await expect(page.getByRole('heading', { name: 'Черновики' })).toBeVisible()
      for (const name of [empOrder.name, empNotif.name, empStmt.name]) {
        await expect(page.getByText(name, { exact: false }).first()).toBeVisible()
      }
      // Подписи видов в колонке «Документ».
      await expect(page.getByText('Приказ', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Уведомление', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Заявление', { exact: true }).first()).toBeVisible()

      // Кнопки коммита и «Сначала новые/старые» отсутствуют (#62).
      await expect(page.getByRole('button', { name: 'Сохранить' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Сначала новые|Сначала старые/ })).toHaveCount(0)
    } finally {
      await cleanup()
    }
  })

  test('@smoke drafts: delete via confirm dialog works for each kind', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const { cleanup, empOrder, empNotif, empStmt, orderDraftId, notifId, stmtId, request } =
      await createThreeDrafts(playwright, apiOps, u)

    try {
      await page.goto('/orders/drafts')
      await expect(page.getByRole('heading', { name: 'Черновики' })).toBeVisible({
        timeout: 30_000,
      })

      for (const emp of [empOrder, empNotif, empStmt]) {
        const row = page.locator('tr').filter({ hasText: emp.name })
        await expect(row.first()).toBeVisible({ timeout: 15_000 })

        await row.first().getByRole('button', { name: 'Удалить' }).click()
        const dialog = page.getByRole('alertdialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Удалить', exact: true }).click()

        await expect(row).toHaveCount(0)
      }

      // API: все три черновика удалены (идентификация по draft_id, а не по title).
      const drafts = (await request.get(`${API_BASE}/api/drafts`).then((r) => r.json())) as Array<{
        draft_id: string
      }>
      const remainingIds = drafts.map((d) => d.draft_id)
      expect(remainingIds, 'order draft must be deleted').not.toContain(orderDraftId)
      expect(remainingIds, 'notification draft must be deleted').not.toContain(
        `notification:${notifId}`
      )
      expect(remainingIds, 'statement draft must be deleted').not.toContain(`statement:${stmtId}`)
    } finally {
      await cleanup()
    }
  })

  test('@smoke drafts: read-only view without edit rights', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const { cleanup, orderDraftId } = await createThreeDrafts(playwright, apiOps, u)
    expect(orderDraftId).toBeTruthy()

    try {
      // ── Конфиг с mode=view — без прав редактирования (#59) ──
      const { request } = await createAuthenticatedRequest(playwright)
      const viewResp = await request.get(
        `${API_BASE}/api/orders/drafts/${orderDraftId}/onlyoffice/config?mode=view`
      )
      expect(viewResp.status()).toBe(200)
      const viewConfig = await viewResp.json()
      expect(viewConfig.editorConfig.mode).toBe('view')
      expect(viewConfig.document.permissions.edit).toBe(false)
      expect(viewConfig.editorConfig.customization.autosave).toBe(false)
      expect(viewConfig.editorConfig.customization.forcesave).toBe(false)

      // Без параметра режим остаётся edit (обратная совместимость).
      const editResp = await request.get(
        `${API_BASE}/api/orders/drafts/${orderDraftId}/onlyoffice/config`
      )
      expect(editResp.status()).toBe(200)
      const editConfig = await editResp.json()
      expect(editConfig.editorConfig.mode).toBe('edit')
      expect(editConfig.document.permissions.edit).toBe(true)

      // ── Страница просмотра: read-only, без кнопок сохранения ──
      const configPromise = page.waitForResponse(
        (r) =>
          r.url().includes('/onlyoffice/config') &&
          r.url().includes('/drafts/') &&
          r.url().includes('mode=view') &&
          r.ok(),
        { timeout: 30_000 }
      )
      await page.goto(`/orders/drafts/${orderDraftId}/view-docx`)
      await configPromise
      await expect(page).toHaveURL(new RegExp(`/orders/drafts/${orderDraftId}/view-docx`))
      await expect(page.getByRole('button', { name: 'Сохранить приказ' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Сохранить и открыть печать/ })).toHaveCount(0)
    } finally {
      await cleanup()
    }
  })
})
