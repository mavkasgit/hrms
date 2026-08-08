import { test, expect } from '../fixtures/index'
import { type Page } from '@playwright/test'
import { VacationsPage } from '../pages/VacationsPage'

/**
 * #87: Триггер заполнения формы отпуска.
 *
 * Acceptance:
 * - Только автоподставленный номер приказа не создаёт заполнение в localStorage
 * - Выбор сотрудника создаёт полное заполнение (включая автоподставленные дату/номер)
 * - После перезагрузки попап «Черновики» раскрывается сам с подсвеченной строкой,
 *   «Заполнить» возвращает полную форму
 */

const VACATION_DRAFT_KEY = 'hrms_vacation_form_draft'

type VacationDraftShape = {
  employee_id: number | null
  start_date: string
  end_date: string
  order_date: string
  order_number: string
  saved_at: string
}

function readVacationDraft(page: Page): Promise<VacationDraftShape | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as VacationDraftShape) : null
  }, VACATION_DRAFT_KEY)
}

/** Формат даты для DatePicker: ДД.ММ.ГГГГ. */
function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

test.describe('Vacation form recovery @ui', () => {
  test.setTimeout(60_000)

  test('@ui vacations: auto-filled order number alone does not create a form fill (#87)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-trigger-${u}`
    await apiOps.createEmployee({ name: empName })

    const vacPage = new VacationsPage(page)
    await vacPage.goto()

    // Ждём автоподстановку номера приказа (DocumentNumberField подставляет следующий номер)
    await expect(vacPage.orderNumberInput).not.toHaveValue('', { timeout: 15_000 })
    expect(await readVacationDraft(page)).toBeNull()

    // Перезагрузка: pagehide-flush (#51) тоже не должен создать черновик из-за
    // автоподставленного номера — он не входит в триггер заполнения (#87).
    // Детерминированная проверка «не записалось» без фиксированных sleep: flush
    // синхронный, а reload гарантирует, что он уже отработал к моменту проверки.
    await page.reload()
    await expect(vacPage.pageTitle).toBeVisible({ timeout: 20_000 })
    expect(await readVacationDraft(page)).toBeNull()
  })

  test('@ui vacations: employee selection saves full fill → reload → popup highlighted → restore', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-full-${u}`
    const today = new Date()
    const startIso = `${today.getFullYear()}-12-01`
    const endIso = `${today.getFullYear()}-12-14`

    await apiOps.createEmployee({ name: empName })

    const vacPage = new VacationsPage(page)
    await vacPage.goto()

    // Автоподстановка номера приказа произошла сама (до выбора сотрудника)
    await expect(vacPage.orderNumberInput).not.toHaveValue('', { timeout: 15_000 })

    // Реально заполняем форму: сотрудник + даты начала/конца
    await vacPage.selectCreateFormEmployee(empName)
    await vacPage.fillCreateFormDates(toDisplayDate(startIso), toDisplayDate(endIso))

    // Заполнение сохранило полный срез: сотрудник, даты и автоподставленные
    // дата/номер приказа (#87)
    const savedNumber = await vacPage.orderNumberInput.inputValue()
    await expect
      .poll(() => readVacationDraft(page), { timeout: 5_000 })
      .toMatchObject({
        start_date: startIso,
        end_date: endIso,
        order_number: expect.any(String),
      })
    const draft = await readVacationDraft(page)
    expect(draft!.employee_id).not.toBeNull()
    expect(draft!.order_number.trim()).not.toBe('')

    // Перезагрузка → попап «Черновики» раскрылся сам, строка отпуска подсвечена
    await page.reload()
    await expect(vacPage.pageTitle).toBeVisible({ timeout: 20_000 })
    const row = page.getByTestId('form-draft-row-vacations')
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toHaveAttribute('data-highlighted', 'true')

    // «Заполнить» возвращает полную форму: номер, даты и сотрудника
    await row.getByTestId('recovery-restore').click()
    await expect(row).not.toBeVisible({ timeout: 5_000 })

    await expect(vacPage.orderNumberInput).toHaveValue(savedNumber, { timeout: 10_000 })
    await expect(vacPage.startDateInput).toHaveValue(toDisplayDate(startIso), { timeout: 10_000 })
    await expect(vacPage.endDateInput).toHaveValue(toDisplayDate(endIso), { timeout: 10_000 })
    await expect(page.getByText(empName, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
