import { test, expect } from '../fixtures/index'
import { VacationsPage } from '../pages/VacationsPage'
import { formatDateForUi } from '../helpers/test-utils'
import { createVacationViaUi, cleanupVacationOrders } from '../helpers/vacation-create'

/**
 * #122 (T3): Тост о распределении отпуска по трудовым периодам («куда и как»).
 *
 * После создания трудового отпуска тост сразу сообщает, куда лёг отпуск: номер
 * приказа, количество дней и трудовой(ие) период(ы) списания. Тост строится из
 * обновлённых данных периодов по транзакции созданного приказа — без изменений API.
 *
 * Acceptance:
 * - тост с номером приказа, днями и периодом(ами) списания;
 * - при списании в один период — одна строка с этим периодом;
 * - при разбиении по нескольким периодам — перечисление периодов с долями дней.
 *
 * Флоу создания отпуска — общий хелпер `createVacationViaUi` (как в #121).
 */

test.describe('Vacation create toast @ui', () => {
  test.setTimeout(120_000)

  test('@ui #122: тост при списании в один период показывает одну строку с периодом', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-toast-${u}`
    const orderNumber = `E2ET${Date.now().toString().slice(-6)}`

    const emp = await apiOps.createEmployee({
      name: empName,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    try {
      // 01.07–14.07.2024 = 14 календарных дней, без праздников → 1-й период.
      const created = await createVacationViaUi(
        page,
        new VacationsPage(page),
        empName,
        orderNumber,
        formatDateForUi('2024-07-01'),
        formatDateForUi('2024-07-14'),
      )
      expect(created.days_count).toBe(14)
      // OrderNumberField дописывает литеру («-л»), тост рендерит полный номер.
      expect(created.order_number).toBe(`${orderNumber}-л`)

      // Тост: «Отпуск {№} создан: 14 дн. → 1-й период (15.01.2024–14.01.2025)».
      const toastRegex = new RegExp(
        `Отпуск ${created.order_number} создан: 14 дн\\. → 1-й период \\(15\\.01\\.2024–14\\.01\\.2025\\)`,
      )
      await expect(page.getByText(toastRegex)).toBeVisible({ timeout: 15_000 })
    } finally {
      await cleanupVacationOrders(apiOps, emp.id)
      await apiOps.cleanupEmployee(emp.id).catch(() => {})
    }
  })

  test('@ui #122: при разбиении по нескольким периодам тост перечисляет периоды с долями дней', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-vac-toast-multi-${u}`
    const orderNumber = `E2ETM${Date.now().toString().slice(-6)}`

    const emp = await apiOps.createEmployee({
      name: empName,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    try {
      // Предрасход: 01.07–20.07.2024 = 20 дн. → в 1-м периоде (24 дн.) остаётся 4 дн.
      const vacA = await apiOps.createVacation(emp.id, {
        start_date: '2024-07-01',
        end_date: '2024-07-20',
        order_date: '2024-06-20',
        order_number: `E2ETA${u}`,
      })
      expect(vacA.days_count).toBe(20)

      // 01.08–10.08.2024 = 10 дн. → 4 дн. из 1-го периода + 6 дн. из нового 2-го.
      const created = await createVacationViaUi(
        page,
        new VacationsPage(page),
        empName,
        orderNumber,
        formatDateForUi('2024-08-01'),
        formatDateForUi('2024-08-10'),
      )
      expect(created.days_count).toBe(10)
      expect(created.order_number).toBe(`${orderNumber}-л`)

      // Тост: «Отпуск {№} создан: 10 дн. → 1-й: 4 дн., 2-й: 6 дн.».
      const toastRegex = new RegExp(
        `Отпуск ${created.order_number} создан: 10 дн\\. → 1-й: 4 дн\\., 2-й: 6 дн\\.`,
      )
      await expect(page.getByText(toastRegex)).toBeVisible({ timeout: 15_000 })
    } finally {
      await cleanupVacationOrders(apiOps, emp.id)
      await apiOps.cleanupEmployee(emp.id).catch(() => {})
    }
  })
})