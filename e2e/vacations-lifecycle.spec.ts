import { test, expect } from './fixtures/common-fixtures'

test.describe('Отпуска', () => {
  test.setTimeout(120000)

  test('создание → удаление', async ({ apiOps }) => {
    const u = apiOps.uid()
    const empName = `Отпуск-Сотрудник-${u}`

    const dept = await apiOps.createDepartment(`Отпуск-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Отпуск-Должность-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: empName,
    })

    const vacation = await apiOps.createVacation(emp.id, {
      start_date: '2024-06-20',
      end_date: '2024-07-03',
      vacation_type: 'Трудовой',
      order_date: '2024-06-15',
    })

    expect(vacation.id).toBeGreaterThan(0)
    expect(vacation.days_count).toBeGreaterThan(0)
  })
})
