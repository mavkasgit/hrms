import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

/** ISO date → DD.MM.YYYY for DatePicker display assert. */
function toDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/**
 * «Заполнить поля» (#74): серверный черновик через ?fillDraftId= заполняет
 * форму создания на трёх страницах — приказы (одиночный черновик), отпуск
 * за свой счет (групповой черновик) и вызовы в выходные (групповой черновик).
 *
 * Requires: FE + BE + OnlyOffice-enabled backend (черновик создаётся через API,
 * редактор не открывается) — тот же контракт, что у draft-visibility.spec.ts.
 */
test.describe('Fill draft fields @ui', () => {
  test.setTimeout(90_000)

  test('@ui orders: ?fillDraftId fills single order form', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-fill-${u}`
    const orderNumber = `E2EF${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)
    const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let draftId: string | undefined
    try {
      const resp = await request.post(`${API_BASE}/api/orders/drafts`, {
        data: {
          employee_id: employee.id,
          order_type_id: typeId,
          order_date: '2026-01-05',
          order_number: orderNumber,
        },
      })
      expect(resp.status()).toBe(200)
      draftId = (await resp.json()).draft_id as string
      expect(draftId).toBeTruthy()

      await page.goto(`/orders?fillDraftId=${encodeURIComponent(draftId)}`)
      await expect(page.getByRole('heading', { name: /^Приказы$/, level: 1 })).toBeVisible({
        timeout: 20_000,
      })

      // Параметр убран из URL после восстановления.
      await expect(page).toHaveURL(/\/orders$/)

      // Форма заполнена: сотрудник перевалидирован по id, номер приказа на месте.
      await expect(page.getByText(empName, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      })
      const numberInput = page.getByLabel(/номер приказа/i).first()
      await expect(numberInput).toHaveValue(orderNumber, { timeout: 10_000 })
    } finally {
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })

  test('@ui unpaid leaves: ?fillDraftId fills group form', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-fill-unpaid-${u}`
    const empNameB = `e2e-emp-fill-unpaid-${u}-b`
    const orderNumber = `E2EGU${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    const employeeB = await apiOps.createEmployee({ name: empNameB })
    expect(employee.id).toBeGreaterThan(0)
    expect(employeeB.id).toBeGreaterThan(0)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let draftId: string | undefined
    try {
      const resp = await request.post(`${API_BASE}/api/orders/group-drafts`, {
        data: {
          order_type_code: 'vacation_unpaid_group',
          order_date: '2026-01-05',
          order_number: orderNumber,
          employees: [
            { employee_id: employee.id, vacation_days: 1 },
            { employee_id: employeeB.id, vacation_days: 1 },
          ],
          vacation_start: '2026-01-06',
        },
      })
      expect(resp.status()).toBe(200)
      draftId = (await resp.json()).draft_id as string
      expect(draftId).toBeTruthy()

      await page.goto(`/unpaid-leaves?fillDraftId=${encodeURIComponent(draftId)}`)
      await expect(
        page.getByRole('heading', { name: 'Отпуск за свой счет', exact: true })
      ).toBeVisible({ timeout: 20_000 })

      await expect(page).toHaveURL(/\/unpaid-leaves$/)

      // Групповая форма заполнена: режим group + номер + дата начала + сотрудник.
      const numberInput = page.getByLabel(/номер приказа/i).first()
      await expect(numberInput).toHaveValue(orderNumber, { timeout: 10_000 })
      await expect(page.getByLabel(/дата начала отпуска/i)).toHaveValue(
        toDisplay('2026-01-06'),
        { timeout: 10_000 }
      )
      await expect(page.getByRole('cell', { name: empName, exact: true }).first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('cell', { name: empNameB, exact: true }).first()).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })

  test('@ui weekend calls: ?fillDraftId fills group form', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-fill-wknd-${u}`
    const empNameB = `e2e-emp-fill-wknd-${u}-b`
    const orderNumber = `E2EGW${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    const employeeB = await apiOps.createEmployee({ name: empNameB })
    expect(employee.id).toBeGreaterThan(0)
    expect(employeeB.id).toBeGreaterThan(0)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let draftId: string | undefined
    try {
      const resp = await request.post(`${API_BASE}/api/orders/group-drafts`, {
        data: {
          order_type_code: 'weekend_call_group',
          order_date: '2026-01-05',
          order_number: orderNumber,
          employees: [
            { employee_id: employee.id, vacation_days: 1 },
            { employee_id: employeeB.id, vacation_days: 1 },
          ],
          mode: 'single',
          call_date: '2026-01-07',
        },
      })
      expect(resp.status()).toBe(200)
      draftId = (await resp.json()).draft_id as string
      expect(draftId).toBeTruthy()

      await page.goto(`/weekend-calls?fillDraftId=${encodeURIComponent(draftId)}`)
      await expect(
        page.getByRole('heading', { name: 'Вызовы в выходные дни' })
      ).toBeVisible({ timeout: 20_000 })

      await expect(page).toHaveURL(/\/weekend-calls$/)

      // Групповая форма заполнена: номер + дата вызова + сотрудник.
      const numberInput = page.getByLabel(/номер приказа/i).first()
      await expect(numberInput).toHaveValue(orderNumber, { timeout: 10_000 })
      await expect(page.getByLabel(/дата вызова/i)).toHaveValue(toDisplay('2026-01-07'), {
        timeout: 10_000,
      })
      await expect(page.getByRole('cell', { name: empName, exact: true }).first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('cell', { name: empNameB, exact: true }).first()).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })
})
