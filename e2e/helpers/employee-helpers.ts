import { type Page } from '@playwright/test'
import type { EmployeeTestData } from '../types'

/**
 * Общие хелперы для тестов сотрудников
 * Переиспользуются между employee-create, employee-full-lifecycle и другими
 */

export type { EmployeeTestData } from '../types'

/** Уникальный суффикс для каждого запуска */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Данные сотрудника */
export type EmployeeTestData = {
  name: string
  position: string
  department: string
  gender: string
  birth_date: string
  hire_date: string
  contract_start: string
  contract_end: string
  tab_number: number
  rate: number
  personal_number: string
  insurance_number: string
  passport_number: string
  citizenship: boolean
  residency: boolean
  pensioner: boolean
  payment_form: string
}

/** Генерация тестовых данных сотрудника */
export function makeEmployeeData(): EmployeeTestData {
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

/**
 * Работа с combobox - создание или выбор значения
 */
export async function comboboxCreate(page: Page, label: string, value: string): Promise<void> {
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

    // Ждём пока значение установится
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

/**
 * Поле даты (ДД.ММ.ГГГГ)
 */
export function dateField(page: Page, nth: number) {
  return page.getByRole('textbox', { name: 'ДД.ММ.ГГГГ' }).nth(nth)
}

/**
 * Заполнение input в grid layout
 */
export async function fillGridInput(page: Page, nthChild: number, value: string): Promise<void> {
  const input = page.locator(
    `.grid.grid-cols-3 > div:nth-child(${nthChild}) input`
  ).first()
  await input.fill(value)
}

/**
 * Заполнение всех полей сотрудника в модалке
 */
export async function fillEmployeeForm(page: Page, emp: EmployeeTestData): Promise<void> {
  console.log('[TEST] Заполнение формы сотрудника...')

  // ФИО
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

  console.log('[TEST] Все поля заполнены')
}
