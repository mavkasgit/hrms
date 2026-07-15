import { test, expect } from '../../fixtures'
import type { APIRequestContext } from '@playwright/test'

const CUSTOM_ORDER_TYPE_RE = /^Тест-Тип-Приказа-/

async function cleanupCustomOrderTypes(request: APIRequestContext) {
  const resp = await request.get('/api/order-types')
  expect(resp.status()).toBe(200)
  const data = await resp.json()
  const items = data.items || []

  for (const item of items) {
    if (!CUSTOM_ORDER_TYPE_RE.test(item.name)) continue
    await request.delete(`/api/order-types/${item.id}`).catch(() => {})
  }
}

test.describe('Order Type Letter Update', () => {
  test.setTimeout(30000)

  test.afterEach(async ({ request }) => {
    await cleanupCustomOrderTypes(request)
  })

  test('должен запрещать редактирование стандартных типов приказов', async ({ request }) => {
    const typesResp = await request.get('/api/order-types')
    expect(typesResp.status()).toBe(200)
    const typesData = await typesResp.json()
    const contractExtension = (typesData.items || []).find(
      (t: any) => t.code === 'contract_extension'
    )
    expect(contractExtension).toBeTruthy()
    expect(contractExtension.letter).toBe('л')

    // Попытка изменить литеру должна вернуть 403
    const updateResp = await request.put(`/api/order-types/${contractExtension.id}`, {
      data: { letter: 'к' },
    })
    expect(updateResp.status()).toBe(403)
    const errorData = await updateResp.json()
    expect(errorData.detail).toContain('Нельзя изменить стандартный тип приказа')

    // Литера должна остаться прежней
    const getResp = await request.get('/api/order-types')
    const getData = await getResp.json()
    const found = (getData.items || []).find((t: any) => t.id === contractExtension.id)
    expect(found.letter).toBe('л')
  })

  test('должен разрешать редактирование литеры для пользовательских типов', async ({ request }) => {
    // Создаём пользовательский тип приказа
    const createResp = await request.post('/api/order-types', {
      data: {
        code: 'test_custom_type',
        name: 'Тест-Тип-Приказа-Custom',
        letter: 'л',
        show_in_orders_page: true,
        field_schema: [],
      },
    })
    expect(createResp.status()).toBe(200)
    const created = await createResp.json()
    expect(created.letter).toBe('л')

    // Меняем литеру на "к"
    const updateResp = await request.put(`/api/order-types/${created.id}`, {
      data: { letter: 'к' },
    })
    expect(updateResp.status()).toBe(200)
    const updated = await updateResp.json()
    expect(updated.letter).toBe('к')

    // Проверяем что литера сохранилась
    const getResp = await request.get('/api/order-types')
    const getData = await getResp.json()
    const found = (getData.items || []).find((t: any) => t.id === created.id)
    expect(found.letter).toBe('к')

    // Сбрасываем на null
    const resetResp = await request.put(`/api/order-types/${created.id}`, {
      data: { letter: null },
    })
    expect(resetResp.status()).toBe(200)
    const resetData = await resetResp.json()
    expect(resetData.letter).toBeNull()
  })
})
