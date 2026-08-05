import { test, expect } from '../fixtures/index'
import { type Page } from '@playwright/test'
import { OrdersPage } from '../pages/OrdersPage'
import type { ApiOperations } from '../fixtures/api'

/**
 * #28: Восстановление несохранённого заполнения формы создания приказа.
 *
 * Acceptance:
 * - Заполнение формы автоматически сохраняется и переживает перезагрузку
 * - На странице показывается уведомление «Восстановить» / «Не сейчас» / «Удалить»
 * - «Восстановить» заполняет форму и перевалидирует данные
 * - Автосейв в рамках сессии не блокируется диалогом перезаписи (#49)
 * - Подлинный (пред-сессионный) черновик защищён диалогом перезаписи (#49)
 * - «Восстановить» возвращает все поля, включая контрактные (#50)
 */

const DRAFT_KEY = 'hrms_order_form_draft'

type DraftShape = {
  employee_id: number | null
  order_type_id: number | null
  order_date: string
  order_number: string
  extra_fields: Record<string, unknown>
  saved_at: string
}

/** Читаем сохранённый черновик из localStorage без фиксированных sleep (canon e2e). */
function readStoredDraft(page: Page): Promise<DraftShape | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as DraftShape) : null
  }, DRAFT_KEY)
}

async function hireTypeName(apiOps: ApiOperations): Promise<string> {
  const types = await apiOps.getOrderTypes()
  const hireType = types.find((t) => t.code === 'hire')
  expect(hireType, 'hire order type must exist').toBeTruthy()
  return hireType!.name
}

/** Заполнить поле «Номер» (contract_number) в layout hire — text-поле без aria-label. */
async function fillContractNumber(page: Page, value: string): Promise<void> {
  const input = page.getByPlaceholder('Номер')
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.fill(value)
  await input.blur()
}

test.describe('Order form recovery @ui', () => {
  test.setTimeout(60_000)

  test('@ui orders: fill form → reload → restore via banner', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-recovery-${u}`
    const orderNumber = `REC${Date.now().toString().slice(-6)}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()

    // Заполняем форму: сотрудник + тип приказа + номер
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName('Перевод')
    await ordersPage.fillOrderNumber(orderNumber)

    // Ждём debounced сохранение в localStorage (без waitForTimeout)
    await expect
      .poll(() => readStoredDraft(page), { timeout: 5_000 })
      .toMatchObject({ order_number: expect.stringContaining(orderNumber) })

    // Перезагружаем страницу
    await page.reload()
    await expect(ordersPage.heading).toBeVisible({ timeout: 20_000 })

    // Баннер восстановления виден
    const banner = page.getByTestId('order-form-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })

    // Нажимаем «Восстановить»
    await page.getByTestId('recovery-restore').click()

    // Баннер исчезает
    await expect(banner).not.toBeVisible({ timeout: 5_000 })

    // Форма заполнена: номер приказа на месте
    await ordersPage.ensureCreateFormOpen()
    const numberInput = ordersPage.orderNumberInput
    await expect(numberInput).toHaveValue(orderNumber, { timeout: 10_000 })

    // Сотрудник отображается (перевалидация по id)
    await expect(page.getByText(empName, { exact: false }).first()).toBeVisible({ timeout: 10_000 })
  })

  test('@ui orders: dismiss banner hides it, remove clears draft', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-dismiss-${u}`

    await apiOps.createEmployee({ name: empName })

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)

    // Ждём сохранение черновика
    await expect
      .poll(() => readStoredDraft(page), { timeout: 5_000 })
      .not.toBeNull()

    // Перезагрузка → баннер
    await page.reload()
    await expect(ordersPage.heading).toBeVisible({ timeout: 20_000 })
    const banner = page.getByTestId('order-form-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })

    // «Не сейчас» прячет баннер
    await page.getByTestId('recovery-dismiss').click()
    await expect(banner).not.toBeVisible({ timeout: 5_000 })

    // Перезагрузка → баннер снова виден (черновик не удалён)
    await page.reload()
    await expect(ordersPage.heading).toBeVisible({ timeout: 20_000 })
    await expect(banner).toBeVisible({ timeout: 10_000 })

    // «Удалить» очищает черновик
    await page.getByTestId('recovery-remove').click()
    await expect(banner).not.toBeVisible({ timeout: 5_000 })

    // Перезагрузка → баннера нет
    await page.reload()
    await expect(ordersPage.heading).toBeVisible({ timeout: 20_000 })
    await expect(banner).not.toBeVisible({ timeout: 5_000 })
  })

  test('@ui orders: session autosave keeps extra fields without overwrite dialog (#49)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-autosave-${u}`
    const contractNum = `CN-${Date.now().toString().slice(-6)}`

    await apiOps.createEmployee({ name: empName })
    const typeName = await hireTypeName(apiOps)

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName(typeName)
    await ordersPage.fillOrderNumber(`E2EA${Date.now().toString().slice(-6)}`)
    await fillContractNumber(page, contractNum)
    await ordersPage.fillExtraFieldByLabel(/конец испытательного срока/i, '15.12.2026')

    // Автосейв записал контрактные поля в localStorage
    await expect
      .poll(
        async () => (await readStoredDraft(page))?.extra_fields ?? null,
        { timeout: 5_000 }
      )
      .toMatchObject({ contract_number: contractNum, trial_end: '2026-12-15' })

    // Диалог перезаписи не появился из-за автосейва текущей сессии
    await expect(
      page.getByRole('heading', { name: 'Перезаписать сохранённое заполнение?' })
    ).not.toBeVisible({ timeout: 3_000 })
  })

  test('@ui orders: real overwrite — pre-existing draft prompts, confirm replaces (#49)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-overwrite-${u}`
    const orderNumber = `E2EB${Date.now().toString().slice(-6)}`

    await apiOps.createEmployee({ name: empName })

    // Черновик, существовавший ДО загрузки страницы (с прошлой сессии)
    await page.addInitScript((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          employee_id: null,
          order_type_id: null,
          order_date: '',
          order_number: '',
          extra_fields: { old_field: 'old-value' },
          saved_at: new Date().toISOString(),
        })
      )
    }, DRAFT_KEY)

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    const banner = page.getByTestId('order-form-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })

    // «Не сейчас» — баннер прячется, черновик остаётся
    await page.getByTestId('recovery-dismiss').click()
    await expect(banner).not.toBeVisible({ timeout: 5_000 })

    // Начинаем новое заполнение
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName('Перевод')
    await ordersPage.fillOrderNumber(orderNumber)

    // Защита подлинного черновика: диалог перезаписи появляется
    const dialog = page.getByRole('heading', { name: 'Перезаписать сохранённое заполнение?' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // «Перезаписать» заменяет черновик
    await page.getByRole('button', { name: 'Перезаписать', exact: true }).click()

    await expect
      .poll(() => readStoredDraft(page), { timeout: 5_000 })
      .toMatchObject({ order_number: expect.stringContaining(orderNumber) })
  })

  test('@ui orders: restore hire draft brings back contract fields (#50)', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-restore-cf-${u}`
    const contractNum = `CN-${Date.now().toString().slice(-6)}`

    await apiOps.createEmployee({ name: empName })
    const typeName = await hireTypeName(apiOps)

    const ordersPage = new OrdersPage(page)
    await ordersPage.goto()
    await ordersPage.ensureCreateFormOpen()
    await ordersPage.selectEmployeeByName(empName)
    await ordersPage.selectOrderTypeByName(typeName)
    await ordersPage.fillOrderNumber(`E2EC${Date.now().toString().slice(-6)}`)
    await fillContractNumber(page, contractNum)
    await ordersPage.fillExtraFieldByLabel(/конец испытательного срока/i, '15.12.2026')

    // Черновик сохранил контрактные поля
    await expect
      .poll(
        async () => (await readStoredDraft(page))?.extra_fields ?? null,
        { timeout: 5_000 }
      )
      .toMatchObject({ contract_number: contractNum, trial_end: '2026-12-15' })

    // Перезагрузка → баннер → «Восстановить»
    await page.reload()
    await expect(ordersPage.heading).toBeVisible({ timeout: 20_000 })
    const banner = page.getByTestId('order-form-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('recovery-restore').click()
    await expect(banner).not.toBeVisible({ timeout: 5_000 })

    // Контрактные поля восстановлены вместе с формой
    await ordersPage.ensureCreateFormOpen()
    await expect(page.getByPlaceholder('Номер')).toHaveValue(contractNum, {
      timeout: 10_000,
    })
    await expect(page.getByLabel(/конец испытательного срока/i)).toHaveValue('15.12.2026', {
      timeout: 10_000,
    })

    // Реальная смена типа приказа сбрасывает восстановленные поля (#50):
    // hire-поле исчезает, поле transfer не наследует номер hire-контракта
    await ordersPage.selectOrderTypeByName('Перевод')
    await expect(page.getByLabel(/конец испытательного срока/i)).not.toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByPlaceholder('Номер')).toHaveValue('', { timeout: 5_000 })
  })
})
