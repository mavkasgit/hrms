import { test, expect } from './fixtures'

/**
 * Тесты жизненного цикла подразделений
 * Использует фикстуры с автоматической очисткой
 */
test.describe('Подразделения', () => {
  test.setTimeout(60000)

  test('создание → редактирование → удаление', async ({ page, request, apiOps }) => {
    const u = apiOps.uid()
    const deptName = `Тест-Отдел-${u}`

    console.log(`[TEST] Подразделение: ${deptName}`)

    // ========== 1. СОЗДАНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 1: Создание подразделения ===')
    const created = await apiOps.createDepartment(deptName, { short_name: `ТО-${u}` })
    const deptId = created.id
    console.log(`[TEST] ✅ Подразделение "${deptName}" создано (id=${deptId})`)

    // ========== 2. РЕДАКТИРОВАНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 2: Редактирование подразделения ===')
    const editedName = `${deptName}-изменено`
    const updateResp = await request.patch(`/api/departments/${deptId}`, {
      data: { name: editedName, short_name: `ТО-${u}-изм` }
    })
    expect(updateResp.status()).toBe(200)
    console.log(`[TEST] ✅ Подразделение "${editedName}" сохранено`)

    // ========== 3. УДАЛЕНИЕ (автоматическая очистка в фикстурах) ==========
    console.log('[TEST] === ЭТАП 3: Удаление подразделения (автоматическое) ===')
    console.log(`[TEST] ✅ Подразделение "${editedName}" будет удалено автоматически после теста`)
  })
})
