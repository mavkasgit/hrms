/**
 * Sick leave overlap contract (issue #43):
 * - Adjacent periods (one ends on the day the next starts) are allowed — the
 *   boundary day is shared, not an overlap.
 * - Genuine overlap / contained periods still return 409.
 * - The shared boundary day is counted once in the summary total.
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('API sick-leaves @api', () => {
  test.setTimeout(20_000)

  const SICK_LEAVES = '/api/sick-leaves'

  async function createLeave(
    request: import('@playwright/test').APIRequestContext,
    employeeId: number,
    start: string,
    end: string,
    comment: string
  ) {
    const resp = await request.post(SICK_LEAVES, {
      data: {
        employee_id: employeeId,
        start_date: start,
        end_date: end,
        comment,
      },
    })
    return resp
  }

  test('@api sick-leaves: adjacent periods (end == start of next) are allowed', async ({
    playwright,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const first = await createLeave(request, emp.id, '2026-05-05', '2026-05-10', 'e2e-first')
      expect(first.status()).toBe(201)

      const second = await createLeave(request, emp.id, '2026-05-10', '2026-05-15', 'e2e-second')
      expect(second.status()).toBe(201)

      const secondBody = await second.json()
      expect(secondBody.days_count).toBe(6)
    } finally {
      await dispose()
    }
  })

  test('@api sick-leaves: genuine overlap → 409', async ({ playwright, apiOps }) => {
    const emp = await apiOps.createEmployee({})

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const first = await createLeave(request, emp.id, '2026-05-05', '2026-05-10', 'e2e-first')
      expect(first.status()).toBe(201)

      const overlap = await createLeave(request, emp.id, '2026-05-09', '2026-05-12', 'e2e-overlap')
      expect(overlap.status()).toBe(409)
    } finally {
      await dispose()
    }
  })

  test('@api sick-leaves: update into overlap → 409', async ({ playwright, apiOps }) => {
    const emp = await apiOps.createEmployee({})

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const first = await createLeave(request, emp.id, '2026-05-05', '2026-05-10', 'e2e-first')
      expect(first.status()).toBe(201)
      const firstId = (await first.json()).id as number

      const second = await createLeave(request, emp.id, '2026-05-10', '2026-05-15', 'e2e-second')
      expect(second.status()).toBe(201)

      const update = await request.put(`${SICK_LEAVES}/${firstId}`, {
        data: { end_date: '2026-05-11' },
      })
      expect(update.status()).toBe(409)
    } finally {
      await dispose()
    }
  })

  test('@api sick-leaves: shared boundary day counted once in summary', async ({
    playwright,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const first = await createLeave(request, emp.id, '2026-05-05', '2026-05-10', 'e2e-first')
      expect(first.status()).toBe(201)
      const second = await createLeave(request, emp.id, '2026-05-10', '2026-05-15', 'e2e-second')
      expect(second.status()).toBe(201)

      const summary = await request.get(`${SICK_LEAVES}/stats/employees`, {
        params: { q: emp.name, filter: 'active' },
      })
      expect(summary.status()).toBe(200)

      const rows = (await summary.json()) as Array<{
        employee_id: number
        total_sick_days: number
        sick_leaves_count: number
      }>
      const row = rows.find((r) => r.employee_id === emp.id)
      expect(row).toBeTruthy()
      expect(row!.sick_leaves_count).toBe(2)
      expect(row!.total_sick_days).toBe(11)
    } finally {
      await dispose()
    }
  })
})
