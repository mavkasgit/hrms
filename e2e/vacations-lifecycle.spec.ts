import { test, expect } from './fixtures/common-fixtures'

/**
 * Тесты жизненного цикла отпусков
 * Использует фикстуры с автоматической очисткой
 */
test.describe('Отпуска', () => {
  test.setTimeout(120000)

  test('создание → удаление', async ({ page, request, apiOps }) => {
    const u = apiOps.uid()
    const empName = `Отпуск-Сотрудник-${u}`

    console.log(`[TEST] Сотрудник: ${empName}`)

    // ========== 0. СОЗДАЁМ СОТРУДНИКА (через фикстуры) ==========
    console.log('[TEST] === ЭТАП 0: Создание сотрудника ===')

    const dept = await apiOps.createDepartment(`Отпуск-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Отпуск-Должность-${u}`)
    
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: empName,
    })
    const empId = emp.id
    console.log(`[TEST] ✅ Сотрудник "${empName}" создан (id=${empId})`)

    // ========== 1. СОЗДАНИЕ ОТПУСКА (через фикстуры) ==========
    console.log('[TEST] === ЭТАП 1: Создание отпуска ===')
    const vacation = await apiOps.createVacation(empId, {
      start_date: '2024-06-20',
      end_date: '2024-07-03',
      vacation_type: 'Трудовой',
      order_date: '2024-06-15',
    })
    console.log(`[TEST] ✅ Отпуск создан (id=${vacation.id}, дней=${vacation.days_count})`)

    // ========== 2. УДАЛЕНИЕ ОТПУСКА (автоматическая очистка в фикстурах) ==========
    console.log('[TEST] === ЭТАП 2: Удаление отпуска (автоматическое) ===')
    console.log(`[TEST] ✅ Отпуск будет удалён автоматически после теста`)
  })
})
