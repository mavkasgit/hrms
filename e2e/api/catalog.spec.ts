import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Catalog API @api', () => {
  test.setTimeout(20_000)

  test('@api departments: create → update → delete', async ({
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const created = await apiOps.createDepartment(`e2e-dept-${u}`, {
      short_name: `e2e-s-${u}`.slice(0, 20),
    })
    expect(created.id).toBeGreaterThan(0)
    expect(created.name).toContain('e2e-dept-')

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const editedName = `e2e-dept-${u}-edited`
      const updateResp = await request.patch(`/api/departments/${created.id}`, {
        data: { name: editedName },
      })
      expect(updateResp.status()).toBe(200)
      const updated = await updateResp.json()
      expect(updated.name).toBe(editedName)
    } finally {
      await dispose()
    }

    await apiOps.deleteDepartment(created.id)
  })

  test('@api positions: create → update → delete', async ({
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const created = await apiOps.createPosition(`e2e-pos-${u}`)
    expect(created.id).toBeGreaterThan(0)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const editedName = `e2e-pos-${u}-edited`
      const updateResp = await request.patch(`/api/positions/${created.id}`, {
        data: { name: editedName },
      })
      expect(updateResp.status()).toBe(200)
      const updated = await updateResp.json()
      expect(updated.name).toBe(editedName)
    } finally {
      await dispose()
    }

    await apiOps.deletePosition(created.id)
  })

  // Leftovers from legacy catalog-lifecycle (not covered by smoke)
  test('@api vacations: create → delete', async ({ apiOps }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-emp-vac-${u}`,
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

  test('@api orders: create → delete', async ({ apiOps }) => {
    const u = apiOps.uid()
    const emp = await apiOps.createEmployee({
      name: `e2e-emp-ord-${u}`,
    })

    const transferOrderTypeId = await apiOps.getOrderTypeId({
      code: 'transfer',
      visibleOnly: true,
    })
    const order = await apiOps.createOrder(emp.id, {
      order_type_id: transferOrderTypeId,
      order_date: '2024-06-15',
      extra_fields: {
        transfer_date: '2024-06-20',
        transfer_reason: 'e2e transfer',
      },
    })

    expect(order.id).toBeGreaterThan(0)
    expect(order.order_number).toBeTruthy()
    expect(order.order_type_id).toBe(transferOrderTypeId)

    await apiOps.deleteOrder(order.id)
  })
})
