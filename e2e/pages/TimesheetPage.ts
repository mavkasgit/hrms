import { type Locator, type Page, expect } from '@playwright/test'

/**
 * POM: /timesheet — shell, mode tabs, import, history, legend,
 * и Excel-подобная сетка (react-datasheet-grid).
 */
export class TimesheetPage {
  readonly page: Page
  readonly heading: Locator
  readonly planTab: Locator
  readonly factTab: Locator
  readonly mergedTab: Locator
  readonly importButton: Locator
  /** Сетка табеля (react-datasheet-grid, div-based, не <table>) */
  readonly grid: Locator
  /** Оверлей активной ячейки (dsg-active-cell) */
  readonly activeCellOverlay: Locator
  /** Поле поиска по ФИО (фильтрует строки сетки) */
  readonly searchInput: Locator
  /** Плавающая панель массового заполнения выделения */
  readonly fillToolbar: Locator
  /** Select выбора смены на панели массового заполнения */
  readonly fillSelect: Locator
  /** Плавающая панель «принять приказ» (order_changed) */
  readonly acceptOrdersToolbar: Locator
  /** Глобальная кнопка «Принять приказы» */
  readonly acceptOrdersGlobal: Locator
  /** Уголок-протяжка (#25) */
  readonly fillHandle: Locator
  /** Кнопка «Заполнить по турникету» (#16) */
  readonly autofillButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', {
      name: 'Табель учёта рабочего времени',
    })
    this.planTab = page.getByRole('button', { name: 'План', exact: true })
    this.factTab = page.getByRole('button', { name: 'Факт', exact: true })
    this.mergedTab = page.getByRole('button', { name: 'Совмещённый', exact: true })
    this.importButton = page.getByTestId('timesheet-import-button')
    this.grid = page.getByTestId('timesheet-grid')
    this.activeCellOverlay = page.locator('.dsg-active-cell')
    this.searchInput = page.getByPlaceholder('Поиск по ФИО…')
    this.fillToolbar = page.getByTestId('timesheet-fill-toolbar')
    this.fillSelect = page.getByTestId('timesheet-fill-select')
    this.acceptOrdersToolbar = page.getByTestId('accept-orders-toolbar')
    this.acceptOrdersGlobal = page.getByTestId('accept-orders-global')
    this.fillHandle = page.getByTestId('timesheet-fill-handle')
    this.autofillButton = page.getByTestId('timesheet-autofill-button')
  }

  async goto() {
    await this.page.goto('/timesheet')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  async expectSidebarLink() {
    await this.page.goto('/')
    await expect(this.page.getByRole('link', { name: 'Табель учёта' })).toBeVisible({
      timeout: 15_000,
    })
  }

  async switchModeTabs() {
    await expect(this.planTab).toBeVisible({ timeout: 15_000 })
    await expect(this.factTab).toBeVisible()
    await expect(this.mergedTab).toBeVisible()
    await this.factTab.click()
    await expect(this.factTab).toHaveClass(/shadow-sm|bg-background/)
    await this.mergedTab.click()
    await expect(this.mergedTab).toHaveClass(/shadow-sm|bg-background/)
    await this.planTab.click()
    await expect(this.planTab).toHaveClass(/shadow-sm|bg-background/)
  }

  async openImportModal() {
    await this.importButton.click()
    await expect(this.page.getByText('Импорт журнала турникетов')).toBeVisible({
      timeout: 10_000,
    })
    await expect(this.page.getByText('Нажмите для выбора .xlsx файла')).toBeVisible()
  }

  async openImportHistory() {
    await this.page.getByRole('button', { name: 'История импортов' }).click()
    await expect(this.page.getByText('История импортов').first()).toBeVisible({
      timeout: 10_000,
    })
  }

  async navigateMonth() {
    const prev = this.page.getByRole('button', { name: /предыдущ|назад|prev/i }).first()
    const next = this.page.getByRole('button', { name: /следующ|вперёд|next/i }).first()
    if (await prev.isVisible().catch(() => false)) {
      await prev.click()
    } else if (await next.isVisible().catch(() => false)) {
      await next.click()
    } else {
      const iconNav = this.page.locator('button').filter({ has: this.page.locator('svg') }).first()
      await iconNav.click()
    }
    await expect(this.page.getByRole('heading', { name: /Табель учёта/i })).toBeVisible()
  }

  async expectLegend() {
    // Легенда сворачиваемая — раскрываем по клику перед проверкой
    const legendButton = this.page.getByRole('button', { name: 'Легенда' })
    if (await legendButton.isVisible().catch(() => false)) {
      await legendButton.click()
    }
    await expect(this.page.getByText('Расхождение плана и факта').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(this.page.getByText('Выходной (Сб/Вс)').first()).toBeVisible()
    await expect(this.page.getByText('Праздничный день').first()).toBeVisible()
    await expect(this.page.getByText('Нерабочие статусы:').first()).toBeVisible()
    await expect(this.page.getByText('Отпуск').first()).toBeVisible()
    await expect(this.page.getByText('Больничный').first()).toBeVisible()
  }

  /** Сетка табеля видима (div-based react-datasheet-grid) */
  async expectGridVisible() {
    await expect(this.grid).toBeVisible({ timeout: 15_000 })
  }

  // =========================================================================
  // Grid cell helpers (react-datasheet-grid DOM)
  // =========================================================================

  /**
   * Locator ячейки по дате и employee_id.
   * Использует data-атрибуты на контенте ячейки (TimesheetDayCell).
   */
  cell(date: string, employeeId: number): Locator {
    return this.grid.locator(`[data-date="${date}"][data-employee-id="${employeeId}"]`)
  }

  /** Клик по ячейке — делает её активной */
  async clickCell(date: string, employeeId: number) {
    const cell = this.cell(date, employeeId)
    await cell.click()
    await expect(this.activeCellOverlay).toBeVisible({ timeout: 5_000 })
  }

  /**
   * Inline-редактор (select) виден после двойного клика / Enter на ячейке.
   */
  async openCellEditor(date: string, employeeId: number) {
    await this.clickCell(date, employeeId)
    await this.page.keyboard.press('Enter')
    await expect(this.grid.locator('select')).toBeVisible({ timeout: 5_000 })
  }

  /**
   * Выбор значения в inline-редакторе (select) по видимому тексту.
   */
  async selectShiftInEditor(label: string) {
    const select = this.grid.locator('select')
    await select.selectOption({ label })
  }

  /**
   * Нажатие Delete на активной ячейке (сброс ручного значения).
   */
  async pressDeleteOnActiveCell() {
    await this.page.keyboard.press('Delete')
  }

  /**
   * Текст ячейки (содержимое data-date элемента).
   */
  async getCellText(date: string, employeeId: number): Promise<string> {
    const cell = this.cell(date, employeeId)
    return (await cell.textContent()) ?? ''
  }

  /**
   * Поиск по ФИО — фильтрует строки сетки (живой фильтр).
   */
  async searchEmployees(query: string) {
    await this.searchInput.fill(query)
  }

  /**
   * Кнопка «принять приказ» конкретного сотрудника (в левой панели).
   */
  acceptOrdersForEmployee(employeeId: number): Locator {
    return this.page.locator(
      `[data-testid="accept-orders-employee"][data-employee-id="${employeeId}"]`
    )
  }

  /**
   * Выделение прямоугольника протяжкой с клавиатуры: клик по якорной ячейке,
   * затем Shift+стрелки вправо/вниз. Библиотека рисует оверлей выделения сама.
   */
  async selectRectangle(opts: {
    anchorDate: string
    anchorEmployeeId: number
    shiftRight?: number
    shiftDown?: number
  }) {
    await this.clickCell(opts.anchorDate, opts.anchorEmployeeId)
    for (let i = 0; i < (opts.shiftRight ?? 0); i++) {
      await this.page.keyboard.press('Shift+ArrowRight')
      await this.page.waitForTimeout(120)
    }
    for (let i = 0; i < (opts.shiftDown ?? 0); i++) {
      await this.page.keyboard.press('Shift+ArrowDown')
      await this.page.waitForTimeout(120)
    }
  }
}

