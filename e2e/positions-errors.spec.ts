import { test, expect } from '@playwright/test'

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

test.describe('Должности — ошибки', () => {
  test.setTimeout(30000)

  test('создание с пустым именем — 422', async ({ request }) => {
    const resp = await request.post('/api/positions', {
      data: { name: '', sort_order: 0 }
    })
    expect(resp.status()).toBe(422)
  })

  test('редактирование несуществующей — 404', async ({ request }) => {
    const resp = await request.patch('/api/positions/999999', {
      data: { name: 'test' }
    })
    expect(resp.status()).toBe(404)
  })

  test('удаление несуществующей — 404', async ({ request }) => {
    const resp = await request.delete('/api/positions/999999')
    expect(resp.status()).toBe(404)
  })
})
