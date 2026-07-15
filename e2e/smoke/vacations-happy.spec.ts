import { test, expect } from '../fixtures/index'
import { VacationsPage } from '../pages/VacationsPage'

test.describe('Vacations @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke vacations: page loads and employee visible after api create', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const name = `e2e-emp-vac-${u}`
    const emp = await apiOps.createEmployee({ name })

    // Optional vacation seed (list is employee-centric)
    await apiOps.createVacation(emp.id, {
      start_date: '2024-07-01',
      end_date: '2024-07-14',
      vacation_type: 'Трудовой',
      order_date: '2024-06-20',
    })

    const vacPage = new VacationsPage(page)
    await page.goto('/vacations')
    await expect(vacPage.pageTitle).toBeVisible({ timeout: 15_000 })
    await expect(vacPage.table).toBeVisible({ timeout: 15_000 })

    await vacPage.searchEmployee(name)
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })
  })
})
