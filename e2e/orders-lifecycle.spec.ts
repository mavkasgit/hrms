import { test, expect } from '@playwright/test'

/** Уникальный суффикс */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

test.describe('Приказы', () => {
  test.setTimeout(120000)

  test('создание → удаление', async ({ page, request }) => {
    const u = uid()
    const empName = `Приказ-Сотрудник-${u}`

    console.log(`[TEST] Сотрудник: ${empName}`)

    // ========== 0. СОЗДАЁМ СОТРУДНИКА (через API) ==========
    console.log('[TEST] === ЭТАП 0: Создание сотрудника ===')
    
    // Сначала создаём подразделение и должность
    const deptResp = await request.post('/api/departments', {
      data: { name: `Приказ-Отдел-${u}`, sort_order: 0 }
    })
    const dept = await deptResp.json()
    
    const posResp = await request.post('/api/positions', {
      data: { name: `Приказ-Должность-${u}`, sort_order: 0 }
    })
    const pos = await posResp.json()

    const empResp = await request.post('/api/employees', {
      data: {
        name: empName,
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
    expect(empResp.status()).toBe(201)
    const emp = await empResp.json()
    const empId = emp.id
    console.log(`[TEST] ✅ Сотрудник "${empName}" создан (id=${empId})`)

    // ========== 1. СОЗДАНИЕ ПРИКАЗА (через API) ==========
    console.log('[TEST] === ЭТАП 1: Создание приказа ===')
    const orderResp = await request.post('/api/orders', {
      data: {
        employee_id: empId,
        order_type: 'Отпуск трудовой',
        order_date: '2024-06-15',
        extra_fields: {
          vacation_start: '2024-06-20',
          vacation_end: '2024-07-03',
          vacation_days: 14,
        }
      }
    })
    expect(orderResp.status()).toBe(201)
    const order = await orderResp.json()
    console.log(`[TEST] ✅ Приказ создан (id=${order.id}, номер=${order.order_number})`)

    // ========== 2. УДАЛЕНИЕ ПРИКАЗА (через API) ==========
    console.log('[TEST] === ЭТАП 2: Удаление приказа ===')
    const deleteResp = await request.delete(`/api/orders/${order.id}?hard=true&confirm=true`)
    expect(deleteResp.status()).toBe(200)
    console.log(`[TEST] ✅ Приказ удалён`)
  })
})
