import { test, expect } from '@playwright/test'

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function createEmployee(request) {
  const u = uid()
  const deptResp = await request.post('/api/departments', {
    data: { name: `VacErr-Отдел-${u}`, sort_order: 0 }
  })
  const dept = await deptResp.json()
  const posResp = await request.post('/api/positions', {
    data: { name: `VacErr-Должность-${u}`, sort_order: 0 }
  })
  const pos = await posResp.json()
  const empResp = await request.post('/api/employees', {
    data: {
      name: `VacErr-Сотрудник-${u}`,
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

test.describe('Отпуска — ошибки', () => {
  test.setTimeout(30000)

  test('создание с несуществующим сотрудником — 404', async ({ request }) => {
    const resp = await request.post('/api/vacations', {
      data: {
        employee_id: 999999,
        start_date: '2024-06-20',
        end_date: '2024-07-03',
        vacation_type: 'Трудовой',
      }
    })
    expect(resp.status()).toBe(404)
  })

  test('дата конца раньше начала — 400', async ({ request }) => {
    const emp = await createEmployee(request)
    const resp = await request.post('/api/vacations', {
      data: {
        employee_id: emp.id,
        start_date: '2024-07-03',
        end_date: '2024-06-20',
        vacation_type: 'Трудовой',
      }
    })
    expect(resp.status()).toBe(400)
  })

  test('удаление несуществующего отпуска — 404', async ({ request }) => {
    const resp = await request.delete('/api/vacations/999999')
    expect(resp.status()).toBe(404)
  })
})
