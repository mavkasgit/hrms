import { test, expect } from '../fixtures/index'

/**
 * Контрактные даты сотрудника редактируемы: валидаторы «приём не раньше
 * 16 лет» и «contract_end >= contract_start» удалены из EmployeeCreate /
 * EmployeeUpdate (см. backend/app/schemas/employee.py). Проверяем через
 * API-контракт: создать с «нелогичными» датами → успех; name-only update
 * при установленных contract_end < contract_start → успех, остальные поля
 * не сброшены.
 *
 * Паттерн create/cleanup — как в e2e/api/employees-errors.spec.ts:
 * apiOps.createEmployee auto-seed'ит dept/pos и track'ает все id;
 * teardown удаляет в обратном FK-порядке (employee → position → department).
 */
test.describe('Employees contract dates editable @api', () => {
  test.setTimeout(20_000)

  test('@api employees: create with contract_start > contract_end → success', async ({
    apiOps,
  }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-emp-contract-create-${u}`,
      contract_start: '2026-06-01',
      contract_end: '2026-01-01',
    })

    expect(emp.id).toBeTruthy()
    expect(emp.contract_start).toBe('2026-06-01')
    expect(emp.contract_end).toBe('2026-01-01')
  })

  test('@api employees: name-only update keeps illogical contract dates', async ({
    apiOps,
  }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-emp-contract-update-${u}`,
      contract_start: '2026-06-01',
      contract_end: '2026-01-01',
    })

    const newName = `e2e-emp-contract-updated-${u}`
    const updated = await apiOps.updateEmployee(emp.id, { name: newName })

    expect(updated.name).toBe(newName)
    expect(updated.contract_start).toBe('2026-06-01')
    expect(updated.contract_end).toBe('2026-01-01')
    expect(updated.tab_number).toBe(emp.tab_number)
    expect(updated.department_id).toBe(emp.department_id)
    expect(updated.position_id).toBe(emp.position_id)
  })
})
