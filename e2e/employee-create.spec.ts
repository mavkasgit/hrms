import { test, expect } from '@playwright/test'
import { makeEmployeeData, fillEmployeeForm } from './helpers/employee-helpers'

/**
 * Тест создания сотрудника с заполнением всех полей
 * Использует общие хелперы для переиспользования кода
 */
test.describe('Создание сотрудника с уникальными данными', () => {
  test.setTimeout(90000)

  test('создание сотрудника с заполнением всех полей', async ({ page }) => {
    const emp = makeEmployeeData()
    console.log(`[TEST] Сотрудник: ${emp.name} | должность: ${emp.position} | отдел: ${emp.department}`)

    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /сотрудники/i, level: 1 })).toBeVisible()

    // Открыть модалку
    await page.getByRole('button', { name: /добавить/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Заполняем все поля через общий хелпер
    await fillEmployeeForm(page, emp)

    // Debug: скриншот перед сохранением
    await page.screenshot({ path: 'test-results/before-submit.png' })

    console.log('[TEST] Все поля заполнены, нажимаем Создать...')

    // Отслеживаем запросы к API
    let apiStatus = 0
    let apiBody = ''
    let employeeApiUrl = ''
    page.on('request', (req) => {
      if (req.url().includes('/api/employees') && req.method() === 'POST') {
        employeeApiUrl = req.url()
        console.log(`[TEST] API Request: ${req.url()}`)
        console.log(`[TEST] Request Body: ${req.postData()}`)
      }
    })
    page.on('response', async (resp) => {
      if (resp.url().includes('/api/employees') && resp.request().method() === 'POST') {
        apiStatus = resp.status()
        try {
          apiBody = await resp.text()
          console.log(`[TEST] API Response Status: ${apiStatus}`)
          console.log(`[TEST] API Response Body: ${apiBody}`)
        } catch (e) {
          console.log(`[TEST] API Response Status: ${apiStatus} (could not read body)`)
        }
      }
    })

    const createResponse = page.waitForResponse((resp) => {
      return resp.url().includes('/api/employees')
        && resp.request().method() === 'POST'
        && resp.status() >= 200
        && resp.status() < 500
    })

    // Кликаем Создать
    await dialog.getByRole('button', { name: /создать/i }).click()
    await createResponse

    // Проверяем нет ли ошибок валидации
    const hasErrors = await page.locator('text=Обязательно, обязательна').count()
    if (hasErrors > 0) {
      const errorTexts = await page.locator('text=Обязательно, обязательна').allTextContents()
      console.error(`[TEST] Ошибки валидации: ${errorTexts.join(', ')}`)
    }

    // Ждём закрытия модалки с увеличенным таймаутом
    await expect(dialog).not.toBeVisible({ timeout: 10000 }).catch(async () => {
      console.log('[TEST] Модалка не закрылась за 10 секунд, проверяем состояние...')
      const isDialogVisible = await dialog.isVisible()
      console.log(`[TEST] Dialog visible: ${isDialogVisible}`)

      // Проверяем консоль браузера на ошибки
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      // Делаем скриншот
      await page.screenshot({ path: 'test-results/dialog-not-closed.png' })
      throw new Error(`Диалог не закрылся. Ошибки консоли: ${consoleErrors.slice(0, 5).join(' | ')}`)
    })

    // Проверяем что модалка закрылась
    const isClosed = await dialog.isHidden()
    if (!isClosed) {
      // Модалка не закрылась — ищем ошибки валидации
      const errorTexts = await page.locator('text=Обязательно').allTextContents()
      const errorTexts2 = await page.locator('text=обязательна').allTextContents()
      console.error(`[TEST] Модалка НЕ закрылась! Ошибки: ${[...errorTexts, ...errorTexts2].join(', ')}`)
    }

    expect(isClosed, 'Диалог должен закрыться после создания сотрудника').toBe(true)

    // Сотрудник появился в таблице (быстрая проверка)
    await expect(page.getByText(emp.name)).toBeVisible({ timeout: 3000 })
    console.log(`[TEST] ✅ Сотрудник "${emp.name}" создан (таб. №${emp.tab_number})`)

    // Открываем на редактирование
    await page.getByText(emp.name).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()

    await expect(page.getByRole('textbox').first()).toHaveValue(emp.name)
    await expect(page.getByRole('spinbutton').nth(0)).toHaveValue(String(emp.tab_number))

    console.log('[TEST] ✅ Поля верифицированы')

    await page.keyboard.press('Escape')
  })
})
