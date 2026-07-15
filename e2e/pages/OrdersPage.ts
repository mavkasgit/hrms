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
    const typeOption = this.page.locator('button').filter({ hasText: typeName }).first()
    await expect(typeOption).toBeVisible({ timeout: 8_000 })
    await typeOption.click()
    await expect(typeBlock.getByText(typeName)).toBeVisible({ timeout: 5_000 })
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
   * Click create → wait for OnlyOffice draft popup.
   */
  async createOrderOpenEditor(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup', { timeout: 60_000 })
    await this.createOrderButton.click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    await popup.waitForURL(/\/orders\/drafts\/[^/]+\/edit-docx/, { timeout: 60_000 })
    return popup
  }
}
