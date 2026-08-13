import { test, expect } from '../fixtures/index'
import { VacationsPage } from '../pages/VacationsPage'
import type { ApiOperations } from '../fixtures/index'
import { saveDraftOrderFromEditor } from '../helpers/onlyoffice-editor'

/**
 * Vacations UI basics beyond smoke/vacations-happy (load + visible):
 * table rows + expand row interaction.
 */
test.describe('Vacations basic @ui', () => {
  test.setTimeout(60_000)

  test('@ui vacations: page loads and seeded employee is visible', async ({
    page,
    apiOps,
  }) => {
    const name = `e2e-emp-vac-ui-${apiOps.uid()}`
    await apiOps.createEmployee({ name })

    const vacPage = new VacationsPage(page)
    await vacPage.goto()
    await vacPage.searchEmployee(name)
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })
  })

  test('@ui vacations: employee row present in table', async ({ page, apiOps }) => {
    const name = `e2e-emp-vac-row-${apiOps.uid()}`
    await apiOps.createEmployee({ name })

    const vacPage = new VacationsPage(page)
    await vacPage.goto()
    await vacPage.searchEmployee(name)

    const employeeRow = await vacPage.getEmployeeRow(name)
    const fromRow = await vacPage.getEmployeeNameByRow(employeeRow)
    expect(fromRow).toContain('e2e-emp-vac-row-')
  })

  test('@ui vacations: selecting employee expands row', async ({ page, apiOps }) => {
    const name = `e2e-emp-vac-exp-${apiOps.uid()}`
    await apiOps.createEmployee({ name })

    const vacPage = new VacationsPage(page)
    await vacPage.goto()
    await vacPage.searchEmployee(name)

    const employeeRow = await vacPage.getEmployeeRow(name)
    await employeeRow.click()

    const chevronDown = employeeRow.locator(
      'svg.lucide-chevron-down, [class*="ChevronDown"], [data-lucide="chevron-down"]'
    )
    await expect(chevronDown).toBeVisible({ timeout: 5_000 })
  })

  test('@ui vacations: partially-close → cancel closure → next vacation fully closes the period', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-vac-close-${u}`
    const emp = await apiOps.createEmployee({
      name: empName,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
      additional_vacation_days: 0,
    })

    // Инициализируем периоды (24 дня в 1-м году, год 1 = 2024-01-15..2025-01-14).
    const periods = await apiOps.getPeriods(emp.id)
    const year1 = periods.find((p) => p.year_number === 1)
    expect(year1).toBeTruthy()

    const vacPage = new VacationsPage(page)
    const historyRow = await expandEmployeeHistory(page, empName, vacPage)

    // Шаг 1: частично закрываем 1-й период через UI (остаток 21, списано 3 ручных).
    await partialClosePeriod(historyRow, page, 21)

    // Шаг 2: отпуск 14 дней через UI-форму + OO-редактор — списывается с периода 1 (21 → 7).
    const vac1 = await createVacationViaUi(page, vacPage, empName, `E2EVC${Date.now().toString().slice(-6)}`, '01.06.2024', '14.06.2024')
    expect(vac1.days_count, 'vacation days must be computed').toBe(14)
    expect(await usedDays(apiOps, emp.id)).toBe(14 + 3)

    // Шаг 3: отменяем частичное закрытие (кнопка ✕ на транзакции) — период снова открыт.
    await page.reload()
    const historyAfterVac = await expandEmployeeHistory(page, empName, vacPage)
    await cancelManualClosure(historyAfterVac, page)

    // Шаг 4: отпуск 10 дней через UI — доедает 1-й период до нуля (полностью израсходован).
    const vac2 = await createVacationViaUi(page, vacPage, empName, `E2EVC2${Date.now().toString().slice(-6)}`, '15.06.2024', '24.06.2024')
    expect(vac2.days_count, 'second vacation days').toBe(10)
    expect(await usedDays(apiOps, emp.id)).toBe(24)

    // Период 1 полностью израсходован (used == total, остаток 0). UI может показывать
    // его открытым с остатком 0 (после отмены закрытия remaining_days=NULL), поэтому
    // финальное состояние проверяем через API-инвариант периода.
    const periodsAfter = await apiOps.getPeriods(emp.id)
    const year1After = periodsAfter.find((p) => p.year_number === 1)
    expect(year1After).toBeTruthy()
    expect(year1After!.used_days).toBe(year1After!.total_days)
    expect(year1After!.remaining_days).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// UI-хелперы (стиль vacation-lifecycle-oo)
// ---------------------------------------------------------------------------

async function usedDays(apiOps: ApiOperations, empId: number): Promise<number> {
  const balance = await apiOps.getBalance(empId)
  return balance.used_days
}

async function fillDate(page: import('@playwright/test').Page, label: RegExp, value: string): Promise<void> {
  const input = page.getByLabel(label).first()
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.click()
  await input.fill(value)
  await input.press('Enter')
}

async function expandEmployeeHistory(
  page: import('@playwright/test').Page,
  empName: string,
  vacPage: VacationsPage,
): Promise<import('@playwright/test').Locator> {
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

/** Карточка периода: поднимаемся от заголовка «N-й г.» до карточки (div с border). */
function periodCard(
  historyRow: import('@playwright/test').Locator,
  periodKey: string,
): import('@playwright/test').Locator {
  const heading = historyRow.getByText(periodKey, { exact: true }).first()
  return heading.locator('xpath=ancestor::div[contains(@class,"border")][1]')
}

/** «Частично закрыть период» через диалог (остаток days). */
async function partialClosePeriod(
  historyRow: import('@playwright/test').Locator,
  page: import('@playwright/test').Page,
  remainingDays: number,
): Promise<void> {
  const card = periodCard(historyRow, '1-й г.')
  await card.getByRole('button', { name: 'Частично закрыть' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  const input = dialog.getByPlaceholder('Введите количество дней')
  await input.fill(String(remainingDays))
  await dialog.getByRole('button', { name: 'Применить' }).click()

  await page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/vacation-periods') &&
      resp.url().includes('partial-close') &&
      resp.request().method() === 'POST',
    { timeout: 10_000 },
  )
}

/** Отменить ручное/частичное закрытие: клик ✕ + подтверждение диалога. */
async function cancelManualClosure(
  historyRow: import('@playwright/test').Locator,
  page: import('@playwright/test').Page,
): Promise<void> {
  const deleteBtn = historyRow.getByTitle('Удалить закрытие').first()
  await expect(deleteBtn).toBeVisible({ timeout: 5_000 })
  await deleteBtn.click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await dialog.getByRole('button', { name: 'Удалить закрытие' }).click()

  await page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/vacation-periods/transactions/') &&
      resp.request().method() === 'DELETE',
    { timeout: 10_000 },
  )
}

/** Создание отпуска с приказом через форму /vacations + редактор OO (как lifecycle-oo). */
async function createVacationViaUi(
  page: import('@playwright/test').Page,
  vacPage: VacationsPage,
  empName: string,
  baseNumber: string,
  start: string,
  end: string,
): Promise<Record<string, any>> {
  await vacPage.goto()
  await vacPage.selectCreateFormEmployee(empName)
  await fillDate(page, /Дата приказа/i, '20.05.2024')
  await page.getByLabel(/номер приказа/i).first().fill(baseNumber)
  await vacPage.fillCreateFormDates(start, end)

  const endpointPromise = page.waitForResponse(
    (r) => /\/api\/vacations$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 120_000 },
  )
  page.on('dialog', (d) => d.accept().catch(() => {}))
  const editor = await vacPage.createOrderOpenEditor()
  editor.on('dialog', (d) => d.accept().catch(() => {}))
  const { orderId } = await saveDraftOrderFromEditor(editor)
  expect(orderId, 'committed order id from editor').toBeGreaterThan(0)
  const endpointResp = await endpointPromise
  expect(endpointResp.ok(), `vacation endpoint should succeed`).toBeTruthy()
  return endpointResp.json()
}

