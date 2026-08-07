import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object: /orders — create form + list.
 * Create flow opens OnlyOffice draft in a popup (window.open).
 */
export class OrdersPage {
  readonly page: Page
  readonly heading: Locator
  readonly createSectionTitle: Locator
  readonly employeeSearch: Locator
  readonly orderTypeInput: Locator
  readonly createOrderButton: Locator
  readonly orderNumberInput: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: /^Приказы$/, level: 1 })
    this.createSectionTitle = page.getByRole('heading', { name: 'Создать приказ' })
    // EmployeeSearch in create form (first "Поиск по ФИО..." in create section)
    this.employeeSearch = page.getByPlaceholder('Поиск по ФИО...').first()
    this.orderTypeInput = page.getByPlaceholder('Выберите тип...')
    this.createOrderButton = page.getByRole('button', { name: 'Создать приказ' }).first()
    // Order number field — label nearby
    this.orderNumberInput = page
      .locator('label')
      .filter({ hasText: /номер/i })
      .locator('..')
      .locator('input')
      .first()
  }

  async goto() {
    await this.page.goto('/orders')
    await expect(this.heading).toBeVisible({ timeout: 20_000 })
  }

  /** Create form is open if type field or employee search/chip is visible */
  async ensureCreateFormOpen() {
    await expect(this.createSectionTitle).toBeVisible({ timeout: 10_000 })
    const typeLabel = this.page.locator('label').filter({ hasText: 'Тип приказа' })
    const open =
      (await typeLabel.isVisible().catch(() => false)) ||
      (await this.employeeSearch.isVisible().catch(() => false)) ||
      (await this.page.getByText(/таб\./i).first().isVisible().catch(() => false))
    if (!open) {
      await this.createSectionTitle.click()
      await expect(typeLabel.or(this.employeeSearch).first()).toBeVisible({ timeout: 8_000 })
    }
  }

  async selectEmployeeByName(name: string) {
    await this.ensureCreateFormOpen()
    // Already selected?
    if (await this.page.getByText(name, { exact: false }).first().isVisible().catch(() => false)) {
      const chip = this.page.locator('div').filter({ hasText: name }).filter({ hasText: /таб\./ }).first()
      if (await chip.isVisible().catch(() => false)) return
    }
    await expect(this.employeeSearch).toBeVisible({ timeout: 10_000 })
    await this.employeeSearch.click()
    await this.employeeSearch.fill(name)
    const option = this.page.locator('button').filter({ hasText: name }).first()
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()
    await expect(this.page.getByText(name, { exact: false }).first()).toBeVisible({
      timeout: 5_000,
    })
  }

  async selectOrderTypeByName(typeName: string) {
    await this.ensureCreateFormOpen()
    const typeBlock = this.page.locator('label').filter({ hasText: 'Тип приказа' }).locator('..')
    const already = await typeBlock.getByText(typeName, { exact: true }).isVisible().catch(() => false)
    if (already) return

    // Clear previous selection if chip shown
    if (!(await this.orderTypeInput.isVisible().catch(() => false))) {
      await typeBlock.locator('button').last().click().catch(() => {})
      await expect(this.orderTypeInput).toBeVisible({ timeout: 5_000 })
    }

    await this.orderTypeInput.click()
    await this.orderTypeInput.fill(typeName)
    // Точное совпадение по имени типа: «Перевод» не должен зацепить
    // «О временном переводе работников…» (подстрока) при поиске.
    const typeOption = this.page
      .getByRole('button', { name: typeName, exact: true })
      .first()
    await expect(typeOption).toBeVisible({ timeout: 8_000 })
    await typeOption.click()
    await expect(typeBlock.getByText(typeName, { exact: true })).toBeVisible({ timeout: 5_000 })
  }

  async fillOrderNumber(num: string) {
    // DocumentNumberField / OrderNumberField — text input near "№" or "Номер"
    const createCard = this.createSectionTitle.locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    const candidates = [
      this.page.getByLabel(/номер приказа/i),
      this.page.locator('input[inputmode="numeric"]').first(),
      createCard.locator('input[type="text"]').filter({ hasNot: this.page.locator('[placeholder="Выберите тип..."]') }),
    ]
    for (const loc of candidates) {
      const el = loc.first()
      if (await el.isVisible().catch(() => false)) {
        await el.fill(num)
        await el.blur()
        return
      }
    }
    // Last resort: third text-like input in create card (after employee/date)
    const inputs = createCard.locator('input:not([type="hidden"]):not([type="date"])')
    const n = await inputs.count()
    if (n >= 1) {
      // Prefer input that currently holds a short numeric suggestion
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i)
        const ph = (await el.getAttribute('placeholder')) || ''
        if (ph.includes('Выберите') || ph.includes('ФИО')) continue
        const type = await el.getAttribute('type')
        if (type === 'date') continue
        await el.fill(num)
        await el.blur()
        return
      }
    }
    throw new Error('Order number input not found')
  }

  /**
   * Fill extra field on create form by accessible label (DatePicker / text / number).
   * Date values: DD.MM.YYYY (DatePicker display mask).
   */
  async fillExtraFieldByLabel(label: string | RegExp, value: string) {
    const input = this.page.getByLabel(label).first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.click()
    await input.fill(value)
    await input.blur()
  }

  /**
   * Confirm dismissal dialog after «Создать приказ» for type «Увольнение».
   * Title: «Уволить сотрудника?» → action «Уволить» (opens draft popup).
   */
  async confirmDismissalDialog() {
    const title = this.page.getByRole('heading', { name: /Уволить сотрудника\?/ })
    await expect(title).toBeVisible({ timeout: 10_000 })
    const dialog = this.page.getByRole('alertdialog').filter({ has: title })
    const confirmBtn = dialog
      .getByRole('button', { name: 'Уволить', exact: true })
      .or(this.page.getByRole('button', { name: 'Уволить', exact: true }))
    await confirmBtn.first().click()
  }

  /**
   * Tab «По основной деятельности» + expand create form if collapsed.
   */
  async switchToGeneralTab() {
    const tab = this.page.getByRole('button', { name: 'По основной деятельности' })
    await expect(tab).toBeVisible({ timeout: 10_000 })
    await tab.click()
    await this.ensureGeneralCreateFormOpen()
  }

  /**
   * Ensure general create form is expanded (h2 + number field visible).
   */
  async ensureGeneralCreateFormOpen() {
    const title = this.page.getByRole('heading', {
      name: /Создать приказ по основной деятельности/,
    })
    await expect(title).toBeVisible({ timeout: 10_000 })
    const numberField = this.page.getByLabel(/номер приказа/i).first()
    if (!(await numberField.isVisible().catch(() => false))) {
      await title.click()
      await expect(numberField).toBeVisible({ timeout: 8_000 })
    }
  }

  /**
   * Click create → wait for OnlyOffice draft popup.
   */
  async createOrderOpenEditor(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup', { timeout: 60_000 })
    await this.createOrderButton.click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    await popup.waitForURL(/\/drafts\/[^/]+\/edit-docx/, { timeout: 60_000 })
    return popup
  }

  /**
   * Open existing-order DOCX editor from list action «Редактировать DOCX».
   * Matches row by order number or employee name substring.
   */
  async openEditDocxForOrder(orderNumberOrEmployeeName: string): Promise<Page> {
    // Apply order-number filter only for short codes (not employee FIO).
    // Scope to «Фильтры» so we do not fill the create-form «Номер приказа».
    const looksLikeOrderNumber =
      orderNumberOrEmployeeName.length <= 24 &&
      /^[\dA-Za-zА-Яа-яЁё\-./]+$/u.test(orderNumberOrEmployeeName)
    if (looksLikeOrderNumber) {
      const filtersHeading = this.page.locator('h2').filter({ hasText: 'Фильтры' })
      if (await filtersHeading.isVisible().catch(() => false)) {
        // Expand collapsed filters panel
        const filterPanel = filtersHeading.locator('xpath=ancestor::div[contains(@class,"rounded") or contains(@class,"border")][1]')
        let numberLabel = filterPanel.locator('label').filter({ hasText: /Номер приказа/i })
        if (!(await numberLabel.isVisible().catch(() => false))) {
          await filtersHeading.click().catch(() => {})
          numberLabel = filterPanel.locator('label').filter({ hasText: /Номер приказа/i })
        }
        // Fallback: last «Номер приказа» on page is usually the filter (create form is first)
        if (!(await numberLabel.isVisible().catch(() => false))) {
          numberLabel = this.page.locator('label').filter({ hasText: /Номер приказа/i }).last()
        }
        if (await numberLabel.isVisible().catch(() => false)) {
          const numInput = numberLabel.locator('..').locator('input').first()
          if (await numInput.isVisible().catch(() => false)) {
            await numInput.fill(orderNumberOrEmployeeName)
            await this.page.keyboard.press('Enter').catch(() => {})
            await this.page
              .waitForResponse(
                (r) => r.url().includes('/api/orders') && r.request().method() === 'GET' && r.ok(),
                { timeout: 15_000 }
              )
              .catch(() => {})
            // debounce filterOrderNumber (300ms) + list render
            await this.page.waitForTimeout(500)
          }
        }
      }
    }

    const row = this.page
      .locator('tr')
      .filter({ hasText: orderNumberOrEmployeeName })
      .first()
    await expect(row).toBeVisible({ timeout: 20_000 })

    const editBtn = row.getByRole('button', { name: /Редактировать DOCX/i })
    await expect(editBtn).toBeVisible({ timeout: 10_000 })

    const popupPromise = this.page.waitForEvent('popup', { timeout: 60_000 })
    await editBtn.click()
    const popup = await popupPromise
    // Attach config wait immediately to avoid race with early GET
    const configPromise = popup.waitForResponse(
      (r) =>
        r.url().includes('/onlyoffice/config') &&
        r.url().includes('/orders/') &&
        !r.url().includes('/drafts/') &&
        r.request().method() === 'GET' &&
        r.ok(),
      { timeout: 60_000 }
    )
    await popup.waitForLoadState('domcontentloaded')
    await popup.waitForURL(/\/orders\/\d+\/edit-docx/, { timeout: 60_000 })
    await configPromise
    return popup
  }
}
