import { test, expect } from '../fixtures/index'
import { EmployeesPage } from '../pages/EmployeesPage'
import { createAuthenticatedRequest } from '../helpers/api-request'
import type { EmployeeFormData } from '../types'

/**
 * Employees UI lifecycle beyond smoke/employees-crud:
 * - full form create via UI
 * - soft-delete visibility (API soft path + list)
 * - create → dismiss → restore UI → soft delete
 *
 * Note: button «Уволить» opens order flow, not soft-dismiss — use apiOps.dismiss.
 */
test.describe('Employees lifecycle @ui', () => {
  test.setTimeout(90_000)

  test('@ui employees: create via UI with full form fields', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const data: EmployeeFormData = {
      name: `e2e-emp-full-${u}`,
      gender: 'М',
      birth_date: '15.05.1990',
      tab_number: Math.floor(100000 + Math.random() * 900000),
      position_name: `e2e-pos-${u}`,
      department_name: `e2e-dept-${u}`,
      citizenship: true,
      residency: true,
      hire_date: '15.01.2024',
      payment_form: 'Повременная',
      rate: 25.5,
      contract_start: '15.01.2024',
      contract_end: '14.01.2025',
      personal_number: `ЛН-${u.toUpperCase()}`.slice(0, 20),
      insurance_number: `СН-${u.toUpperCase()}`.slice(0, 20),
      passport_number: `AB${Math.floor(1000000 + Math.random() * 9000000)}`,
    }

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let employeeId: number | undefined
    let positionId: number | undefined
    let departmentId: number | undefined

    try {
      const empPage = new EmployeesPage(page)
      await empPage.goto()
      await empPage.createEmployeeViaUI(data)

      await empPage.openEmployee(data.name)
      await expect(page.getByRole('textbox').first()).toHaveValue(data.name)
      await expect(page.getByRole('spinbutton').nth(0)).toHaveValue(String(data.tab_number))
      await page.keyboard.press('Escape')

      // Track for hard cleanup
      const found = await apiOps.searchEmployees(data.name)
      employeeId = found[0]?.id
      if (employeeId) {
        const full = await apiOps.getEmployee(employeeId)
        departmentId = full.department_id
        positionId = full.position_id
      }
    } finally {
      if (employeeId) await request.delete(`/api/employees/${employeeId}?hard=true&confirm=true`).catch(() => {})
      if (positionId) await request.delete(`/api/positions/${positionId}`).catch(() => {})
      if (departmentId) await request.delete(`/api/departments/${departmentId}`).catch(() => {})
      await dispose()
    }
  })

  test('@ui employees: soft delete hides employee from active list', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const name = `e2e-emp-soft-${u}`
    const employee = await apiOps.createEmployee({ name })

    const empPage = new EmployeesPage(page)
    await empPage.goto()
    await empPage.searchEmployee(name)
    await empPage.expectEmployeeInTable(name)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const deleteResp = await request.delete(`/api/employees/${employee.id}`, {
        params: { hard: false },
      })
      expect(deleteResp.status()).toBe(204)

      await empPage.goto()
      await empPage.searchEmployee(name)
      await empPage.expectEmployeeNotInTable(name)
    } finally {
      await request
        .delete(`/api/employees/${employee.id}?hard=true&confirm=true`)
        .catch(() => {})
      await dispose()
    }
  })

  test('@ui employees: create → dismiss → restore UI → soft delete', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const name = `e2e-emp-cycle-${u}`
    const data: EmployeeFormData = {
      name,
      gender: 'М',
      birth_date: '15.05.1990',
      tab_number: Math.floor(100000 + Math.random() * 900000),
      position_name: `e2e-pos-cycle-${u}`,
      department_name: `e2e-dept-cycle-${u}`,
      citizenship: true,
      residency: true,
      hire_date: '15.01.2024',
      payment_form: 'Повременная',
      rate: 25.5,
      contract_start: '15.01.2024',
      contract_end: '14.01.2025',
      personal_number: `ЛН-C-${u.toUpperCase()}`.slice(0, 20),
      insurance_number: `СН-C-${u.toUpperCase()}`.slice(0, 20),
      passport_number: `AB${Math.floor(1000000 + Math.random() * 9000000)}`,
    }

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let employeeId: number | undefined
    let positionId: number | undefined
    let departmentId: number | undefined

    try {
      const empPage = new EmployeesPage(page)
      await empPage.goto()
      await empPage.createEmployeeViaUI(data)

      const found = await apiOps.searchEmployees(name)
      employeeId = found[0]?.id
      expect(employeeId).toBeTruthy()
      if (employeeId) {
        const full = await apiOps.getEmployee(employeeId)
        departmentId = full.department_id
        positionId = full.position_id
      }

      await apiOps.dismissEmployee(employeeId!)

      await empPage.goto()
      await empPage.searchEmployee(name)
      await empPage.expectEmployeeNotInTable(name)

      // Status multi-toggle: Уволенные ON + Активные OFF
      await empPage.filterBtn.click()
      const panel = page.locator('div.absolute').filter({ hasText: 'Статус' }).first()
      await expect(panel).toBeVisible()
      await panel.getByRole('button', { name: 'Уволенные' }).click()
      await panel.getByRole('button', { name: 'Активные' }).click()
      await empPage.filterBtn.click()

      await empPage.searchEmployee(name)
      await empPage.expectEmployeeInTable(name)

      // Restore via UI button in edit dialog
      await empPage.restoreEmployee(name)

      await empPage.filterBtn.click()
      const panel2 = page.locator('div.absolute').filter({ hasText: 'Статус' }).first()
      await expect(panel2).toBeVisible()
      await panel2.getByRole('button', { name: 'Активные' }).click()
      await panel2.getByRole('button', { name: 'Уволенные' }).click()
      await empPage.filterBtn.click()

      await empPage.searchEmployee(name)
      await empPage.expectEmployeeInTable(name)

      const softResp = await request.delete(`/api/employees/${employeeId}`, {
        params: { hard: false },
      })
      expect(softResp.status()).toBe(204)
    } finally {
      if (employeeId) {
        await request
          .delete(`/api/employees/${employeeId}?hard=true&confirm=true`)
          .catch(() => {})
      }
      if (positionId) await request.delete(`/api/positions/${positionId}`).catch(() => {})
      if (departmentId) await request.delete(`/api/departments/${departmentId}`).catch(() => {})
      await dispose()
    }
  })
})
