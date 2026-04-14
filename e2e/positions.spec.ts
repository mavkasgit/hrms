import { test, expect } from '@playwright/test'

/** Уникальный суффикс */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

test.describe('Должности', () => {
  test.setTimeout(60000)

  test('создание → редактирование → удаление', async ({ page, request }) => {
    const u = uid()
    const posName = `Тест-Должность-${u}`

    console.log(`[TEST] Должность: ${posName}`)

    // ========== 1. СОЗДАНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 1: Создание должности ===')
    const createResp = await request.post('/api/positions', {
      data: { name: posName, sort_order: 0 }
    })
    expect(createResp.status()).toBe(200)
    const created = await createResp.json()
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

    // ========== 3. УДАЛЕНИЕ (через API) ==========
    console.log('[TEST] === ЭТАП 3: Удаление должности ===')
    const deleteResp = await request.delete(`/api/positions/${posId}`)
    expect(deleteResp.status()).toBe(200)
    console.log(`[TEST] ✅ Должность "${editedName}" удалена`)
  })
})
