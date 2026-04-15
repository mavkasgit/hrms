import { test, expect } from './fixtures/orders-fixtures'
import type { OrderType } from '../types'

/**
 * Тесты ошибок приказов
 * Проверка корректной обработки ошибочных сценариев
 */
test.describe('Приказы — ошибки', () => {
  test.setTimeout(30000)

  test('создание с несуществующим сотрудником — 404', async ({ request }) => {
    const resp = await request.post('/api/orders', {
      data: {
        employee_id: 999999,
        order_type: 'Отпуск трудовой' as OrderType,
        order_date: '2024-06-15',
      }
    })
    expect(resp.status()).toBe(404)
  })

  test('удаление несуществующего приказа — 404', async ({ request }) => {
    const resp = await request.delete('/api/orders/999999?hard=true&confirm=true')
    expect(resp.status()).toBe(404)
  })

  test('получение несуществующего приказа — 404/405', async ({ request }) => {
    const resp = await request.get('/api/orders/999999')
    // 405 = маршрут не существует, 404 = не найден
    expect([404, 405]).toContain(resp.status())
  })
})
