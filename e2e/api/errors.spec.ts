/**
 * Slim API error contracts (legacy api-errors).
 * Employee empty-name 422 / duplicate tab 409 → employees-errors.spec.ts.
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('API errors @api', () => {
  test.setTimeout(20_000)

  test('@api departments: empty name → 422', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.post('/api/departments', {
        data: { name: '', sort_order: 0 },
      })
      expect(resp.status()).toBe(422)
    } finally {
      await dispose()
    }
  })

  test('@api departments: missing entity update/delete → 404', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const updateResp = await request.patch('/api/departments/999999', {
        data: { name: 'e2e-missing' },
      })
      expect(updateResp.status()).toBe(404)

      const deleteResp = await request.delete('/api/departments/999999')
      expect(deleteResp.status()).toBe(404)
    } finally {
      await dispose()
    }
  })

  test('@api positions: empty name → 422; missing → 404', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const empty = await request.post('/api/positions', {
        data: { name: '', sort_order: 0 },
      })
      expect(empty.status()).toBe(422)

      const updateResp = await request.patch('/api/positions/999999', {
        data: { name: 'e2e-missing' },
      })
      expect(updateResp.status()).toBe(404)

      const deleteResp = await request.delete('/api/positions/999999')
      expect(deleteResp.status()).toBe(404)
    } finally {
      await dispose()
    }
  })

  test('@api employees: missing entity read/update → 404', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const getResp = await request.get('/api/employees/999999')
      expect(getResp.status()).toBe(404)

      const updateResp = await request.put('/api/employees/999999', {
        data: { name: 'e2e-missing' },
      })
      expect(updateResp.status()).toBe(404)
    } finally {
      await dispose()
    }
  })

  test('@api employees: dismiss twice / restore active → 400|409', async ({
    playwright,
    apiOps,
  }) => {
    const empDismiss = await apiOps.createEmployee({})
    const empRestore = await apiOps.createEmployee({})

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const once = await request.post(`/api/employees/${empDismiss.id}/dismiss`)
      expect(once.status()).toBe(200)

      const twice = await request.post(`/api/employees/${empDismiss.id}/dismiss`)
      expect([400, 409]).toContain(twice.status())

      const restoreActive = await request.post(`/api/employees/${empRestore.id}/restore`)
      expect([400, 409]).toContain(restoreActive.status())
    } finally {
      await dispose()
    }
  })

  test('@api orders: missing employee / missing entity → 404', async ({
    playwright,
    apiOps,
  }) => {
    const orderTypeId = await apiOps.getOrderTypeId({
      code: 'transfer',
      visibleOnly: true,
    })

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const createResp = await request.post('/api/orders', {
        data: {
          employee_id: 999999,
          order_type_id: orderTypeId,
          order_date: '2024-06-15',
        },
      })
      expect(createResp.status()).toBe(404)

      const deleteResp = await request.delete(
        '/api/orders/999999?hard=true&confirm=true'
      )
      expect(deleteResp.status()).toBe(404)

      const getResp = await request.get('/api/orders/999999')
      expect(getResp.status()).toBe(404)
    } finally {
      await dispose()
    }
  })

  test('@api vacations: missing employee / bad dates / missing delete', async ({
    playwright,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const missingEmp = await request.post('/api/vacations', {
        data: {
          employee_id: 999999,
          start_date: '2024-06-20',
          end_date: '2024-07-03',
          vacation_type: 'Трудовой',
        },
      })
      expect(missingEmp.status()).toBe(404)

      const badDates = await request.post('/api/vacations', {
        data: {
          employee_id: emp.id,
          start_date: '2024-07-03',
          end_date: '2024-06-20',
          vacation_type: 'Трудовой',
        },
      })
      expect(badDates.status()).toBe(400)

      const missingDel = await request.delete('/api/vacations/999999')
      expect(missingDel.status()).toBe(404)
    } finally {
      await dispose()
    }
  })
})
