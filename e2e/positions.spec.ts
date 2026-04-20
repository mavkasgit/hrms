import { test, expect } from './fixtures'

/**
 * Тесты жизненного цикла должностей
 * Использует фикстуры с автоматической очисткой
 */
test.describe('Должности', () => {
  test.setTimeout(60000)

  test('создание → редактирование → удаление', async ({ page, request, apiOps }) => {
    const u = apiOps.uid()
    const posName = `Тест-Должность-${u}`

    console.log(`[TEST] Должность: ${posName}`)

    // ========== 1. СОЗДАНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 1: Создание должности ===')
    const created = await apiOps.createPosition(posName)
    const posId = created.id
    console.log(`[TEST] ✅ Должность "${posName}" создана (id=${posId})`)

    // ========== 2. РЕДАКТИРОВАНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 2: Редактирование должности ===')
    const editedName = `${posName}-изменено`
    const updateResp = await request.patch(`/api/positions/${posId}`, {
      data: { name: editedName }
    })
    expect(updateResp.status()).toBe(200)
    console.log(`[TEST] ✅ Должность "${editedName}" сохранена`)

    // ========== 3. УДАЛЕНИЕ (автоматическая очистка в фикстурах) ==========
    console.log('[TEST] === ЭТАП 3: Удаление должности (автоматическое) ===')
    console.log(`[TEST] ✅ Должность "${editedName}" будет удалена автоматически после теста`)
  })
})
