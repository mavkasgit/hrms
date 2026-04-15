import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Тесты ошибок подразделений
 * Проверка корректной обработки ошибочных сценариев
 */
test.describe('Подразделения — ошибки', () => {
  test.setTimeout(30000)

  test('создание с пустым именем — 422', async ({ request }) => {
    const resp = await request.post('/api/departments', {
      data: { name: '', sort_order: 0 }
    })
    expect(resp.status()).toBe(422)
  })

  test('редактирование несуществующего — 404', async ({ request }) => {
    const resp = await request.patch('/api/departments/999999', {
      data: { name: 'test' }
    })
    expect(resp.status()).toBe(404)
  })

  test('удаление несуществующего — 404', async ({ request }) => {
    const resp = await request.delete('/api/departments/999999')
    expect(resp.status()).toBe(404)
  })
})
