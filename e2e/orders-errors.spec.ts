import { test, expect } from './fixtures/orders-fixtures'

test.describe('Приказы — ошибки', () => {
  test.setTimeout(30000)

  test('создание с несуществующим сотрудником — 404', async ({ request, ordersApi }) => {
    const orderTypeId = await ordersApi.getOrderTypeId({ code: 'transfer', visibleOnly: true })

    const resp = await request.post('/api/orders', {
      data: {
        employee_id: 999999,
        order_type_id: orderTypeId,
        order_date: '2024-06-15',
      }
    })

    expect(resp.status()).toBe(404)
  })

  test('удаление несуществующего приказа — 404', async ({ request }) => {
    const resp = await request.delete('/api/orders/999999?hard=true&confirm=true')
    expect(resp.status()).toBe(404)
  })

  test('получение несуществующего приказа — 404', async ({ request }) => {
    const resp = await request.get('/api/orders/999999')
    expect(resp.status()).toBe(404)
  })
})
