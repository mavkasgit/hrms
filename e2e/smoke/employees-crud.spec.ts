import { test, expect } from '../fixtures/index'
import { EmployeesPage } from '../pages/EmployeesPage'

/**
 * Soft dismiss in UI opens «приказ об увольнении» flow (orders), not API dismiss.
 * Lifecycle smoke uses apiOps dismiss/restore + filter UI to assert list state.
 */
test.describe('Employees CRUD @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke employees: create via apiOps and visible in list', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const name = `e2e-emp-${u}`

    await apiOps.createEmployee({ name })

    const empPage = new EmployeesPage(page)
    await page.goto('/employees')
    await expect(empPage.pageTitle).toBeVisible({ timeout: 15_000 })

    await empPage.searchEmployee(name)
    await empPage.expectEmployeeInTable(name)
  })

  test('@smoke employees: dismiss and restore cycle', async ({ page, apiOps }) => {
    const u = apiOps.uid()
    const name = `e2e-emp-lifecycle-${u}`

    const emp = await apiOps.createEmployee({ name })
    expect(emp.id).toBeGreaterThan(0)

    const empPage = new EmployeesPage(page)
    await page.goto('/employees')
    await expect(empPage.pageTitle).toBeVisible({ timeout: 15_000 })

    await empPage.searchEmployee(name)
    await empPage.expectEmployeeInTable(name)

    await apiOps.dismissEmployee(emp.id)
    const dismissed = await apiOps.getEmployee(emp.id)
    expect(dismissed.is_dismissed).toBeTruthy()

    // Active filter default — dismissed should disappear
    await page.reload()
    await expect(empPage.pageTitle).toBeVisible({ timeout: 15_000 })
    await empPage.searchEmployee(name)
    await empPage.expectEmployeeNotInTable(name)

    // Status multi-toggle: enable Уволенные, disable Активные
    await empPage.filterBtn.click()
    const panel = page.locator('div.absolute').filter({ hasText: 'Статус' }).first()
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: 'Уволенные' }).click()
    await panel.getByRole('button', { name: 'Активные' }).click()
    await empPage.filterBtn.click()

    await empPage.searchEmployee(name)
    await empPage.expectEmployeeInTable(name)

    await apiOps.restoreEmployee(emp.id)
    const restored = await apiOps.getEmployee(emp.id)
    expect(restored.is_dismissed).toBeFalsy()

    // Reset filters to active-only
    await empPage.filterBtn.click()
    const panel2 = page.locator('div.absolute').filter({ hasText: 'Статус' }).first()
    await expect(panel2).toBeVisible()
    await panel2.getByRole('button', { name: 'Активные' }).click()
    await panel2.getByRole('button', { name: 'Уволенные' }).click()
    await empPage.filterBtn.click()

    await empPage.searchEmployee(name)
    await empPage.expectEmployeeInTable(name)
  })
})
