import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Employees API validation @api', () => {
  test.setTimeout(20_000)

  test('@api employees: empty name → 422', async ({ playwright, apiOps }) => {
    const u = apiOps.uid()
    const dept = await apiOps.createDepartment(`e2e-dept-err-${u}`)
    const pos = await apiOps.createPosition(`e2e-pos-err-${u}`)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.post('/api/employees', {
        data: {
          name: '',
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
        },
      })
      expect(resp.status()).toBe(422)
    } finally {
      await dispose()
    }
  })

  test('@api employees: duplicate tab_number → 409', async ({
    playwright,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})
    const deptId = emp.department_id
    const posId = emp.position_id

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.post('/api/employees', {
        data: {
          name: `e2e-emp-dup-${apiOps.uid()}`,
          gender: 'М',
          birth_date: '1990-05-15',
          tab_number: emp.tab_number,
          department_id: deptId,
          position_id: posId,
          hire_date: '2024-01-15',
          contract_start: '2024-01-15',
          contract_end: '2025-01-14',
          citizenship: true,
          residency: true,
          rate: 25.5,
          payment_form: 'Повременная',
        },
      })
      expect(resp.status()).toBe(409)
      const body = await resp.json()
      expect(String(body.detail || '')).toMatch(/табельн/i)
    } finally {
      await dispose()
    }
  })
})
