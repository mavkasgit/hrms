import { test, expect, type Page } from '@playwright/test'

/** Уникальный суффикс */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Помощник для создания combobox значений */
async function comboboxCreate(page: Page, label: string, value: string) {
  const combo = page.locator(`label:has-text("${label}")`).locator('..').locator('button[role="combobox"]')
  await combo.waitFor({ state: 'visible', timeout: 3000 })
  await combo.click()

  const searchInput = page.locator('input[placeholder="Найти или создать..."]').first()
  await searchInput.waitFor({ state: 'visible', timeout: 3000 })
  await searchInput.fill(value)
  await page.waitForTimeout(200)

  const createBtn = page.getByText(`Создать «${value}»`).first()
  const isCreateVisible = await createBtn.isVisible({ timeout: 1000 }).catch(() => false)
  if (isCreateVisible) {
    await createBtn.click()
    const selectedBtn = page.locator(`label:has-text("${label}")`).locator('..').locator('button').filter({ hasText: value })
    await selectedBtn.waitFor({ state: 'visible', timeout: 5000 })
    return
  }

  const allBtns = page.locator('button').filter({ hasText: new RegExp(`^${value}$`) })
  const count = await allBtns.count()
  if (count > 0) {
    await allBtns.first().click()
    await page.waitForTimeout(300)
    return
  }

  await searchInput.press('Enter')
  await page.waitForTimeout(300)
}

function dateField(page: Page, nth: number) {
  return page.getByRole('textbox', { name: 'ДД.ММ.ГГГГ' }).nth(nth)
}

async function fillGridInput(page: Page, nthChild: number, value: string) {
  const input = page.locator(`.grid.grid-cols-3 > div:nth-child(${nthChild}) input`).first()
  await input.fill(value)
}

test.describe('Полный цикл сотрудника', () => {
  test.setTimeout(120000)

  test('создание → архивация → восстановление → удаление', async ({ page }) => {
    const u = uid()
    const empName = `Цикл-Тест-${u}`
    const empPosition = `Цикл-Должность-${u}`
    const empDepartment = `Цикл-Отдел-${u}`

    console.log(`[TEST] Сотрудник: ${empName}`)

    // ========== 1. СОЗДАНИЕ ==========
    console.log('[TEST] === ЭТАП 1: Создание сотрудника ===')
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: /сотрудники/i, level: 1 })).toBeVisible()

    // Открыть модалку
    await page.getByRole('button', { name: /добавить/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Заполняем все поля
    await page.getByRole('textbox').first().fill(empName)

    // Пол
    await page.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: 'Мужской' }).click()

    // Дата рождения
    await dateField(page, 0).fill('15.05.1990')

    // Таб. номер (уникальный)
    const tabNumber = Math.floor(100000 + Math.random() * 900000)
    await page.getByRole('spinbutton').nth(0).fill(String(tabNumber))

    // Должность
    await comboboxCreate(page, 'Должность', empPosition)

    // Подразделение
    await comboboxCreate(page, 'Подразделение', empDepartment)

    // Чекбоксы
    await page.getByLabel('Гражданство РБ', { exact: true }).check()
    await page.getByLabel('Резидент РБ', { exact: true }).check()

    // Дата приёма
    await dateField(page, 1).fill('15.01.2024')

    // Форма оплаты
    await page.getByRole('combobox').filter({ hasText: 'Не указана' }).click()
    await page.getByRole('option', { name: 'Повременная' }).click()

    // Ставка
    await page.getByRole('spinbutton').nth(1).fill('25.5')

    // Контракт
    await dateField(page, 2).fill('15.01.2024')
    await dateField(page, 3).fill('14.01.2025')

    // Личный / страховой / паспорт
    await page.getByRole('textbox').nth(5).fill(`ЛН-${u.toUpperCase()}`)
    await fillGridInput(page, 2, `СН-${u.toUpperCase()}`)
    await fillGridInput(page, 3, `AB${Math.floor(1000000 + Math.random() * 9000000)}`)

    // Кликаем Создать
    console.log('[TEST] Кликаем кнопку Создать...')
    
    // Слушаем ответ API
    page.on('response', async (resp) => {
      if (resp.url().includes('/api/employees') && resp.request().method() === 'POST') {
        const status = resp.status()
        const body = await resp.text().catch(() => '')
        console.log(`[TEST] API Response: ${status} - ${body}`)
      }
    })
    page.on('console', msg => {
      console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`)
    })

    await dialog.getByRole('button', { name: /создать/i }).click()

    // Ждём закрытия модалки
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Сотрудник появился в таблице
    await expect(page.getByText(empName)).toBeVisible({ timeout: 5000 })
    console.log(`[TEST] ✅ Сотрудник "${empName}" создан`)

    // ========== 2. АРХИВАЦИЯ ==========
    console.log('[TEST] === ЭТАП 2: Архивация ===')
    await page.getByText(empName).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()

    await editDialog.getByRole('button', { name: /уволить.*архив/i }).click()
    const archiveDialog = page.getByRole('alertdialog')
    await expect(archiveDialog).toBeVisible()
    await archiveDialog.getByRole('button', { name: /уволить/i }).click()
    await expect(archiveDialog).not.toBeVisible({ timeout: 5000 })
    await expect(editDialog).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('table tbody').getByText(empName)).not.toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Фильтры' }).click()
    await page.getByText('В архиве').click()
    await page.waitForTimeout(500)
    await expect(page.locator('table tbody').getByText(empName)).toBeVisible({ timeout: 5000 })
    console.log(`[TEST] ✅ Сотрудник "${empName}" архивирован`)

    // ========== 3. ВОССТАНОВЛЕНИЕ ==========
    console.log('[TEST] === ЭТАП 3: Восстановление ===')
    await page.locator('table tbody').getByText(empName).first().click()
    const archivedDialog = page.getByRole('dialog')
    await expect(archivedDialog).toBeVisible()
    await expect(archivedDialog.getByText(/в архиве/i)).toBeVisible()

    // Кнопка "Восстановить"
    await archivedDialog.getByRole('button', { name: /восстановить/i }).click()
    await expect(archivedDialog).not.toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Фильтры' }).click()
    await page.getByText('Активные').click()
    await page.waitForTimeout(500)
    await expect(page.locator('table tbody').getByText(empName)).toBeVisible({ timeout: 5000 })
    console.log(`[TEST] ✅ Сотрудник "${empName}" восстановлен`)

    // ========== 4. УДАЛЕНИЕ (soft delete) ==========
    console.log('[TEST] === ЭТАП 4: Удаление ===')
    // Получаем ID через API
    const searchResp = await page.request.get(`/api/employees`, {
      params: { q: empName, page: 1, per_page: 1 }
    })
    const searchData = await searchResp.json()
    const employeeId = searchData.items[0]?.id
    expect(employeeId).toBeTruthy()

    const deleteResp = await page.request.delete(`/api/employees/${employeeId}`, {
      params: { hard: false }
    })
    expect(deleteResp.status()).toBe(204)

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('table tbody').getByText(empName)).not.toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Фильтры' }).click()
    await page.getByText('Удалённые').click()
    await page.waitForTimeout(500)
    await expect(page.locator('table tbody').getByText(empName)).toBeVisible({ timeout: 5000 })
    console.log(`[TEST] ✅ Сотрудник "${empName}" удалён`)

    console.log(`[TEST] 🎉 Полный цикл завершён успешно!`)
  })
})
