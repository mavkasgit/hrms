import { test, expect } from '../fixtures/index'

/**
 * Templates UI shallow smoke (P1-9 / scout §9):
 * /templates → h1, tabs, create-type buttons visible.
 * No create/delete types, no OnlyOffice editor.
 *
 * Custom TabsTrigger = plain <button>, not role=tab.
 */
test.describe('Templates UI smoke @ui', () => {
  test.setTimeout(45_000)

  test('@ui templates: h1, tabs, create-type buttons per tab', async ({ page }) => {
    await page.goto('/templates')

    await expect(
      page.getByRole('heading', { name: 'Шаблоны документов', level: 1 })
    ).toBeVisible({ timeout: 15_000 })

    const tabOrders = page.getByRole('button', { name: 'Приказы', exact: true })
    const tabNotifications = page.getByRole('button', {
      name: 'Уведомления',
      exact: true,
    })
    const tabStatements = page.getByRole('button', {
      name: 'Заявления',
      exact: true,
    })

    await expect(tabOrders).toBeVisible()
    await expect(tabNotifications).toBeVisible()
    await expect(tabStatements).toBeVisible()

    // Default tab: orders
    await expect(
      page.getByRole('button', { name: 'Создать тип приказа' })
    ).toBeVisible({ timeout: 10_000 })

    await tabNotifications.click()
    await expect(
      page.getByRole('button', { name: 'Создать тип уведомления' })
    ).toBeVisible({ timeout: 10_000 })

    await tabStatements.click()
    await expect(
      page.getByRole('button', { name: 'Создать тип заявления' })
    ).toBeVisible({ timeout: 10_000 })
  })
})
