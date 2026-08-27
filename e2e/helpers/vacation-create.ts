import { expect, type Page } from '@playwright/test'
import { VacationsPage } from '../pages/VacationsPage'
import type { ApiOperations } from '../fixtures/index'

/**
 * Создание трудового отпуска через UI-форму /vacations без OnlyOffice/Document
 * Server: «Создать приказ» (POST /orders/drafts) → попап редактора → сигнал
 * «приказ сохранён» (`hrms:draft-order-save` через BroadcastChannel — тот же
 * транспорт, что использует редактор) → родитель вызывает POST /vacations.
 * Возвращает объект созданного отпуска из POST /vacations.
 *
 * Общий хелпер для тестов отпускного цикла (#121, #122 и т.д.).
 */
export async function createVacationViaUi(
  page: Page,
  vacPage: VacationsPage,
  empName: string,
  orderNumber: string,
  start: string,
  end: string,
): Promise<Record<string, any>> {
  await vacPage.goto()
  await vacPage.selectCreateFormEmployee(empName)

  const orderDateInput = page.getByLabel(/Дата приказа/i).first()
  await expect(orderDateInput).toBeEnabled({ timeout: 10_000 })
  await orderDateInput.click()
  await orderDateInput.fill('20.05.2024')
  await orderDateInput.press('Enter')
  const numInput = page.getByLabel(/номер приказа/i).first()
  await numInput.fill(orderNumber)
  await numInput.press('Tab').catch(() => {})
  await vacPage.fillCreateFormDates(start, end)

  // «Создать приказ» → серверный черновик (POST /orders/drafts) + попап редактора.
  const draftRespPromise = page.waitForResponse(
    (r) => /\/api\/orders\/drafts$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 20_000 },
  )
  const popupPromise = page.waitForEvent('popup', { timeout: 20_000 })
  await page.getByRole('button', { name: 'Создать приказ' }).click()
  const [draftResp, editor] = await Promise.all([draftRespPromise, popupPromise])
  expect(draftResp.ok()).toBeTruthy()
  const { draft_id: draftId } = await draftResp.json()
  expect(draftId, 'draft_id must be generated').toBeTruthy()
  await editor.waitForURL(/\/drafts\/[0-9a-f-]+\/edit-docx/, { timeout: 30_000 })

  // Эмулируем сигнал редактора «приказ сохранён». Родительский слушатель
  // регистрируется после коммита состояния draftId; шлём в цикле до тех пор,
  // пока не сработает POST /vacations (dedup 5s исключает дубль).
  const createPromise = page.waitForResponse(
    (r) => /\/api\/vacations$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  void page
    .evaluate(async (id) => {
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        try {
          const channel = new BroadcastChannel('hrms-order-draft-save')
          channel.postMessage({ type: 'hrms:draft-order-save', draftId: id })
          channel.close()
        } catch {
          /* noop */
        }
        await sleep(100)
      }
    }, draftId)
    .catch(() => {})

  const createResp = await createPromise
  expect(createResp.ok()).toBeTruthy()
  const created = await createResp.json()
  expect(created.id, 'vacation must be created').toBeTruthy()

  await editor.close().catch(() => {})
  return created
}

/** Удалить приказы сотрудника (UI-созданные отпуска не трекаются apiOps). */
export async function cleanupVacationOrders(
  apiOps: ApiOperations,
  empId: number,
): Promise<void> {
  const orders = await apiOps.getOrders({ employee_id: empId }).catch(() => [])
  for (const o of orders) {
    await apiOps.deleteOrder(o.id).catch(() => {})
  }
}