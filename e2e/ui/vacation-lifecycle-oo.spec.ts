import { type APIRequestContext, type Locator, type Page, expect } from '@playwright/test'
import { test, API_BASE } from '../fixtures/index'
import type { ApiOperations } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'
import { VacationsPage } from '../pages/VacationsPage'
import { saveDraftOrderFromEditor } from '../helpers/onlyoffice-editor'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Полный UI-цикл отпускных приказов через OnlyOffice-редактор.
 *
 * Объединённый файл (lifecycle + каскад + корректировки):
 *
 *   1. lifecycle: Отпуск → Отзыв → удаление приказа отзыва → удаление приказа
 *      отпуска. Проверка корректности (даты/дни/приказ) — глазами в UI.
 *   2. cascade: Отпуск → Отзыв → удаление отпуска целиком. Каскадом удаляются
 *      и приказ отпуска, и приказ отзыва (фикс каскада в order_cleanup_service).
 *   3. Отпуск → Продление: days не расходуются (10 → 10).
 *   4. Отпуск → Перенос: days 14 → 7.
 *
 * Каждый цикл — реальный пользовательский путь: формы (EmployeeSearch,
 * VacationSelector, DocumentDatePicker, OrderNumberField) → «Создать приказ»
 * → OnlyOffice-редактор → «Сохранить приказ» (self-commit, #31/#86) → сигнал
 * родителю → vacation-эндпоинт (create/recall/extend/postpone). Сотрудник
 * сидится через API (apiOps); день-математика проверяется и через API-баланс,
 * и через видимую UI-строку.
 *
 * Дата-схема: отпуски в ПЕРВОМ периоде (2024) — так balance.used_days считается
 * однократно (списание и запись отпуска в одном периоде). Отпуск в будущем
 * периоде даёт двойной счёт в get_vacation_balance (ledger в старом периоде +
 * fallback в новом) — известный баг баланса, не должен маскировать тест.
 *
 * Требует OnlyOffice Document Server (:8085), как order-onlyoffice-create.
 */

// ---------------------------------------------------------------------------
// Константы lifecycle (2024, период 1): отпуск 01.06–14.06 = 14 дн.,
// отзыв 07.06 → стало 6 дн. (вернулось 8).
// ---------------------------------------------------------------------------

const VAC_START = '01.06.2024'
const VAC_END = '14.06.2024'
const VAC_ORDER_DATE = '20.05.2024'
const RECALL_DATE = '07.06.2024'
const RECALL_ORDER_DATE = '05.06.2024'
const VAC_DAYS = 14

type PeriodVacation = {
  id: number
  original_days?: number | null
  actual_days?: number | null
  recall_order_id?: number | null
  recall_order_number?: string | null
  is_recalled?: boolean
}

// ---------------------------------------------------------------------------
// API-хелперы
// ---------------------------------------------------------------------------

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Вернуть used_days по балансу (стабилен для отпусков в первом периоде). */
async function usedDays(apiOps: ApiOperations, empId: number): Promise<number> {
  const balance = await apiOps.getBalance(empId)
  return balance.used_days
}

async function getVacationPeriodData(request: APIRequestContext, employeeId: number): Promise<{ vacations: PeriodVacation[] }[]> {
  const resp = await request.get(`${API_BASE}/api/vacation-periods?employee_id=${employeeId}`)
  expect(resp.ok()).toBeTruthy()
  return resp.json()
}

async function getVacationItems(request: APIRequestContext, employeeId: number): Promise<Array<{ id: number; order_id: number | null; order_number: string | null }>> {
  const resp = await request.get(`${API_BASE}/api/vacations?employee_id=${employeeId}&per_page=100`)
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()
  return data.items || []
}

/** Найти приказы сотрудника по коду типа. */
async function findOrderByType(apiOps: ApiOperations, employeeId: number, code: string) {
  const orders = await apiOps.getOrders({ employee_id: employeeId })
  const found = orders.find((o) => o.order_type_code === code)
  expect(found, `order ${code} for employee ${employeeId}`).toBeTruthy()
  return found!
}

// ---------------------------------------------------------------------------
// UI-хелперы
// ---------------------------------------------------------------------------

async function fillDate(page: Page, label: RegExp, value: string): Promise<void> {
  const input = page.getByLabel(label).first()
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.click()
  await input.fill(value)
  await input.press('Enter')
}

/**
 * «Создать приказ» → OnlyOffice-редактор → «Сохранить приказ» (self-commit,
 * #31/#86) → родитель вызывает vacation-эндпоинт (create/recall/extend/postpone).
 * Возвращает JSON ответа этого эндпоинта.
 */
async function createOrderViaEditor(
  page: Page,
  vacPage: VacationsPage,
  endpoint: RegExp,
): Promise<Record<string, any>> {
  const endpointPromise = page.waitForResponse(
    (r) => endpoint.test(r.url()) && r.request().method() === 'POST',
    { timeout: 120_000 },
  )

  page.on('dialog', (d) => d.accept().catch(() => {}))
  const editor = await vacPage.createOrderOpenEditor()
  editor.on('dialog', (d) => d.accept().catch(() => {}))

  const { orderId } = await saveDraftOrderFromEditor(editor)
  expect(orderId, 'committed order id from editor').toBeGreaterThan(0)

  const endpointResp = await endpointPromise
  expect(endpointResp.ok(), `vacation endpoint ${endpointResp.url()} should succeed`).toBeTruthy()
  return endpointResp.json()
}

/** Найти сотрудника в списке отпусков и развернуть строку истории. */
async function expandEmployeeHistory(page: Page, empName: string): Promise<Locator> {
  const vacPage = new VacationsPage(page)
  // Гарантированно открываем /vacations: хелпер может вызываться после
  // удаления приказа на /orders или после редиректа отзыва.
  await vacPage.goto()
  await vacPage.searchEmployee(empName)
  const empRow = await vacPage.getEmployeeRow(empName)
  const historyRow = empRow.locator('xpath=following-sibling::tr')
  if (!(await historyRow.isVisible().catch(() => false))) {
    await empRow.click()
  }
  await expect(historyRow).toBeVisible({ timeout: 15_000 })
  return historyRow
}

/** Удаление приказа по номеру из реестра /orders («Все приказы»). */
async function deleteOrderByNumber(page: Page, number: string): Promise<void> {
  const ordersPage = new OrdersPage(page)
  await ordersPage.goto()
  // Тестовые приказы в 2024, страница по умолчанию показывает текущий год и
  // держит панель «Фильтры» свёрнутой — раскрываем и сбрасываем на «Все года».
  const filtersHeading = page.locator('h2').filter({ hasText: 'Фильтры' })
  if (await filtersHeading.isVisible().catch(() => false)) {
    await filtersHeading.click().catch(() => {})
  }
  const allYears = page.getByRole('button', { name: 'Все года' })
  await expect(allYears).toBeVisible({ timeout: 10_000 })
  await allYears.click()
  const row = page.locator('tr').filter({ hasText: number }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.getByTitle('Удалить приказ').click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByRole('button', { name: 'Удалить навсегда' }).click()
  await expect(row).not.toBeVisible({ timeout: 20_000 })
}

/** Создание отпуска с приказом через форму /vacations + редактор OO. */
async function createVacationViaUi(
  page: Page,
  vacPage: VacationsPage,
  empName: string,
  baseNumber: string,
  start: string,
  end: string,
): Promise<Record<string, any>> {
  await vacPage.goto()
  await vacPage.selectCreateFormEmployee(empName)
  await fillDate(page, /Дата приказа/i, VAC_ORDER_DATE)
  await page.getByLabel(/номер приказа/i).first().fill(baseNumber)
  await vacPage.fillCreateFormDates(start, end)
  return createOrderViaEditor(page, vacPage, /\/api\/vacations$/)
}

/** Отзыв через /vacations/recall: селектор → форма → редактор OO → автоприменение. */
async function recallViaUi(
  page: Page,
  vacPage: VacationsPage,
  empName: string,
  baseNumber: string,
): Promise<Record<string, any>> {
  await vacPage.gotoAdjustment('recall')
  await vacPage.selectVacation(empName)
  await vacPage.fillAdjustmentForm(
    [
      { label: /Дата приказа/i, value: RECALL_ORDER_DATE },
      { label: /Дата отзыва/i, value: RECALL_DATE },
    ],
    baseNumber,
  )
  return createOrderViaEditor(page, vacPage, /\/api\/vacations\/\d+\/recall$/)
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

test.describe('Vacation orders full UI lifecycle @ui', () => {
  test.setTimeout(300_000)

  test('@ui lifecycle: Отпуск→Отзыв, затем удаление отзыва и приказа отпуска', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-vac-life-${u}`
    const vacBase = `E2EV${Date.now().toString().slice(-6)}`
    const recallBase = `E2ER${Date.now().toString().slice(-6)}`

    const emp = await apiOps.createEmployee({ name: empName })
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const vacPage = new VacationsPage(page)

      // --- 1. Приказ на отпуск через UI (форма + редактор OO) ---
      const created = await createVacationViaUi(page, vacPage, empName, vacBase, VAC_START, VAC_END)
      expect(created.id, 'vacation must be created').toBeTruthy()
      expect(created.order_id, 'order must be attached').toBeTruthy()
      expect(created.days_count, 'days_count must be computed').toBe(VAC_DAYS)
      expect(await usedDays(apiOps, emp.id)).toBe(VAC_DAYS)
      const vacationId = created.id

      const vacOrder = await findOrderByType(apiOps, emp.id, 'vacation_paid')
      const vacOrderNumber = vacOrder.order_number

      // Проверка в UI: даты + приказ в развёрнутой строке.
      const historyRow = await expandEmployeeHistory(page, empName)
      await expect(historyRow.getByText(VAC_START)).toBeVisible({ timeout: 10_000 })
      await expect(historyRow.getByText(VAC_END)).toBeVisible()
      // Номер встречается и в ячейке «Приказ», и в транзакции «по приказу №…» — берём первый.
      await expect(historyRow.getByText(vacOrderNumber, { exact: false }).first()).toBeVisible()

      // --- 2. Отзыв из отпуска через UI (редактор OO) ---
      const recall = await recallViaUi(page, vacPage, empName, recallBase)
      expect(recall.recall_order_id, 'recall order must be created').toBeTruthy()
      expect(recall.old_days_count).toBe(VAC_DAYS)
      // 14 − days_returned(8) = 6.
      expect(await usedDays(apiOps, emp.id)).toBe(6)

      const recallOrder = await findOrderByType(apiOps, emp.id, 'vacation_recall')
      const recallOrderNumber = recallOrder.order_number

      // Проверка в UI: отзыв применён (даты/дни/приказ отзыва).
      const periods = await getVacationPeriodData(request, emp.id)
      const periodVac = periods.flatMap((p) => p.vacations || []).find((v) => v.id === vacationId)
      expect(periodVac, 'vacation must be visible in periods').toBeTruthy()
      expect(periodVac!.is_recalled).toBe(true)
      const originalDays = periodVac!.original_days ?? VAC_DAYS
      const actualDays = periodVac!.actual_days ?? 0

      const recalledRow = await expandEmployeeHistory(page, empName)
      await expect(recalledRow.getByText(`Отзыв ${RECALL_DATE}`)).toBeVisible({ timeout: 10_000 })
      await expect(
        recalledRow.getByText(`Было ${originalDays} → стало ${actualDays} (вернулось ${originalDays - actualDays})`),
      ).toBeVisible()
      await expect(recalledRow.getByText(`Отзыв: №${recallOrderNumber}`)).toBeVisible()

      // --- 3. Удаление приказа отзыва → отпуск возвращается к исходному ---
      await deleteOrderByNumber(page, recallOrderNumber)

      const restoredRow = await expandEmployeeHistory(page, empName)
      await expect(restoredRow.getByText(/Отзыв/)).not.toBeVisible({ timeout: 10_000 })
      await expect(restoredRow.getByText(vacOrderNumber, { exact: false }).first()).toBeVisible()
      const afterRecallDelete = await apiOps.getOrders({ employee_id: emp.id })
      expect(afterRecallDelete.some((o) => o.id === recallOrder.id)).toBe(false)

      // --- 4. Удаление приказа отпуска → отпуск удаляется каскадом ---
      await deleteOrderByNumber(page, vacOrderNumber)

      const emptyRow = await expandEmployeeHistory(page, empName)
      // «Нет отпусков» рендерится в каждом периоде — берём первый.
      await expect(emptyRow.getByText('Нет отпусков').first()).toBeVisible({ timeout: 10_000 })
      const afterVacOrderDelete = await getVacationItems(request, emp.id)
      expect(afterVacOrderDelete.some((v) => v.id === vacationId)).toBe(false)
    } finally {
      // Остаточный порядок удаления: приказы → отпуск → сотрудник (FK).
      const orders = await apiOps.getOrders({ employee_id: emp.id }).catch(() => [])
      for (const o of orders) {
        await apiOps.deleteOrder(o.id).catch(() => {})
      }
      await apiOps.cleanupEmployee(emp.id).catch(() => {})
      await dispose()
    }
  })

  test('@ui cascade: удаление отпуска целиком каскадом убирает отзыв и оба приказа', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-vac-cascade-${u}`
    const vacBase = `E2EC${Date.now().toString().slice(-6)}`
    const recallBase = `E2ECR${Date.now().toString().slice(-6)}`

    const emp = await apiOps.createEmployee({ name: empName })
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const vacPage = new VacationsPage(page)

      // Отпуск + отзыв через UI.
      const created = await createVacationViaUi(page, vacPage, empName, vacBase, VAC_START, VAC_END)
      const vacationId = created.id
      const vacOrder = await findOrderByType(apiOps, emp.id, 'vacation_paid')

      await recallViaUi(page, vacPage, empName, recallBase)
      const recallOrder = await findOrderByType(apiOps, emp.id, 'vacation_recall')

      // Удаление отпуска целиком через кнопку «Удалить» в развёрнутой строке.
      const historyRow = await expandEmployeeHistory(page, empName)
      await historyRow.getByTitle('Удалить').click()

      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible({ timeout: 10_000 })
      // Preview честно предупреждает про каскад: отзыв будет аннулирован.
      await expect(dialog.getByText(/отзыв будет аннулирован/i)).toBeVisible({ timeout: 10_000 })
      await dialog.getByRole('button', { name: 'Удалить навсегда' }).click()

      const emptyRow = await expandEmployeeHistory(page, empName)
      // «Нет отпусков» рендерится в каждом периоде — берём первый.
      await expect(emptyRow.getByText('Нет отпусков').first()).toBeVisible({ timeout: 10_000 })

      // Каскад через API: отпуск + приказ отпуска + приказ отзыва — всё удалено.
      const after = await getVacationItems(request, emp.id)
      expect(after.some((v) => v.id === vacationId)).toBe(false)
      for (const orderId of [vacOrder.id, recallOrder.id]) {
        const resp = await request.get(`${API_BASE}/api/orders/${orderId}`)
        expect(resp.status(), `order ${orderId} cascade-deleted`).toBe(404)
      }
    } finally {
      const orders = await apiOps.getOrders({ employee_id: emp.id }).catch(() => [])
      for (const o of orders) {
        await apiOps.deleteOrder(o.id).catch(() => {})
      }
      await apiOps.cleanupEmployee(emp.id).catch(() => {})
      await dispose()
    }
  })

  test('@ui cycle: Отпуск → Продление (create vacation order → extension, days stay 10)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-cyc-ext-${u}`
    const emp = await apiOps.createEmployee({
      name: empName,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    const vacPage = new VacationsPage(page)

    // --- Шаг 1: приказ на отпуск через UI-форму + OO-редактор ---
    const created = await createVacationViaUi(
      page,
      vacPage,
      empName,
      `E2EVCE${Date.now().toString().slice(-6)}`,
      toDisplayDate('2024-06-01'),
      toDisplayDate('2024-06-10'),
    )
    expect(created.id, 'vacation must be created').toBeTruthy()
    expect(created.days_count).toBe(10)
    expect(await usedDays(apiOps, emp.id)).toBe(10)

    // --- Шаг 2: продление отпуска через UI-форму + OO-редактор ---
    await vacPage.gotoAdjustment('extension')
    await vacPage.selectVacation(empName)
    await vacPage.fillAdjustmentForm(
      [
        { label: /Начало продления/i, value: toDisplayDate('2024-06-11') },
        { label: /Конец продления/i, value: toDisplayDate('2024-06-14') },
      ],
      `E2EVEX${Date.now().toString().slice(-6)}`,
    )

    const ext = await createOrderViaEditor(page, vacPage, /\/api\/vacations\/\d+\/extend$/)
    expect(ext.extension_order_id, 'extension order must be created').toBeTruthy()

    // Продление не расходует дни отпуска — used_days не меняется.
    expect(await usedDays(apiOps, emp.id)).toBe(10)

    // Приказ продления создан редактором из ФРОНТОВОГО payload (#31): в
    // extra_fields лежат vacation_days + period_start/period_end, а не
    // сервисный extension_days.
    const extOrders = (await apiOps.getOrders({ employee_id: emp.id })).filter(
      (o) => o.order_type_code === 'vacation_extension',
    )
    expect(extOrders.length, 'vacation_extension order must exist').toBe(1)
    const extFields = extOrders[0].extra_fields as Record<string, unknown>
    expect(extFields.vacation_days).toBe(10)
    expect(extFields.period_start).toBe('2024-06-11')
    expect(extFields.period_end).toBe('2024-06-14')
  })

  test('@ui cycle: Отпуск → Перенос (create vacation order → postpone, days 14→7)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-cyc-pos-${u}`
    const emp = await apiOps.createEmployee({
      name: empName,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    const vacPage = new VacationsPage(page)

    // --- Шаг 1: приказ на отпуск через UI-форму + OO-редактор ---
    const created = await createVacationViaUi(
      page,
      vacPage,
      empName,
      `E2EVCP${Date.now().toString().slice(-6)}`,
      toDisplayDate('2024-06-01'),
      toDisplayDate('2024-06-14'),
    )
    expect(created.id, 'vacation must be created').toBeTruthy()
    expect(created.days_count).toBe(14)
    expect(await usedDays(apiOps, emp.id)).toBe(14)

    // --- Шаг 2: перенос части отпуска через UI-форму + OO-редактор ---
    await vacPage.gotoAdjustment('postpone')
    await vacPage.selectVacation(empName)
    await vacPage.fillAdjustmentForm(
      [
        { label: /Начало переноса/i, value: toDisplayDate('2024-06-08') },
        { label: /Конец переноса/i, value: toDisplayDate('2024-06-14') },
      ],
      `E2EVPO${Date.now().toString().slice(-6)}`,
    )

    const pos = await createOrderViaEditor(page, vacPage, /\/api\/vacations\/\d+\/postpone$/)
    expect(pos.postpone_order_id, 'postpone order must be created').toBeTruthy()
    expect(pos.postponed_days).toBe(7)

    // Учёт дней после переноса: 14 − postponed(7) = 7.
    expect(await usedDays(apiOps, emp.id)).toBe(7)

    const posOrders = (await apiOps.getOrders({ employee_id: emp.id })).filter(
      (o) => o.order_type_code === 'vacation_postpone',
    )
    expect(posOrders.length, 'vacation_postpone order must exist').toBe(1)

    // Возврат дней глазами в UI: «Было 14 → стало 7 (перенесено 7)» + № приказа.
    await page.waitForURL(/\/vacations$/, { timeout: 30_000 })
    const posRow = await expandEmployeeHistory(page, empName)
    await expect(
      posRow.getByText(
        `Было ${created.days_count} → стало ${created.days_count - pos.postponed_days} (перенесено ${pos.postponed_days})`,
      ),
    ).toBeVisible({ timeout: 10_000 })
    await expect(posRow.getByText(`Перенос: №${posOrders[0].order_number}`)).toBeVisible()

    const posFields = posOrders[0].extra_fields as Record<string, unknown>
    expect(posFields.postponed_days).toBe(7)
    expect(posFields.used_days).toBe(7)
    expect(posFields.old_vacation_days).toBe(14)
  })
})
