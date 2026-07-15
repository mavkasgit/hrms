import { test, expect } from '../fixtures/index'

/**
 * Vacation plan grid: fractional values and clear cell.
 * Legacy: vacation-plan-fill.spec.ts
 *
 * Row layout: dept | tags | name | Jan..Dec  → month cells start at td index 3.
 * Edit opens input with data-testid vacation-cell-input-{empId}-{monthNum}.
 */
test.describe('Vacation plan fill @ui', () => {
  test.setTimeout(60_000)

  test('@ui vacation-plan: write fractional values and clear cell', async ({
    page,
    apiOps,
  }) => {
    const waitForPlanMutation = () =>
      page.waitForResponse((resp) => {
        const method = resp.request().method()
        return (
          resp.url().includes('/api/vacation-plans') &&
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
          resp.status() >= 200 &&
          resp.status() < 500
        )
      })

    const u = apiOps.uid()
    const testYear = new Date().getFullYear()

    const dept = await apiOps.createDepartment(`e2e-dept-plan-${u}`)
    const pos = await apiOps.createPosition(`e2e-pos-plan-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: `e2e-emp-plan-${u}`,
    })

    await page.goto('/vacation-calendar')
    await expect(page.getByRole('heading', { name: /календарь/i })).toBeVisible({
      timeout: 15_000,
    })

    const yearTrigger = page.locator('[role="combobox"]').first()
    await yearTrigger.click()
    const yearOption = page.getByRole('option', { name: String(testYear) })
    await expect(yearOption).toBeVisible({ timeout: 5_000 })
    await yearOption.click()

    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 15_000 })

    const employeeRow = page.locator('tbody tr').filter({ hasText: emp.name }).first()
    await expect(employeeRow).toBeVisible({ timeout: 10_000 })

    const openMonthCell = async (monthNum: number) => {
      // dept(0) + tags(1) + name(2) + months start at 3 → month 1 = index 3
      const cell = employeeRow.locator('td').nth(2 + monthNum)
      await cell.locator('button').click()
      const input = page.getByTestId(`vacation-cell-input-${emp.id}-${monthNum}`)
      await expect(input).toBeVisible({ timeout: 5_000 })
      return { cell, input }
    }

    // January — 0.5
    {
      const { cell, input } = await openMonthCell(1)
      await input.fill('0.5')
      const mutation = waitForPlanMutation()
      await input.press('Enter')
      await mutation
      await expect(input).not.toBeVisible({ timeout: 5_000 })
      await expect(cell).toContainText('0.5', { timeout: 5_000 })
    }

    // February — 0.33
    {
      const { cell, input } = await openMonthCell(2)
      await input.fill('0.33')
      const mutation = waitForPlanMutation()
      await input.press('Enter')
      await mutation
      await expect(input).not.toBeVisible({ timeout: 5_000 })
      await expect(cell).toContainText('0.33', { timeout: 5_000 })
    }

    // March — 1/3
    {
      const { cell, input } = await openMonthCell(3)
      await input.fill('1/3')
      const mutation = waitForPlanMutation()
      await input.press('Enter')
      await mutation
      await expect(input).not.toBeVisible({ timeout: 5_000 })
      await expect(cell).toContainText('1/3', { timeout: 5_000 })
    }

    // Clear January
    {
      const { cell, input } = await openMonthCell(1)
      await input.clear()
      const mutation = waitForPlanMutation()
      await input.press('Enter')
      await mutation
      await expect(input).not.toBeVisible({ timeout: 5_000 })
      await expect(cell).toHaveText(/^[\s—]*$/, { timeout: 5_000 })
    }
  })
})
