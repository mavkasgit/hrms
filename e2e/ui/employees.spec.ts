import { test, expect } from '../fixtures'
import type { APIRequestContext } from '@playwright/test'
import { EmployeesPage } from '../pages/EmployeesPage'
import {
  makeEmployeeData,
  fillEmployeeForm,
  uid,
  comboboxCreate,
  dateField,
  fillGridInput,
} from '../helpers/employee-helpers'
import { workerPrefix } from '../helpers/test-utils'

const EMPLOYEE_CLEANUP_RE = /^(Тест-Сотрудник-|Цикл-Тест-)/
const DEPARTMENT_CLEANUP_RE = /^(Тест-Отдел-|Цикл-Отдел-)/
const POSITION_CLEANUP_RE = /^(Тест-Должность-|Цикл-Должность-)/

/** UID с worker-тегом — изоляция данных при PW_WORKERS>1 */
function scopedUid(): string {
  return uid(workerPrefix(test.info().parallelIndex))
}

function scopedEmployeeData() {
  const base = makeEmployeeData()
  const u = scopedUid()
  return {
    ...base,
    name: `Тест-Сотрудник-${u}`,
    position: `Тест-Должность-${u}`,
    department: `Тест-Отдел-${u}`,
    personal_number: `ЛН-${u.toUpperCase()}`,
    insurance_number: `СН-${u.toUpperCase()}`,
  }
}

/** Cleanup только артефактов текущего worker'а (не трогаем параллельные тесты) */
async function cleanupEmployeesArtifacts(request: APIRequestContext, workerTag: string) {
  const employeesResp = await request.get('/api/employees', { params: { per_page: 1000 } })
  const employeesData = await employeesResp.json()
  const employees = employeesData.items || []

  for (const employee of employees) {
    if (!EMPLOYEE_CLEANUP_RE.test(employee.name)) continue
    if (!employee.name.includes(workerTag)) continue
    await request.delete(`/api/employees/${employee.id}`, {
      params: { hard: true, confirm: true },
    }).catch(() => {})
  }

  const positionsResp = await request.get('/api/positions', { params: { per_page: 1000 } })
  const positions = await positionsResp.json()
  for (const position of positions) {
    if (!POSITION_CLEANUP_RE.test(position.name)) continue
    if (!position.name.includes(workerTag)) continue
    await request.delete(`/api/positions/${position.id}`).catch(() => {})
  }

  const departmentsResp = await request.get('/api/departments', { params: { per_page: 1000 } })
  const departments = await departmentsResp.json()
  for (const department of departments) {
    if (!DEPARTMENT_CLEANUP_RE.test(department.name)) continue
    if (!department.name.includes(workerTag)) continue
    await request.delete(`/api/departments/${department.id}`).catch(() => {})
  }
}

test.describe('Сотрудники UI', () => {
  test.setTimeout(45000)

  test.afterEach(async ({ request }, testInfo) => {
    const tag = workerPrefix(testInfo.parallelIndex)
    await cleanupEmployeesArtifacts(request, tag)
  })

  test('создание сотрудника с заполнением всех полей', async ({ page }) => {
    const emp = scopedEmployeeData()
    console.log(`[TEST] Сотрудник: ${emp.name} | должность: ${emp.position} | отдел: ${emp.department}`)

    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /сотрудники/i, level: 1 })).toBeVisible()

    await page.getByRole('button', { name: /добавить/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await fillEmployeeForm(page, emp)
    await page.screenshot({ path: 'test-results/before-submit.png' })

    console.log('[TEST] Все поля заполнены, нажимаем Создать...')

    page.on('request', (req) => {
      if (req.url().includes('/api/employees') && req.method() === 'POST') {
        console.log(`[TEST] API Request: ${req.url()}`)
        console.log(`[TEST] Request Body: ${req.postData()}`)
      }
    })
    page.on('response', async (resp) => {
      if (resp.url().includes('/api/employees') && resp.request().method() === 'POST') {
        try {
          console.log(`[TEST] API Response Status: ${resp.status()}`)
          console.log(`[TEST] API Response Body: ${await resp.text()}`)
        } catch {
          console.log(`[TEST] API Response Status: ${resp.status()} (could not read body)`)
        }
      }
    })

    const createResponse = page.waitForResponse((resp) => {
      return resp.url().includes('/api/employees')
        && resp.request().method() === 'POST'
        && resp.status() >= 200
        && resp.status() < 500
    })

    await dialog.getByRole('button', { name: /создать/i }).click()
    await createResponse

    await expect(dialog).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText(emp.name)).toBeVisible({ timeout: 3000 })
    console.log(`[TEST] ✅ Сотрудник "${emp.name}" создан (таб. №${emp.tab_number})`)

    await page.getByText(emp.name).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()
    await expect(page.getByRole('textbox').first()).toHaveValue(emp.name)
    await expect(page.getByRole('spinbutton').nth(0)).toHaveValue(String(emp.tab_number))
    console.log('[TEST] ✅ Поля верифицированы')
    await page.keyboard.press('Escape')
  })

  test('мягкое удаление активного сотрудника', async ({ page, apiOps }) => {
    const employee = await apiOps.createEmployee({})
    const empName = employee.name
    const employeeId = employee.id
    console.log(`[TEST] Создан тестовый сотрудник: "${empName}" (id=${employeeId})`)

    const employeesPage = new EmployeesPage(page)
    await employeesPage.goto()
    await employeesPage.expectEmployeeInTable(empName)

    const deleteResp = await page.request.delete(`/api/employees/${employeeId}`, {
      params: { hard: false },
    })
    expect(deleteResp.status()).toBe(204)

    await employeesPage.goto()
    await employeesPage.expectEmployeeNotInTable(empName)
    console.log(`[TEST] ✅ Сотрудник "${empName}" успешно удалён (soft delete)`)

    await apiOps.deleteEmployee(employeeId).catch(() => {})
  })

  test('создание → восстановление → удаление', async ({ page, apiOps }) => {
    const u = scopedUid()
    const empName = `Цикл-Тест-${u}`
    const empPosition = `Цикл-Должность-${u}`
    const empDepartment = `Цикл-Отдел-${u}`

    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /сотрудники/i, level: 1 })).toBeVisible()

    await page.getByRole('button', { name: /добавить/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.getByRole('textbox').first().fill(empName)
    await page.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: 'Мужской' }).click()
    await dateField(page, 0).fill('15.05.1990')

    const tabNumber = Math.floor(100000 + Math.random() * 900000)
    await page.getByRole('spinbutton').nth(0).fill(String(tabNumber))
    await comboboxCreate(page, 'Должность', empPosition)
    await comboboxCreate(page, 'Подразделение', empDepartment)
    await page.getByLabel('Гражданство РБ', { exact: true }).check()
    await page.getByLabel('Резидент РБ', { exact: true }).check()
    await dateField(page, 1).fill('15.01.2024')
    await page.getByRole('combobox').filter({ hasText: 'Не указана' }).click()
    await page.getByRole('option', { name: 'Повременная' }).click()
    await page.getByRole('spinbutton').nth(1).fill('25.5')
    await dateField(page, 2).fill('15.01.2024')
    await dateField(page, 3).fill('14.01.2025')
    await page.getByRole('textbox').nth(5).fill(`ЛН-${u.toUpperCase()}`)
    await fillGridInput(page, 2, `СН-${u.toUpperCase()}`)
    await fillGridInput(page, 3, `AB${Math.floor(1000000 + Math.random() * 9000000)}`)

    await dialog.getByRole('button', { name: /создать/i }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText(empName)).toBeVisible({ timeout: 5000 })

    // Получаем ID сотрудника через API
    const searchResp = await page.request.get('/api/employees', {
      params: { q: empName, page: 1, per_page: 1 },
    })
    const searchData = await searchResp.json()
    const employeeId = searchData.items[0]?.id
    expect(employeeId).toBeTruthy()

    // Увольняем через API
    await apiOps.dismissEmployee(employeeId)

    // Проверяем что сотрудник не виден в активных
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('table tbody').getByText(empName)).not.toBeVisible({ timeout: 5000 })

    // Показываем только уволенных (multi-toggle: нужен dismissed ON + active OFF,
    // иначе status=undefined → API default active и уволенные не видны)
    await page.getByRole('button', { name: 'Фильтры' }).click()
    await page.getByRole('button', { name: 'Уволенные' }).click()
    await page.getByRole('button', { name: 'Активные' }).click()
    await expect(page.locator('table tbody').getByText(empName)).toBeVisible({ timeout: 5000 })

    // Восстанавливаем
    await page.locator('table tbody').getByText(empName).first().click()
    const dismissedDialog = page.getByRole('dialog')
    await expect(dismissedDialog).toBeVisible()
    await dismissedDialog.getByRole('button', { name: /восстановить/i }).click()
    await expect(dismissedDialog).not.toBeVisible({ timeout: 5000 })

    // Проверяем что снова в активных (только active)
    await page.getByRole('button', { name: 'Фильтры' }).click()
    await page.getByRole('button', { name: 'Активные' }).click()
    await page.getByRole('button', { name: 'Уволенные' }).click()
    await expect(page.locator('table tbody').getByText(empName)).toBeVisible({ timeout: 5000 })

    // Мягкое удаление
    const deleteResp = await page.request.delete(`/api/employees/${employeeId}`, {
      params: { hard: false },
    })
    expect(deleteResp.status()).toBe(204)
  })
})
