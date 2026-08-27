import { test, expect } from '../fixtures/index'
import { VacationsPage } from '../pages/VacationsPage'
import { formatDateForUi } from '../helpers/test-utils'
import { createVacationViaUi, cleanupVacationOrders } from '../helpers/vacation-create'

/**
 * #121 (T2): После создания трудового отпуска выбранный сотрудник остаётся
 * выбранным/раскрытым, а блок трудовых периодов обновляется на месте — без
 * перезагрузки страницы и повторного поиска.
 *
 * Acceptance:
 * - выбранный сотрудник остаётся выбранным (чек-чип формы на месте);
 * - блок трудовых периодов не сворачивается и обновляется на месте;
 * - созданный отпуск сразу виден в своём периоде (таблица отпусков + операция
 *   «Списание отпуска по приказу №…» + обновлённый «исп. дн.»).
 *
 * Флоу создания отпуска — общий хелпер `createVacationViaUi`: форма → «Создать
 * приказ» (POST /orders/drafts) → сигнал редактора «приказ сохранён»
 * (hrms:draft-order-save) → родитель создаёт отпуск (POST /vacations).
 * OnlyOffice-редактор не нужен: сигнал шлём напрямую через BroadcastChannel —
 * тот же транспорт, что использует редактор (draftOrderSaveChannel).
 */

// Отпуск в ПЕРВОМ периоде (2024): 01.06–14.06 = 14 дн., без праздников.
const VAC_START = formatDateForUi('2024-06-01')
const VAC_END = formatDateForUi('2024-06-14')
const VAC_DAYS = 14

test.describe('Vacation create keeps employee selected @ui', () => {
  test.setTimeout(120_000)

  test('@ui #121: после создания отпуска сотрудник остаётся выбранным, периоды обновляются на месте', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-keep-${u}`
    const orderNumber = `E2EK${Date.now().toString().slice(-6)}`

    const emp = await apiOps.createEmployee({
      name: empName,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    try {
      const vacPage = new VacationsPage(page)

      const created = await createVacationViaUi(
        page,
        vacPage,
        empName,
        orderNumber,
        VAC_START,
        VAC_END,
      )
      expect(created.id, 'vacation must be created').toBeTruthy()
      expect(created.days_count).toBe(VAC_DAYS)

      // #121: сотрудник остаётся выбранным — чек-чип формы на месте.
      const selectedChip = page.getByText(new RegExp(`${empName}\\(таб`))
      await expect(selectedChip).toBeVisible({ timeout: 10_000 })

      // Блок периодов не сворачивается и обновляется на месте — без повторного поиска.
      const empRow = await vacPage.getEmployeeRow(empName)
      const historyRow = empRow.locator('xpath=following-sibling::tr')
      await expect(historyRow).toBeVisible({ timeout: 15_000 })

      // Созданный отпуск сразу виден в своём периоде:
      // таблица отпусков, операция «Списание отпуска по приказу №…», «исп. дн.».
      await expect(historyRow.getByText(VAC_START)).toBeVisible({ timeout: 15_000 })
      await expect(historyRow.getByText(VAC_END)).toBeVisible()
      await expect(
        historyRow.getByText(new RegExp(`Списание отпуска по приказу №${orderNumber}`)),
      ).toBeVisible({ timeout: 15_000 })
      await expect(historyRow.getByText(`${VAC_DAYS} исп.`)).toBeVisible({ timeout: 15_000 })
    } finally {
      await cleanupVacationOrders(apiOps, emp.id)
      await apiOps.cleanupEmployee(emp.id).catch(() => {})
    }
  })
})
