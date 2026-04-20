import { test, expect } from '../fixtures'

test.describe('API errors', () => {
  test.setTimeout(15000)

  test('departments: empty name -> 422', async ({ request }) => {
    const resp = await request.post('/api/departments', {
      data: { name: '', sort_order: 0 },
    })
    expect(resp.status()).toBe(422)
  })

  test('departments: missing entity update/delete -> 404', async ({ request }) => {
    const updateResp = await request.patch('/api/departments/999999', { data: { name: 'test' } })
    expect(updateResp.status()).toBe(404)

    const deleteResp = await request.delete('/api/departments/999999')
    expect(deleteResp.status()).toBe(404)
  })

  test('positions: empty name -> 422', async ({ request }) => {
    const resp = await request.post('/api/positions', {
      data: { name: '', sort_order: 0 },
    })
    expect(resp.status()).toBe(422)
  })

  test('positions: missing entity update/delete -> 404', async ({ request }) => {
    const updateResp = await request.patch('/api/positions/999999', { data: { name: 'test' } })
    expect(updateResp.status()).toBe(404)

    const deleteResp = await request.delete('/api/positions/999999')
    expect(deleteResp.status()).toBe(404)
  })

  test('employees: duplicate tab number -> 409', async ({ request, apiOps }) => {
    const dept = await apiOps.createDepartment(`Err-Dept-${apiOps.uid()}`)
    const pos = await apiOps.createPosition(`Err-Pos-${apiOps.uid()}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id)

    const dupResp = await request.post('/api/employees', {
      data: {
        name: 'Duplicate employee',
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
      },
    })

    expect(dupResp.status()).toBe(409)
    const body = await dupResp.json()
    expect(body.detail).toContain('табельным номером')
  })

  test('employees: missing entity read/update -> 404', async ({ request }) => {
    const getResp = await request.get('/api/employees/999999')
    expect(getResp.status()).toBe(404)

    const updateResp = await request.put('/api/employees/999999', { data: { name: 'test' } })
    expect(updateResp.status()).toBe(404)
  })

  test('employees: archive already archived and restore non-archived -> 400/409', async ({ request, apiOps }) => {
    const empForArchive = await apiOps.createEmployee({})
    const archiveOnce = await request.post(`/api/employees/${empForArchive.id}/archive`)
    expect(archiveOnce.status()).toBe(200)

    const archiveTwice = await request.post(`/api/employees/${empForArchive.id}/archive`)
    expect([400, 409]).toContain(archiveTwice.status())

    const empForRestore = await apiOps.createEmployee({})
    const restoreResp = await request.post(`/api/employees/${empForRestore.id}/restore`)
    expect([400, 409]).toContain(restoreResp.status())
  })

  test('orders: create with missing employee -> 404', async ({ request, apiOps }) => {
    const orderTypeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })
    const resp = await request.post('/api/orders', {
      data: {
        employee_id: 999999,
        order_type_id: orderTypeId,
        order_date: '2024-06-15',
      },
    })
    expect(resp.status()).toBe(404)
  })

  test('orders: missing entity delete/read -> 404', async ({ request }) => {
    const deleteResp = await request.delete('/api/orders/999999?hard=true&confirm=true')
    expect(deleteResp.status()).toBe(404)

    const getResp = await request.get('/api/orders/999999')
    expect(getResp.status()).toBe(404)
  })

  test('vacations: create with missing employee -> 404', async ({ request }) => {
    const resp = await request.post('/api/vacations', {
      data: {
        employee_id: 999999,
        start_date: '2024-06-20',
        end_date: '2024-07-03',
        vacation_type: 'Трудовой',
      },
    })
    expect(resp.status()).toBe(404)
  })

  test('vacations: end date before start date -> 400', async ({ request, apiOps }) => {
    const emp = await apiOps.createEmployee({})
    const resp = await request.post('/api/vacations', {
      data: {
        employee_id: emp.id,
        start_date: '2024-07-03',
        end_date: '2024-06-20',
        vacation_type: 'Трудовой',
      },
    })
    expect(resp.status()).toBe(400)
  })

  test('vacations: missing entity delete -> 404', async ({ request }) => {
    const resp = await request.delete('/api/vacations/999999')
    expect(resp.status()).toBe(404)
  })
})
