import { test, expect } from '../fixtures/index'
import { type Locator, type Page } from '@playwright/test'
import { AbsencesPage } from '../pages/AbsencesPage'
import { OrdersPage } from '../pages/OrdersPage'

/**
 * #87 (продолжение): триггер заполнения формы учитывает только реально
 * заполняемые пользователем поля. Автоподстановка номера приказа/заявления
 * контентом не является — открытие страницы не создаёт «фантомный» черновик.
 *
 * Проверяется на репрезентативных страницах (отпуск за свой счёт — OrderNumberField
 * с автоподстановкой; общий приказ — единственные поля автоподставляются).
 */

const UNPAID_DRAFT_KEY = 'hrms_unpaid_leave_form_draft'
const GENERAL_DRAFT_KEY = 'hrms_order_general_form_draft'

function readDraft(page: Page, key: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    return raw ? JSON.parse(raw) : null
  }, key)
}

async function expectNumberAutoFilled(page: Page, locator: Locator): Promise<void> {
  await expect(locator).not.toHaveValue('', { timeout: 15_000 })
}

test.describe('Form draft trigger consistency @ui', () => {
  test.setTimeout(60_000)

  test('@ui absences: auto-filled order number alone does not create a fill on /unpaid-leaves (#87)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-trigger-unpaid-${u}`
    await apiOps.createEmployee({ name: empName })

    const absPage = new AbsencesPage(page)
    await absPage.gotoUnpaidLeaves()

    // Номер приказа автоподставился — единственное изменение формы
    const numberInput = page.getByLabel(/номер приказа/i).first()
    await expectNumberAutoFilled(page, numberInput)
    expect(await readDraft(page, UNPAID_DRAFT_KEY)).toBeNull()

    // Перезагрузка: pagehide-flush тоже не должен создать черновик из-за
    // автоподставленного номера (детерминированная проверка «не записалось»)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Отпуск за свой счет', exact: true })
    ).toBeVisible({ timeout: 20_000 })
    expect(await readDraft(page, UNPAID_DRAFT_KEY)).toBeNull()

    // Реальный ввод (выбор сотрудника) создаёт полное заполнение, включая номер
    const employeeSearch = page.getByPlaceholder('Поиск по ФИО...').first()
    await employeeSearch.click()
    await employeeSearch.fill(empName)
    const option = page.locator('button').filter({ hasText: empName }).first()
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()
    await expect(page.getByText(empName, { exact: false }).first()).toBeVisible({
      timeout: 5_000,
    })

    await expect
      .poll(() => readDraft(page, UNPAID_DRAFT_KEY), { timeout: 5_000 })
      .not.toBeNull()
    const draft = await readDraft(page, UNPAID_DRAFT_KEY)
    expect(draft!.employee_id).not.toBeNull()
    expect(String(draft!.order_number).trim()).not.toBe('')
  })

  test('@ui orders: auto-filled number alone does not create a fill on general order form (#87)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    await apiOps.createEmployee({ name: `e2e-trigger-general-${u}` })

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.switchToGeneralTab()

    // Номер автоподставился — но заполнение без действий пользователя не создаётся
    const numberInput = page.getByLabel(/номер приказа/i).first()
    await expectNumberAutoFilled(page, numberInput)
    expect(await readDraft(page, GENERAL_DRAFT_KEY)).toBeNull()

    // Реальная правка номера — заполнение создаётся (восстановление останется полным)
    await numberInput.fill(`E2EG${Date.now().toString().slice(-6)}`)
    await numberInput.blur()

    await expect
      .poll(() => readDraft(page, GENERAL_DRAFT_KEY), { timeout: 5_000 })
      .not.toBeNull()
    const draft = await readDraft(page, GENERAL_DRAFT_KEY)
    expect(String(draft!.general_order_number).trim()).not.toBe('')
  })
})
