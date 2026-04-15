import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Тесты ошибок сотрудников
 * Проверка корректной обработки ошибочных сценариев
 */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function createEmployee(request: APIRequestContext) {
  const u = uid()
  const deptResp = await request.post('/api/departments', {
    data: { name: `Err-Отдел-${u}`, sort_order: 0 }
  })
  const dept = await deptResp.json()

  const posResp = await request.post('/api/positions', {
    data: { name: `Err-Должность-${u}`, sort_order: 0 }
  })
  const pos = await posResp.json()

  const empResp = await request.post('/api/employees', {
    data: {
      name: `Err-Сотрудник-${u}`,
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
  const emp = await empResp.json()
  return { emp, dept, pos }
}

test.describe('Сотрудники — ошибки', () => {
  test.setTimeout(30000)

  test('дублирующийся табельный номер — 409', async ({ request }) => {
    const { emp, dept, pos } = await createEmployee(request)

    const resp = await request.post('/api/employees', {
      data: {
        name: 'Дубликат',
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: emp.tab_number,
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    expect(resp.status()).toBe(409)
    const body = await resp.json()
    expect(body.detail).toContain('табельным номером')
  })

  test('получение несуществующего — 404', async ({ request }) => {
    const resp = await request.get('/api/employees/999999')
    expect(resp.status()).toBe(404)
  })

  test('редактирование несуществующего — 404', async ({ request }) => {
    const resp = await request.put('/api/employees/999999', {
      data: { name: 'test' }
    })
    expect(resp.status()).toBe(404)
  })

  test('архивация уже архивированного — 400/409', async ({ request }) => {
    const { emp } = await createEmployee(request)

    const r1 = await request.post(`/api/employees/${emp.id}/archive`)
    expect(r1.status()).toBe(200)

    const r2 = await request.post(`/api/employees/${emp.id}/archive`)
    expect([400, 409]).toContain(r2.status())
  })

  test('восстановление не архивированного — 400/409', async ({ request }) => {
    const { emp } = await createEmployee(request)
    const resp = await request.post(`/api/employees/${emp.id}/restore`)
    expect([400, 409]).toContain(resp.status())
  })
})
