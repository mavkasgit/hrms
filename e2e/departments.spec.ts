import { test, expect } from '@playwright/test'

/** Уникальный суффикс */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

test.describe('Подразделения', () => {
  test.setTimeout(60000)

  test('создание → редактирование → удаление', async ({ page, request }) => {
    const u = uid()
    const deptName = `Тест-Отдел-${u}`

    console.log(`[TEST] Подразделение: ${deptName}`)

    // ========== 1. СОЗДАНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 1: Создание подразделения ===')
    const createResp = await request.post('/api/departments', {
      data: { name: deptName, short_name: `ТО-${u}`, sort_order: 0 }
    })
    expect(createResp.status()).toBe(200)
    const created = await createResp.json()
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

    // ========== 3. УДАЛЕНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 3: Удаление подразделения ===')
    const deleteResp = await request.delete(`/api/departments/${deptId}`)
    expect(deleteResp.status()).toBe(200)
    console.log(`[TEST] ✅ Подразделение "${editedName}" удалено`)
  })
})
