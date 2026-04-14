import { test, expect } from '@playwright/test'

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function createEmployee(request) {
  const u = uid()
  const deptResp = await request.post('/api/departments', {
    data: { name: `OrdErr-Отдел-${u}`, sort_order: 0 }
  })
  const dept = await deptResp.json()
  const posResp = await request.post('/api/positions', {
    data: { name: `OrdErr-Должность-${u}`, sort_order: 0 }
  })
  const pos = await posResp.json()
  const empResp = await request.post('/api/employees', {
    data: {
      name: `OrdErr-Сотрудник-${u}`,
      gender: 'М',
      birth_date: '1990-05-15',
      tab_number: Math.floor(100000 + Math.random() * 900000),
      department_id: dept.id,
      position_id: pos.id,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
      contract_end: '2025-01-14',
      citizenship: true,
      residency: true,
      rate: 25.5,
      payment_form: 'Повременная',
    }
  })
  return await empResp.json()
}

test.describe('Приказы — ошибки', () => {
  test.setTimeout(30000)

  test('создание с несуществующим сотрудником — 404', async ({ request }) => {
    const resp = await request.post('/api/orders', {
      data: {
        employee_id: 999999,
        order_type: 'Отпуск трудовой',
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
