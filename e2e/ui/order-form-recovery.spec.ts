import { test, expect } from '../fixtures/index'
import { OrdersPage } from '../pages/OrdersPage'

/**
 * #28: Восстановление несохранённого заполнения формы создания приказа.
 *
 * Acceptance:
 * - Заполнение формы автоматически сохраняется и переживает перезагрузку
 * - На странице показывается уведомление «Восстановить» / «Не сейчас» / «Удалить»
 * - «Восстановить» заполняет форму и перевалидирует данные
 */
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

    // Ждём debounced сохранение в localStorage (800ms + запас)
    await page.waitForTimeout(1500)

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

    // Ждём сохранение
    await page.waitForTimeout(1500)

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
})
