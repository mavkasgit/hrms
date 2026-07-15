/**
 * Timesheet API contracts (legacy timesheet-api).
 * Note: /api/shift-types does NOT exist — shift types live in backend code catalog.
 * Only real HTTP endpoints are covered here.
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Timesheet API @api', () => {
  test.setTimeout(30_000)

  test('@api GET /api/timesheet returns period structure', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.get('/api/timesheet', {
        params: { period_start: '2099-01-01', period_end: '2099-01-31' },
      })
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      expect(data.period_start).toBe('2099-01-01')
      expect(data.period_end).toBe('2099-01-31')
      expect(Array.isArray(data.employees)).toBe(true)
    } finally {
      await dispose()
    }
  })

  test('@api GET /api/timesheet/grid returns period structure', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.get('/api/timesheet/grid', {
        params: { period_start: '2099-01-01', period_end: '2099-01-31' },
      })
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      expect(data.period_start).toBe('2099-01-01')
      expect(data.period_end).toBe('2099-01-31')
      expect(Array.isArray(data.employees)).toBe(true)
    } finally {
      await dispose()
    }
  })

  test('@api GET /api/work-schedules accepts year/month', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.get('/api/work-schedules', {
        params: { year: 2099, month: 1 },
      })
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      expect(Array.isArray(data.items)).toBe(true)
    } finally {
      await dispose()
    }
  })

  test('@api GET /api/timesheet/imports returns list', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.get('/api/timesheet/imports')
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      expect(Array.isArray(data.items)).toBe(true)
    } finally {
      await dispose()
    }
  })

  test('@api POST /api/timesheet/imports/preview rejects non-xlsx', async ({
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.post('/api/timesheet/imports/preview', {
        multipart: {
          file: {
            name: 'test.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('plain text'),
          },
        },
      })
      expect(resp.status()).toBe(400)
    } finally {
      await dispose()
    }
  })
})
