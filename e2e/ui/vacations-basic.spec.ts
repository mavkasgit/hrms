import { test, expect } from '../fixtures/index'
import { VacationsPage } from '../pages/VacationsPage'

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
})
