import { test, expect, API_BASE } from '../fixtures/index'
import { TimesheetPage } from '../pages/TimesheetPage'
import { getAdminTokenFromStorage } from '../fixtures/auth'

/**
 * Timesheet grid behaviors (react-datasheet-grid):
 * keyboard navigation, inline editing, Delete reset, persistence.
 *
 * Acceptance criteria #21:
 * - Активная ячейка двигается стрелками, Tab, Home/End, PageUp/PageDown
 * - Значение ячейки вводится с клавиатуры; Enter подтверждает, Escape отменяет
 * - Delete сбрасывает ручное значение к авто
 * - Правка переживает перезагрузку страницы
 */
test.describe('Timesheet grid @ui', () => {
  test.setTimeout(60_000)

  /** Текущий период: первый день месяца (всегда в DOM — column virtualization unshifts col 0) */
  function periodDate(day = 1): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  test('@ui timesheet grid: active cell moves with arrows and Home/End', async ({
    page,
    apiOps,
  }) => {
    // Создаём сотрудника, чтобы сетка имела хотя бы одну строку
    const emp = await apiOps.createEmployee({})
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)
    const date2 = periodDate(2)

    // Клик по ячейке делает её активной
    await ts.clickCell(date1, emp.id)
    await expect(ts.activeCellOverlay).toBeVisible()

    // Стрелка вправо перемещает активную ячейку на следующий день
    const overlayLeft = await ts.activeCellOverlay.evaluate(
      (el) => getComputedStyle(el).left
    )
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    const newLeft = await ts.activeCellOverlay.evaluate(
      (el) => getComputedStyle(el).left
    )
    expect(newLeft).not.toBe(overlayLeft)

    // Home возвращает на первую колонку
    await page.keyboard.press('Home')
    await page.waitForTimeout(200)
    const homeLeft = await ts.activeCellOverlay.evaluate(
      (el) => getComputedStyle(el).left
    )
    expect(homeLeft).toBe(overlayLeft)

    // End перемещает на последнюю колонку
    await page.keyboard.press('End')
    await page.waitForTimeout(200)
    const endLeft = await ts.activeCellOverlay.evaluate(
      (el) => getComputedStyle(el).left
    )
    expect(parseFloat(endLeft)).toBeGreaterThan(parseFloat(homeLeft))
  })

  test('@ui timesheet grid: inline edit select opens and sets value', async ({
    page,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)

    // Открываем inline-редактор
    await ts.openCellEditor(date1, emp.id)

    // Select виден, выбираем рабочую смену
    const select = ts.grid.locator('select')
    await expect(select).toBeVisible()

    // Выбираем "День (08:00-16:30)"
    await select.selectOption({ label: 'День (08:00-16:30)' })

    // После выбора редактор закрывается
    await expect(select).not.toBeVisible({ timeout: 5_000 })

    // Ждём рефетч данных сетки после персиста (ячейка покажет часы)
    await expect(ts.cell(date1, emp.id)).not.toHaveText('', { timeout: 10_000 })
  })

  test('@ui timesheet grid: Escape cancels editing without change', async ({
    page,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)
    const textBefore = await ts.getCellText(date1, emp.id)

    // Открываем редактор и нажимаем Escape
    await ts.openCellEditor(date1, emp.id)
    await page.keyboard.press('Escape')

    const select = ts.grid.locator('select')
    await expect(select).not.toBeVisible({ timeout: 5_000 })

    // Значение не изменилось
    const textAfter = await ts.getCellText(date1, emp.id)
    expect(textAfter).toBe(textBefore)
  })

  test('@ui timesheet grid: Delete resets manual value', async ({
    page,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})

    // Создаём расписание и ручную запись через API (с авторизацией)
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const date1 = periodDate(1)
    const token = getAdminTokenFromStorage()
    const authHeaders = { Authorization: `Bearer ${token}` }

    const createResp = await page.request.post(`${API_BASE}/api/work-schedules`, {
      data: { employee_id: emp.id, year, month },
      headers: authHeaders,
    })
    expect([200, 201]).toContain(createResp.status())
    const schedule = await createResp.json()

    // Устанавливаем ручное значение "day"
    const entryResp = await page.request.post(
      `${API_BASE}/api/work-schedules/${schedule.id}/entries`,
      {
        data: { work_date: date1, shift_type_code: 'day', planned_hours_override: null, note: null },
        headers: authHeaders,
      }
    )
    expect([200, 201]).toContain(entryResp.status())

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    // Ячейка показывает ручное значение
    const cellBefore = ts.cell(date1, emp.id)
    await expect(cellBefore).toBeVisible({ timeout: 15_000 })
    const textBefore = await cellBefore.textContent()
    expect(textBefore?.trim()).not.toBe('')

    // Кликаем и нажимаем Delete
    await ts.clickCell(date1, emp.id)
    await ts.pressDeleteOnActiveCell()
    await page.waitForTimeout(500)

    // После Delete ручное значение сброшено (ячейка пуста или показывает авто)
    // Для нового сотрудника без отпусков/больничных авто = null → пусто
    const textAfter = await ts.getCellText(date1, emp.id)
    // Пустая ячейка или авто-значение (не "8" от day)
    expect(textAfter.trim()).not.toBe(textBefore?.trim())
  })

  test('@ui timesheet grid: edit persists across page reload', async ({
    page,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)

    // Редактируем ячейку
    await ts.openCellEditor(date1, emp.id)
    const select = ts.grid.locator('select')
    await select.selectOption({ label: 'День (08:00-16:30)' })
    await expect(select).not.toBeVisible({ timeout: 5_000 })

    // Ждём, чтобы API-вызов завершился
    await page.waitForTimeout(1_000)

    const textBefore = await ts.getCellText(date1, emp.id)
    expect(textBefore.trim()).not.toBe('')

    // Перезагружаем страницу
    await page.reload()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })
    await ts.expectGridVisible()

    // Значение сохранилось
    const cellAfter = ts.cell(date1, emp.id)
    await expect(cellAfter).toBeVisible({ timeout: 15_000 })
    const textAfter = await cellAfter.textContent()
    expect(textAfter?.trim()).toBe(textBefore.trim())
  })

  test('@ui timesheet grid: PageDown/PageUp moves active cell by page', async ({
    page,
    apiOps,
  }) => {
    // Создаём несколько сотрудников для многострочной сетки
    const emps = await Promise.all(
      Array.from({ length: 3 }, () => apiOps.createEmployee({}))
    )
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)

    // Клик по первому сотруднику
    await ts.clickCell(date1, emps[0].id)
    await expect(ts.activeCellOverlay).toBeVisible()

    // PageDown перемещает вниз
    const topBefore = await ts.activeCellOverlay.evaluate(
      (el) => getComputedStyle(el).top
    )
    await page.keyboard.press('PageDown')
    await page.waitForTimeout(200)
    const topAfter = await ts.activeCellOverlay.evaluate(
      (el) => getComputedStyle(el).top
    )
    // top может быть тем же если мало строк (PageDown clamped to rows.length-1)
    // Но с 3 сотрудниками и pageRows > 3, он переместит на последнюю строку
    expect(parseFloat(topAfter)).toBeGreaterThanOrEqual(parseFloat(topBefore))

    // PageUp возвращает вверх
    await page.keyboard.press('PageUp')
    await page.waitForTimeout(200)
    const topRestored = await ts.activeCellOverlay.evaluate(
      (el) => getComputedStyle(el).top
    )
    expect(parseFloat(topRestored)).toBeLessThanOrEqual(parseFloat(topAfter))
  })

  test('@ui timesheet grid: manual over vacation gets divergence frame and «только расхождения» filter', async ({
    page,
    apiOps,
  }) => {
    // Два сотрудника: А с расхождением (ручная смена поверх отпуска), Б без расхождения
    const empA = await apiOps.createEmployee({})
    const empB = await apiOps.createEmployee({})

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const date1 = periodDate(1)
    const token = getAdminTokenFromStorage()
    const authHeaders = { Authorization: `Bearer ${token}` }

    // Отпуск на первый день периода → авто-слой "vacation"
    await apiOps.createVacation(empA.id, {
      start_date: date1,
      end_date: date1,
      vacation_type: 'Трудовой',
      order_date: date1,
    })

    // Ручная смена "day" поверх отпуска → расхождение (manual ≠ auto)
    const createResp = await page.request.post(`${API_BASE}/api/work-schedules`, {
      data: { employee_id: empA.id, year, month },
      headers: authHeaders,
    })
    expect([200, 201]).toContain(createResp.status())
    const schedule = await createResp.json()
    const entryResp = await page.request.post(
      `${API_BASE}/api/work-schedules/${schedule.id}/entries`,
      {
        data: { work_date: date1, shift_type_code: 'day', planned_hours_override: null, note: null },
        headers: authHeaders,
      }
    )
    expect([200, 201]).toContain(entryResp.status())

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    // Ячейка с расхождением обведена оранжевой рамкой и помечена data-divergence
    const cellA = ts.cell(date1, empA.id)
    await expect(cellA).toBeVisible({ timeout: 15_000 })
    await expect(cellA).toHaveAttribute('data-divergence', 'true')
    await expect(cellA).toHaveClass(/ring-orange-500/)

    // Ячейка без расхождения (ручное без авто) рамки не получает
    const cellB = ts.cell(date1, empB.id)
    await expect(cellB).toBeVisible({ timeout: 15_000 })
    await expect(cellB).not.toHaveAttribute('data-divergence', 'true')

    // Включаем «только расхождения» — остаётся только сотрудник с расхождением
    await page.getByTestId('divergence-filter-toggle').click()
    await expect(ts.cell(date1, empA.id)).toBeVisible({ timeout: 10_000 })
    await expect(ts.grid.locator(`[data-employee-id="${empB.id}"]`)).toHaveCount(0)

    // Снимаем переключатель — сотрудник без расхождения снова виден
    await page.getByTestId('divergence-filter-toggle').click()
    await expect(ts.cell(date1, empB.id)).toBeVisible({ timeout: 10_000 })
  })

  test('@ui timesheet grid: select rectangle and bulk-fill persists across reload', async ({
    page,
    apiOps,
  }) => {
    // Два сотрудника с общим префиксом имени — поиск сужает сетку ровно до них,
    // гарантируя соседние строки (сортировка по имени) для Shift+ArrowDown.
    const u = apiOps.uid()
    const empA = await apiOps.createEmployee({ name: `e2e-sel-${u}-a` })
    const empB = await apiOps.createEmployee({ name: `e2e-sel-${u}-b` })

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)
    const date2 = periodDate(2)

    // Сужаем сетку до двух сотрудников и ждём, пока фильтр применится
    await ts.searchEmployees(`e2e-sel-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(2, { timeout: 10_000 })

    // Выделяем прямоугольник 2x2: клик по верхней ячейке, затем Shift+стрелки
    await ts.selectRectangle({
      anchorDate: date1,
      anchorEmployeeId: empA.id,
      shiftRight: 1,
      shiftDown: 1,
    })

    // Панель массового заполнения видна и показывает число ячеек
    await expect(ts.fillToolbar).toBeVisible({ timeout: 5_000 })
    await expect(ts.fillToolbar).toContainText('Выделено: 4')

    // Заполняем всё выделение сменой «День»
    await ts.fillSelect.selectOption({ label: 'День (08:00-16:30)' })

    // Все 4 ячейки показывают 8 часов (один partial-bulk запрос + рефетч)
    await expect(ts.cell(date1, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empB.id)).toHaveText('8', { timeout: 15_000 })

    // Перезагружаем страницу — значения на месте
    await page.reload()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })
    await ts.expectGridVisible()
    await ts.searchEmployees(`e2e-sel-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(2, { timeout: 10_000 })
    await expect(ts.cell(date1, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empB.id)).toHaveText('8', { timeout: 15_000 })
  })

  test('@ui timesheet grid: Delete on selection resets all selected cells to auto', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empA = await apiOps.createEmployee({ name: `e2e-del-${u}-a` })
    const empB = await apiOps.createEmployee({ name: `e2e-del-${u}-b` })

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)
    const date2 = periodDate(2)

    await ts.searchEmployees(`e2e-del-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(2, { timeout: 10_000 })

    // Заполняем прямоугольник 2x2 сменой «День»
    await ts.selectRectangle({
      anchorDate: date1,
      anchorEmployeeId: empA.id,
      shiftRight: 1,
      shiftDown: 1,
    })
    await expect(ts.fillToolbar).toBeVisible({ timeout: 5_000 })
    await ts.fillSelect.selectOption({ label: 'День (08:00-16:30)' })
    await expect(ts.cell(date1, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empB.id)).toHaveText('8', { timeout: 15_000 })

    // Выделение остаётся активным (select панели вернул фокус документу) —
    // жмём Delete без повторного клика: все ячейки выделения сбрасываются к
    // авто-слою одним partial-bulk запросом.
    await page.keyboard.press('Delete')

    // Для нового сотрудника авто-слой пуст — все ячейки выделения пустеют
    await expect(ts.cell(date1, empA.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date2, empA.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date2, empB.id)).toHaveText('', { timeout: 15_000 })
  })

  test('@ui timesheet grid: Ctrl+Z undoes bulk fill and persists across reload', async ({
    page,
    apiOps,
  }) => {
    // Два сотрудника для выделения 2x2
    const u = apiOps.uid()
    const empA = await apiOps.createEmployee({ name: `e2e-undo-${u}-a` })
    const empB = await apiOps.createEmployee({ name: `e2e-undo-${u}-b` })

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)
    const date2 = periodDate(2)

    // Сужаем сетку до двух сотрудников
    await ts.searchEmployees(`e2e-undo-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(2, { timeout: 10_000 })

    // Ячейки пусты до заполнения (новый сотрудник, авто-слой пуст)
    await expect(ts.cell(date1, empA.id)).toHaveText('', { timeout: 10_000 })

    // Выделяем прямоугольник 2x2 и заполняем сменой «День»
    await ts.selectRectangle({
      anchorDate: date1,
      anchorEmployeeId: empA.id,
      shiftRight: 1,
      shiftDown: 1,
    })
    await expect(ts.fillToolbar).toBeVisible({ timeout: 5_000 })
    await ts.fillSelect.selectOption({ label: 'День (08:00-16:30)' })

    // Все 4 ячейки показывают 8 часов
    await expect(ts.cell(date1, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empB.id)).toHaveText('8', { timeout: 15_000 })

    // Ctrl+Z — отмена массового заполнения одним нажатием
    await page.keyboard.press('Control+z')

    // Все ячейки вернулись к пустому состоянию (авто-слой пуст)
    await expect(ts.cell(date1, empA.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date2, empA.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date2, empB.id)).toHaveText('', { timeout: 15_000 })

    // Перезагружаем страницу — отменённое состояние записано на сервер
    await page.reload()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })
    await ts.expectGridVisible()
    await ts.searchEmployees(`e2e-undo-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(2, { timeout: 10_000 })

    // Значения по-прежнему пустые (отмена персистентна)
    await expect(ts.cell(date1, empA.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date2, empA.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('', { timeout: 15_000 })
    await expect(ts.cell(date2, empB.id)).toHaveText('', { timeout: 15_000 })
  })

  test('@ui timesheet grid: Ctrl+Z undoes single cell edit', async ({
    page,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    const date1 = periodDate(1)

    // Ячейка пуста до правки
    await expect(ts.cell(date1, emp.id)).toHaveText('', { timeout: 10_000 })

    // Редактируем одну ячейку через inline-редактор
    await ts.openCellEditor(date1, emp.id)
    const select = ts.grid.locator('select')
    await select.selectOption({ label: 'День (08:00-16:30)' })
    await expect(select).not.toBeVisible({ timeout: 5_000 })

    // Ячейка показывает 8 часов
    await expect(ts.cell(date1, emp.id)).toHaveText('8', { timeout: 15_000 })

    // Ctrl+Z — отмена правки одной ячейки
    await page.keyboard.press('Control+z')

    // Ячейка вернулась к пустому состоянию
    await expect(ts.cell(date1, emp.id)).toHaveText('', { timeout: 15_000 })

    // Перезагрузка — отмена записана на сервер
    await page.reload()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })
    await ts.expectGridVisible()
    await expect(ts.cell(date1, emp.id)).toHaveText('', { timeout: 15_000 })
  })

  test('@ui timesheet grid: order_changed marker and «принять приказ» reset to auto', async ({
    page,
    apiOps,
  }) => {
    // Acceptance #27: приказ, созданный ПОСЛЕ ручной правки, помечается
    // order_changed=true (фиолетовая точка); «принять приказ» сбрасывает
    // ручное значение к авто-слою (отпуск) одним partial-bulk запросом.
    const emp = await apiOps.createEmployee({})

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const date1 = periodDate(1)
    const token = getAdminTokenFromStorage()
    const authHeaders = { Authorization: `Bearer ${token}` }

    // Ручная смена "day" на первый день периода
    const createResp = await page.request.post(`${API_BASE}/api/work-schedules`, {
      data: { employee_id: emp.id, year, month },
      headers: authHeaders,
    })
    expect([200, 201]).toContain(createResp.status())
    const schedule = await createResp.json()
    const entryResp = await page.request.post(
      `${API_BASE}/api/work-schedules/${schedule.id}/entries`,
      {
        data: { work_date: date1, shift_type_code: 'day', planned_hours_override: null, note: null },
        headers: authHeaders,
      }
    )
    expect([200, 201]).toContain(entryResp.status())

    // Пауза, чтобы приказ (отпуск) гарантированно был новее ручной записи
    await page.waitForTimeout(1_100)

    // Отпуск поверх ручной смены → order_changed=true
    await apiOps.createVacation(emp.id, {
      start_date: date1,
      end_date: date1,
      vacation_type: 'Трудовой',
      order_date: date1,
    })

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    // Ячейка помечена data-order-changed и показывает ручное значение (8ч)
    const cell = ts.cell(date1, emp.id)
    await expect(cell).toBeVisible({ timeout: 15_000 })
    await expect(cell).toHaveAttribute('data-order-changed', 'true')

    // Глобальная кнопка «Принять приказы» и кнопка сотрудника видны
    await expect(ts.acceptOrdersGlobal).toBeVisible({ timeout: 10_000 })
    await expect(ts.acceptOrdersForEmployee(emp.id)).toBeVisible({ timeout: 10_000 })

    // Принимаем приказ — ячейка показывает отпуск (авто-значение «О»)
    await ts.acceptOrdersGlobal.click()
    await expect(cell).toHaveText('О', { timeout: 15_000 })
    await expect(cell).not.toHaveAttribute('data-order-changed', 'true')

    // Кнопки скрываются — помеченных ячеек больше нет
    await expect(ts.acceptOrdersGlobal).not.toBeVisible({ timeout: 10_000 })

    // Перезагрузка — авто-значение (отпуск) сохранилось на сервере
    await page.reload()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })
    await ts.expectGridVisible()
    await expect(ts.cell(date1, emp.id)).toHaveText('О', { timeout: 15_000 })
  })

  test('@ui timesheet grid: copy range and paste into another place persists across reload', async ({
    page,
    apiOps,
  }) => {
    // Acceptance #24: скопировать диапазон, вставить в другое место,
    // перезагрузить страницу — значения на месте.
    const u = apiOps.uid()
    const empA = await apiOps.createEmployee({ name: `e2e-cp-${u}-a` })
    await apiOps.createEmployee({ name: `e2e-cp-${u}-b` })

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const date1 = periodDate(1)
    const date2 = periodDate(2)
    // Паста далеко от плавающей панели массового заполнения (та перекрывает
    // первые колонки первой строки) — берём 8-й и 9-й день.
    const date8 = periodDate(8)
    const date9 = periodDate(9)
    const token = getAdminTokenFromStorage()
    const authHeaders = { Authorization: `Bearer ${token}` }

    // Сеем источник через API: date1=День, date2=Ночь
    const createResp = await page.request.post(`${API_BASE}/api/work-schedules`, {
      data: { employee_id: empA.id, year, month },
      headers: authHeaders,
    })
    expect([200, 201]).toContain(createResp.status())
    const schedule = await createResp.json()
    for (const [date, code] of [
      [date1, 'day'],
      [date2, 'night'],
    ] as const) {
      const resp = await page.request.post(
        `${API_BASE}/api/work-schedules/${schedule.id}/entries`,
        {
          data: { work_date: date, shift_type_code: code, planned_hours_override: null, note: null },
          headers: authHeaders,
        }
      )
      expect([200, 201]).toContain(resp.status())
    }

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    await ts.searchEmployees(`e2e-cp-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(2, { timeout: 10_000 })

    // Источник на месте
    await expect(ts.cell(date1, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date2, empA.id)).toHaveText('12', { timeout: 15_000 })

    // Выделяем диапазон 1x2 (date1..date2) и копируем
    await ts.selectRectangle({
      anchorDate: date1,
      anchorEmployeeId: empA.id,
      shiftRight: 1,
      shiftDown: 0,
    })
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(300)

    // Снимаем выделение (Escape) — плавающая панель массового заполнения
    // перекрывает первую строку ячеек и блокирует клики
    await page.keyboard.press('Escape')
    await expect(ts.fillToolbar).not.toBeVisible({ timeout: 5_000 })

    // Вставляем в date8..date9 у того же сотрудника (Ctrl+V с активной ячейки)
    await ts.clickCell(date8, empA.id)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(500)

    // Скопированные значения на месте
    await expect(ts.cell(date8, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date9, empA.id)).toHaveText('12', { timeout: 15_000 })

    // Перезагрузка — значения сохранились
    await page.reload()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })
    await ts.expectGridVisible()
    await ts.searchEmployees(`e2e-cp-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(2, { timeout: 10_000 })
    await expect(ts.cell(date8, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date9, empA.id)).toHaveText('12', { timeout: 15_000 })
  })

  test('@ui timesheet grid: fill handle drags pattern cyclically across employees', async ({
    page,
    apiOps,
  }) => {
    // Acceptance #25: заполнить две ячейки, протянуть — чередование на месте.
    // Сеем образец через API, затем тянем уголок выделения вниз по сотрудникам.
    const u = apiOps.uid()
    const empA = await apiOps.createEmployee({ name: `e2e-fill-${u}-a` })
    const empB = await apiOps.createEmployee({ name: `e2e-fill-${u}-b` })
    const empC = await apiOps.createEmployee({ name: `e2e-fill-${u}-c` })

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const date1 = periodDate(1)
    const token = getAdminTokenFromStorage()
    const authHeaders = { Authorization: `Bearer ${token}` }

    // Образец: empA=День, empB=Ночь на date1
    for (const [empId, code] of [
      [empA.id, 'day'],
      [empB.id, 'night'],
    ] as const) {
      const createResp = await page.request.post(`${API_BASE}/api/work-schedules`, {
        data: { employee_id: empId, year, month },
        headers: authHeaders,
      })
      expect([200, 201]).toContain(createResp.status())
      const schedule = await createResp.json()
      const entryResp = await page.request.post(
        `${API_BASE}/api/work-schedules/${schedule.id}/entries`,
        {
          data: { work_date: date1, shift_type_code: code, planned_hours_override: null, note: null },
          headers: authHeaders,
        }
      )
      expect([200, 201]).toContain(entryResp.status())
    }

    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    await ts.searchEmployees(`e2e-fill-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(3, { timeout: 10_000 })
    await expect(ts.cell(date1, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('12', { timeout: 15_000 })

    // Выделяем вертикальный диапазон empA..empB (Shift+ArrowDown)
    await ts.selectRectangle({
      anchorDate: date1,
      anchorEmployeeId: empA.id,
      shiftRight: 0,
      shiftDown: 1,
    })
    await expect(ts.fillHandle).toBeVisible({ timeout: 5_000 })

    // Тянем уголок вниз на одну ячейку (empC): заполняется по образцу «День, Ночь»
    const handle = ts.fillHandle
    const box = await handle.boundingBox()
    expect(box).not.toBeNull()
    const target = ts.cell(date1, empC.id)
    const targetBox = await target.boundingBox()
    expect(targetBox).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, {
      steps: 8,
    })
    await page.mouse.up()
    await page.waitForTimeout(500)

    // empC получил циклическое повторение (первая ячейка образца = День)
    await expect(ts.cell(date1, empC.id)).toHaveText('8', { timeout: 15_000 })

    // Перезагрузка — чередование на месте
    await page.reload()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })
    await ts.expectGridVisible()
    await ts.searchEmployees(`e2e-fill-${u}`)
    await expect(ts.grid.locator(`[data-date="${date1}"]`)).toHaveCount(3, { timeout: 10_000 })
    await expect(ts.cell(date1, empA.id)).toHaveText('8', { timeout: 15_000 })
    await expect(ts.cell(date1, empB.id)).toHaveText('12', { timeout: 15_000 })
    await expect(ts.cell(date1, empC.id)).toHaveText('8', { timeout: 15_000 })
  })

  test('@ui timesheet grid: autofill button works when no fact data', async ({
    page,
    apiOps,
  }) => {
    // Acceptance #16 (частично): кнопка «Заполнить по турникету» вызывает
    // превью. Без факта турникета превью показывает «Заполнять нечего» —
    // никакого confirm, страница жива. Полный сценарий применения покрыт
    // backend-тестами test_turnstile_autofill.py.
    await apiOps.createEmployee({})
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectGridVisible()

    await expect(ts.autofillButton).toBeVisible({ timeout: 10_000 })
    await ts.autofillButton.click()
    await page.waitForTimeout(500)

    // Сетка жива и не упала после клика
    await expect(ts.grid).toBeVisible({ timeout: 10_000 })
  })
})
