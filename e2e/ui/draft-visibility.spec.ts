import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'
import { dismissOnlyOfficeDialogs } from '../helpers/onlyoffice-editor'

/**
 * UI: видимость черновиков (#52–#55).
 *
 * Сценарий: черновик создан (API), но не закоммичен → счётчик в сайдбаре,
 * попап с последними черновиками, страница /drafts со статусом сохранения
 * и причиной ошибки («Ошибка сохранения» после save-report).
 *
 * Requires: FE + BE + OnlyOffice-enabled backend (создание черновика идёт через API;
 * сам редактор не открывается). Только проект `ui` (ночной прогон с DS).
 */
test.describe('Draft visibility @ui', () => {
  test.setTimeout(120_000)

  test('@ui drafts: badge → popup → /drafts with save status', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    // Двухсловное ФИО: раньше попап сокращал его до «… С.», теперь обязано
    // показывать полное имя — это и есть фиксация регрессии (#58).
    const empName = `e2e-emp-drafts-${u} Сотрудник`
    const orderNumber = `E2E${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let draftId: string | undefined
    try {
      // ── Создаём черновик через API (как если бы пользователь начал создание) ──
      const createResp = await request.post(`${API_BASE}/api/orders/drafts`, {
        data: {
          employee_id: employee.id,
          order_type_id: typeId,
          order_date: '2026-01-01',
          order_number: orderNumber,
        },
      })
      expect(createResp.status()).toBe(200)
      const created = (await createResp.json()) as { draft_id: string; file_path: string }
      draftId = created.draft_id
      expect(draftId).toBeTruthy()

      // Свежий черновик без сохранений → state=never + имя файла на диске.
      const listResp = await request.get(`${API_BASE}/api/orders/drafts`)
      expect(listResp.status()).toBe(200)
      const drafts = (await listResp.json()) as Array<{
        draft_id: string
        save_status: { state: string; last_saved_at: string | null; last_error: string | null }
        file_name: string | null
        file_path: string | null
      }>
      const mine = drafts.find((d) => d.draft_id === draftId)
      expect(mine, 'draft present in list').toBeTruthy()
      expect(mine!.save_status.state).toBe('never')
      expect(mine!.file_name).toBeTruthy()
      expect(mine!.file_path).toBeTruthy()

      // ── Клиент сообщил об ошибке сохранения → state=error с причиной (#53) ──
      const reason = 'Таймаут ожидания сохранения документа'
      const reportResp = await request.post(`${API_BASE}/api/orders/drafts/${draftId}/save-report`, {
        data: { reason },
      })
      expect(reportResp.status()).toBe(200)

      const listResp2 = await request.get(`${API_BASE}/api/orders/drafts`)
      const drafts2 = (await listResp2.json()) as Array<{
        draft_id: string
        save_status: { state: string; last_error: string | null }
      }>
      const mine2 = drafts2.find((d) => d.draft_id === draftId)
      expect(mine2!.save_status.state).toBe('error')
      expect(mine2!.save_status.last_error).toBe(reason)

      // ── UI: счётчик в сайдбаре → попап → страница черновиков ──
      await page.goto('/')
      const badge = page.getByRole('button', { name: /Черновики:/ })
      await expect(badge).toBeVisible({ timeout: 30_000 })

      await badge.click()
      await expect(page.getByText(/Черновики \(\d+\)/)).toBeVisible()
      await expect(page.getByText(empName, { exact: false }).first()).toBeVisible()

      await page.getByRole('link', { name: /Все черновики/ }).click()
      await expect(page).toHaveURL(/\/drafts$/)
      await expect(page.getByRole('heading', { name: 'Черновики' })).toBeVisible()

      // Строка с нашим черновиком + статус «Ошибка сохранения».
      await expect(page.getByText(orderNumber, { exact: false }).first()).toBeVisible({
        timeout: 20_000,
      })
      await expect(page.getByText('Ошибка сохранения').first()).toBeVisible()
    } finally {
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })

  test('@ui drafts: accidental tab close → draft survives, not committed', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-draft-close-${u}`
    const orderNumber = `E2E${Date.now().toString().slice(-6)}`

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
      const created = (await createResp.json()) as { draft_id: string }
      draftId = created.draft_id
      expect(draftId).toBeTruthy()

      // Реальный сценарий: открыли редактор и СЛУЧАЙНО закрыли вкладку,
      // не нажав «Сохранить приказ». runBeforeUnload — чтобы OnlyOffice
      // получил сигнал закрытия (как при закрытии вкладки вручную).
      const editor = await page.context().newPage()
      editor.on('dialog', (d) => d.accept().catch(() => {}))
      const configPromise = editor.waitForResponse(
        (r) =>
          r.url().includes('/onlyoffice/config') &&
          r.url().includes('/drafts/') &&
          r.ok(),
        { timeout: 60_000 }
      )
      await editor.goto(`/drafts/${draftId}/edit-docx`)
      await configPromise
      await expect(editor.getByRole('button', { name: 'Сохранить приказ' })).toBeVisible({
        timeout: 90_000,
      })
      await dismissOnlyOfficeDialogs(editor)
      await editor.close({ runBeforeUnload: true })

      // Черновик переживает закрытие вкладки: остаётся в списке и НЕ коммитится.
      // (Переход в «Сохранён» при реальном редактировании обеспечивает автозапись
      // OnlyOffice — этот путь покрыт backend-тестами callback→saved.)
      await expect
        .poll(
          async () => {
            const resp = await request.get(`${API_BASE}/api/orders/drafts`)
            const drafts = (await resp.json()) as Array<{ draft_id: string }>
            return drafts.some((d) => d.draft_id === draftId)
          },
          { timeout: 20_000, intervals: [1000, 2000, 3000] }
        )
        .toBe(true)

      const orders = await apiOps.getOrders({ employee_id: employee.id })
      expect(
        orders.some((o) => String(o.order_number).includes(orderNumber)),
        'closing editor tab must NOT create an order'
      ).toBe(false)
    } finally {
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })
})
