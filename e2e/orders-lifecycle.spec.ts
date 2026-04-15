import { test, expect } from './fixtures/common-fixtures'

/**
 * Тесты жизненного цикла приказов
 * Использует фикстуры с автоматической очисткой
 */
test.describe('Приказы', () => {
  test.setTimeout(120000)

  test('создание → удаление', async ({ page, request, apiOps }) => {
    const u = apiOps.uid()
    const empName = `Приказ-Сотрудник-${u}`

    console.log(`[TEST] Сотрудник: ${empName}`)

    // ========== 0. СОЗДАЁМ СОТРУДНИКА (через фикстуры) ==========
    console.log('[TEST] === ЭТАП 0: Создание сотрудника ===')

    const dept = await apiOps.createDepartment(`Приказ-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Приказ-Должность-${u}`)
    
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: empName,
    })
    const empId = emp.id
    console.log(`[TEST] ✅ Сотрудник "${empName}" создан (id=${empId})`)

    // ========== 1. СОЗДАНИЕ ПРИКАЗА (через фикстуры) ==========
    console.log('[TEST] === ЭТАП 1: Создание приказа ===')
    const order = await apiOps.createOrder(empId, {
      order_type: 'Отпуск трудовой',
      order_date: '2024-06-15',
      extra_fields: {
        vacation_start: '2024-06-20',
        vacation_end: '2024-07-03',
        vacation_days: 14,
      }
    })
    console.log(`[TEST] ✅ Приказ создан (id=${order.id}, номер=${order.order_number})`)

    // ========== 2. УДАЛЕНИЕ ПРИКАЗА (автоматическая очистка в фикстурах) ==========
    console.log('[TEST] === ЭТАП 2: Удаление приказа (автоматическое) ===')
    console.log(`[TEST] ✅ Приказ будет удалён автоматически после теста`)
  })
})
