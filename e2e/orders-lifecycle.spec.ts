import { test, expect } from './fixtures/common-fixtures'

test.describe('Приказы', () => {
  test.setTimeout(120000)

  test('создание → удаление', async ({ apiOps }) => {
    const u = apiOps.uid()
    const empName = `Приказ-Сотрудник-${u}`

    const dept = await apiOps.createDepartment(`Приказ-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Приказ-Должность-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: empName,
    })

    const transferOrderTypeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })
    const order = await apiOps.createOrder(emp.id, {
      order_type_id: transferOrderTypeId,
      order_date: '2024-06-15',
      extra_fields: {
        transfer_date: '2024-06-20',
        transfer_reason: 'Тестовый перевод',
      }
    })

    expect(order.id).toBeGreaterThan(0)
    expect(order.order_number).toBeTruthy()
    expect(order.order_type_id).toBe(transferOrderTypeId)
    expect(order.order_type_code).toBe('transfer')
  })
})
