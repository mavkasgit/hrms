import { test, expect } from '../fixtures'

test.describe('Catalog lifecycle API', () => {
  test.setTimeout(15000)

  test('departments: create -> update -> delete', async ({ request, apiOps }) => {
    const u = apiOps.uid()
    const created = await apiOps.createDepartment(`Тест-Отдел-${u}`, { short_name: `ТО-${u}` })

    const editedName = `Тест-Отдел-${u}-изменено`
    const updateResp = await request.patch(`/api/departments/${created.id}`, {
      data: { name: editedName, short_name: `ТО-${u}-изм` },
    })
    expect(updateResp.status()).toBe(200)

    await apiOps.deleteDepartment(created.id)
  })

  test('positions: create -> update -> delete', async ({ request, apiOps }) => {
    const u = apiOps.uid()
    const created = await apiOps.createPosition(`Тест-Должность-${u}`)

    const editedName = `Тест-Должность-${u}-изменено`
    const updateResp = await request.patch(`/api/positions/${created.id}`, {
      data: { name: editedName },
    })
    expect(updateResp.status()).toBe(200)

    await apiOps.deletePosition(created.id)
  })

  test('vacations: create -> delete', async ({ apiOps }) => {
    const u = apiOps.uid()
    const dept = await apiOps.createDepartment(`Отпуск-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Отпуск-Должность-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: `Отпуск-Сотрудник-${u}`,
    })

    const vacation = await apiOps.createVacation(emp.id, {
      start_date: '2024-06-20',
      end_date: '2024-07-03',
      vacation_type: 'Трудовой',
      order_date: '2024-06-15',
    })

    expect(vacation.id).toBeGreaterThan(0)
    expect(vacation.days_count).toBeGreaterThan(0)

    await apiOps.deleteVacation(vacation.id)
  })

  test('orders: create -> delete', async ({ apiOps }) => {
    const u = apiOps.uid()
    const dept = await apiOps.createDepartment(`Приказ-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Приказ-Должность-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: `Приказ-Сотрудник-${u}`,
    })

    const transferOrderTypeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })
    const order = await apiOps.createOrder(emp.id, {
      order_type_id: transferOrderTypeId,
      order_date: '2024-06-15',
      extra_fields: {
        transfer_date: '2024-06-20',
        transfer_reason: 'Тестовый перевод',
      },
    })

    expect(order.id).toBeGreaterThan(0)
    expect(order.order_number).toBeTruthy()
    expect(order.order_type_id).toBe(transferOrderTypeId)

    await apiOps.deleteOrder(order.id)
  })
})
