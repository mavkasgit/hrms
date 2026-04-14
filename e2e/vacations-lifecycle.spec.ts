import { test, expect } from '@playwright/test'

/** Уникальный суффикс */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

test.describe('Отпуска', () => {
  test.setTimeout(120000)

  test('создание → удаление', async ({ page, request }) => {
    const u = uid()
    const empName = `Отпуск-Сотрудник-${u}`

    console.log(`[TEST] Сотрудник: ${empName}`)

    // ========== 0. СОЗДАЁМ СОТРУДНИКА (через API) ==========
    console.log('[TEST] === ЭТАП 0: Создание сотрудника ===')
    
    // Сначала создаём подразделение и должность
    const deptResp = await request.post('/api/departments', {
      data: { name: `Отпуск-Отдел-${u}`, sort_order: 0 }
    })
    const dept = await deptResp.json()
    
    const posResp = await request.post('/api/positions', {
      data: { name: `Отпуск-Должность-${u}`, sort_order: 0 }
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

    // ========== 1. СОЗДАНИЕ ОТПУСКА (через API) ==========
    console.log('[TEST] === ЭТАП 1: Создание отпуска ===')
    const vacResp = await request.post('/api/vacations', {
      data: {
        employee_id: empId,
        start_date: '2024-06-20',
        end_date: '2024-07-03',
        vacation_type: 'Трудовой',
        order_date: '2024-06-15',
      }
    })
    expect(vacResp.status()).toBe(201)
    const vacation = await vacResp.json()
    console.log(`[TEST] ✅ Отпуск создан (id=${vacation.id}, дней=${vacation.days_count})`)

    // ========== 2. УДАЛЕНИЕ ОТПУСКА (через API) ==========
    console.log('[TEST] === ЭТАП 2: Удаление отпуска ===')
    const deleteResp = await request.delete(`/api/vacations/${vacation.id}`)
    expect(deleteResp.status()).toBe(200)
    console.log(`[TEST] ✅ Отпуск удалён`)
  })
})
