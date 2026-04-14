import { test, expect, type Page } from '@playwright/test'

/** Уникальный суффикс для каждого запуска */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Данные сотрудника */
function makeEmployee() {
  const u = uid()
  return {
    name: `Тест-Сотрудник-${u}`,
    position: `Тест-Должность-${u}`,
    department: `Тест-Отдел-${u}`,
    gender: 'М',
    birth_date: '15.05.1990',
    hire_date: '15.01.2024',
    contract_start: '15.01.2024',
    contract_end: '14.01.2025',
    tab_number: Math.floor(100000 + Math.random() * 900000),
    rate: 25.5,
    personal_number: `ЛН-${u.toUpperCase()}`,
    insurance_number: `СН-${u.toUpperCase()}`,
    passport_number: `AB${Math.floor(1000000 + Math.random() * 9000000)}`,
    citizenship: true,
    residency: true,
    pensioner: false,
    payment_form: 'Повременная',
  }
}

test.describe('Создание сотрудника с уникальными данными', () => {
  test.setTimeout(90000)

  test('создание сотрудника с заполнением всех полей', async ({ page }) => {
    const emp = makeEmployee()
    console.log(`[TEST] Сотрудник: ${emp.name} | должность: ${emp.position} | отдел: ${emp.department}`)

    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /сотрудники/i, level: 1 })).toBeVisible()

    // Открыть модалку
    await page.getByRole('button', { name: /добавить/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Заполняем все поля
    await page.getByRole('textbox').first().fill(emp.name)

    // Пол
    await page.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: 'Мужской' }).click()

    // Дата рождения
    await dateField(page, 0).fill(emp.birth_date)

    // Таб. номер
    await page.getByRole('spinbutton').nth(0).fill(String(emp.tab_number))

    // Должность
    await comboboxCreate(page, 'Должность', emp.position)

    // Подразделение
    await comboboxCreate(page, 'Подразделение', emp.department)

    // Чекбоксы
    await page.getByLabel('Гражданство РБ', { exact: true }).check()
    await page.getByLabel('Резидент РБ', { exact: true }).check()

    // Дата приёма
    await dateField(page, 1).fill(emp.hire_date)

    // Форма оплаты
    await page.getByRole('combobox').filter({ hasText: 'Не указана' }).click()
    await page.getByRole('option', { name: emp.payment_form }).click()

    // Ставка
    await page.getByRole('spinbutton').nth(1).fill(String(emp.rate))

    // Контракт
    await dateField(page, 2).fill(emp.contract_start)
    await dateField(page, 3).fill(emp.contract_end)

    // Личный / страховой / паспорт
    await page.getByRole('textbox').nth(5).fill(emp.personal_number)
    await fillGridInput(page, 2, emp.insurance_number)
    await fillGridInput(page, 3, emp.passport_number)

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

    // Кликаем Создать
    await dialog.getByRole('button', { name: /создать/i }).click()

    // Ждём немного чтобы увидеть что происходит
    await page.waitForTimeout(1000)
    
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

// ============================================================================
// HELPERS
// ============================================================================

async function comboboxCreate(page: Page, label: string, value: string) {
  console.log(`[TEST] comboboxCreate: label="${label}", value="${value}"`)
  
  // Находим combobox по label
  const combo = page.locator(`label:has-text("${label}")`).locator('..').locator('button[role="combobox"]')
  
  await combo.waitFor({ state: 'visible', timeout: 3000 })
  await combo.click()
  console.log(`[TEST] Кликнули по combobox "${label}"`)

  // Ждём появления search input
  const searchInput = page.locator('input[placeholder="Найти или создать..."]').first()
  await searchInput.waitFor({ state: 'visible', timeout: 3000 })
  console.log(`[TEST] Search input найден, заполняем "${value}"`)
  await searchInput.fill(value)
  await page.waitForTimeout(300)

  // Кнопка "Создать «X»" — ищем внутри popover
  const createBtn = page.getByText(`Создать «${value}»`).first()
  const isCreateVisible = await createBtn.isVisible({ timeout: 1000 }).catch(() => false)
  if (isCreateVisible) {
    console.log(`[TEST] Кнопка "Создать" найдена, кликаем`)
    
    // Перехватываем ответ API
    let apiResponse: { status: number; body: string } | null = null
    const responsePromise = page.waitForResponse(async (resp) => {
      const url = resp.url()
      if ((url.includes('/api/positions') || url.includes('/api/departments')) && resp.request().method() === 'POST') {
        apiResponse = {
          status: resp.status(),
          body: await resp.text().catch(() => '')
        }
        console.log(`[TEST] API Response: ${apiResponse.status} ${apiResponse.body}`)
        return true
      }
      return false
    }).catch(() => null)
    
    await createBtn.click()
    
    // Ждём ответ API
    await responsePromise
    console.log(`[TEST] API call completed`)
    
    // Ждём пока значение установится - проверяем что кнопка показывает выбранное значение
    const selectedBtn = page.locator(`label:has-text("${label}")`).locator('..').locator('button').filter({ hasText: value })
    await selectedBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(async () => {
      console.log(`[TEST] Значение не установлено! Делаем скриншот...`)
      await page.screenshot({ path: `test-results/combobox-${label}.png` })
      throw new Error(`Значение "${value}" не установлено для ${label}. API: ${apiResponse?.status} ${apiResponse?.body}`)
    })
    console.log(`[TEST] Значение "${value}" установлено`)
    return
  }

  // Существующая опция — button внутри popover
  const allBtns = page.locator('button').filter({ hasText: new RegExp(`^${value}$`) })
  const count = await allBtns.count()
  if (count > 0) {
    console.log(`[TEST] Существующая опция найдена, кликаем`)
    await allBtns.first().click()
    await page.waitForTimeout(500)
    return
  }

  // Fallback: Enter
  console.log(`[TEST] Fallback: Enter`)
  await searchInput.press('Enter')
  await page.waitForTimeout(500)
}

function dateField(page: Page, nth: number) {
  return page.getByRole('textbox', { name: 'ДД.ММ.ГГГГ' }).nth(nth)
}

async function fillGridInput(page: Page, nthChild: number, value: string) {
  const input = page.locator(
    `.grid.grid-cols-3 > div:nth-child(${nthChild}) input`
  ).first()
  await input.fill(value)
}
