import { test, expect } from '../fixtures/index'
import { VacationsPage } from '../pages/VacationsPage'

/**
 * #121 (T2): После создания трудового отпуска выбранный сотрудник остаётся
 * выбранным/раскрытым, а блок трудовых периодов обновляется на месте — без
 * перезагрузки страницы и повторного поиска.
 *
 * Acceptance:
 * - выбранный сотрудник остаётся выбранным (чек-чип формы на месте);
 * - блок трудовых периодов не сворачивается и обновляется на месте;
 * - созданный отпуск сразу виден в своём периоде (таблица отпусков + операция
 *   «Списание отпуска по приказу №…» + обновлённый «исп. дн.»).
 *
 * Флоу: выбор сотрудника в форме создания → заполнение формы → «Создать приказ»
 * (серверный черновик, POST /orders/drafts) → сигнал редактора «приказ сохранён»
 * (hrms:draft-order-save) → родитель создаёт отпуск (POST /vacations).
 * OnlyOffice-редактор здесь не нужен: сигнал шлём напрямую через BroadcastChannel —
 * тот же транспорт, что использует редактор (draftOrderSaveChannel), поэтому
 * тест не зависит от Document Server.
 */

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

// Отпуск в ПЕРВОМ периоде (2024): 01.06–14.06 = 14 дн., без праздников.
const VAC_START = toDisplayDate('2024-06-01')
const VAC_END = toDisplayDate('2024-06-14')
const VAC_DAYS = 14

test.describe('Vacation create keeps employee selected @ui', () => {
  test.setTimeout(120_000)

  test('@ui #121: после создания отпуска сотрудник остаётся выбранным, периоды обновляются на месте', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-keep-${u}`
    const orderNumber = `E2EK${Date.now().toString().slice(-6)}`

    const emp = await apiOps.createEmployee({
      name: empName,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    try {
      const vacPage = new VacationsPage(page)
      await vacPage.goto()

      // Выбираем сотрудника в форме создания → строка раскрывается сразу.
      await vacPage.selectCreateFormEmployee(empName)
      const selectedChip = page.getByText(new RegExp(`${empName}\\(таб`))
      await expect(selectedChip).toBeVisible({ timeout: 10_000 })

      const empRow = await vacPage.getEmployeeRow(empName)
      const historyRow = empRow.locator('xpath=following-sibling::tr')
      await expect(historyRow).toBeVisible({ timeout: 15_000 })

      // Заполняем форму: дата приказа, номер приказа, даты отпуска.
      const orderDateInput = page.getByLabel(/Дата приказа/i).first()
      await expect(orderDateInput).toBeEnabled({ timeout: 10_000 })
      await orderDateInput.click()
      await orderDateInput.fill(toDisplayDate('2024-05-25'))
      await orderDateInput.press('Enter')
      const numInput = page.getByLabel(/номер приказа/i).first()
      await numInput.fill(orderNumber)
      await numInput.press('Tab').catch(() => {})
      await vacPage.fillCreateFormDates(VAC_START, VAC_END)

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
      expect(created.days_count).toBe(VAC_DAYS)

      // #121: сотрудник остаётся выбранным — чек-чип формы на месте.
      await expect(selectedChip).toBeVisible({ timeout: 10_000 })

      // Блок периодов не сворачивается и обновляется на месте — без повторного поиска.
      await expect(historyRow).toBeVisible({ timeout: 15_000 })

      // Созданный отпуск сразу виден в своём периоде:
      // таблица отпусков, операция «Списание отпуска по приказу №…», «исп. дн.».
      await expect(historyRow.getByText(VAC_START)).toBeVisible({ timeout: 15_000 })
      await expect(historyRow.getByText(VAC_END)).toBeVisible()
      await expect(
        historyRow.getByText(new RegExp(`Списание отпуска по приказу №${orderNumber}`)),
      ).toBeVisible({ timeout: 15_000 })
      await expect(historyRow.getByText(`${VAC_DAYS} исп.`)).toBeVisible({ timeout: 15_000 })

      await editor.close().catch(() => {})
    } finally {
      const orders = await apiOps.getOrders({ employee_id: emp.id }).catch(() => [])
      for (const o of orders) {
        await apiOps.deleteOrder(o.id).catch(() => {})
      }
      await apiOps.cleanupEmployee(emp.id).catch(() => {})
    }
  })
})
