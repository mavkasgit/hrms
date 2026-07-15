import { test, expect } from '../fixtures/index'
import { VacationsPage } from '../pages/VacationsPage'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Inline edit of additional vacation days on /vacations.
 * Legacy: add-vacation-days.spec.ts
 */
test.describe('Additional vacation days @ui', () => {
  test.setTimeout(60_000)

  test('@ui vacations: inline edit additional days and persist via API', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const dept = await apiOps.createDepartment(`e2e-dept-addays-${u}`)
    const pos = await apiOps.createPosition(`e2e-pos-addays-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: `e2e-emp-addays-${u}`,
      additional_vacation_days: 3,
    })

    const vacPage = new VacationsPage(page)
    await vacPage.goto()
    await vacPage.searchEmployee(emp.name)

    const employeeRow = await vacPage.getEmployeeRow(emp.name)
    const addDaysColumnIndex = await vacPage.getAddDaysColumnIndex()
    expect(addDaysColumnIndex).toBeGreaterThan(-1)

    const addDaysCell = await vacPage.getAddDaysCellForRow(employeeRow, addDaysColumnIndex)
    await expect(addDaysCell).toBeVisible()

    const oldValueText = await addDaysCell.locator('button').textContent()
    const oldValue = parseInt(oldValueText || '0', 10)
    expect(oldValue).toBe(3)

    const newValue = oldValue + 5
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/employees') &&
        resp.request().method() === 'PUT' &&
        resp.status() === 200
    )

    await vacPage.editAddDays(addDaysCell, newValue)
    await responsePromise

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const apiResponse = await request.get(`/api/employees/${emp.id}`)
      expect(apiResponse.status()).toBe(200)
      const updatedEmp = await apiResponse.json()
      expect(updatedEmp.additional_vacation_days).toBe(newValue)
    } finally {
      await dispose()
    }

    await expect(addDaysCell).toHaveText(String(newValue), { timeout: 5_000 })
  })
})
