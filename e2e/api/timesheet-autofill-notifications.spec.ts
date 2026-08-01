/**
 * API contracts: автозаполнение по турникету (#16) и внутренние уведомления (#18).
 * Полная бизнес-логика покрыта backend-тестами (test_turnstile_autofill.py,
 * test_internal_notifications.py); здесь — HTTP-контракты.
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Turnstile autofill + internal notifications @api', () => {
  test.setTimeout(30_000)

  test('@api POST /api/timesheet/autofill dry_run returns counts', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.post('/api/timesheet/autofill', {
        data: {
          period_start: '2099-01-01',
          period_end: '2099-01-31',
          dry_run: true,
        },
      })
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      expect(typeof data.applied).toBe('number')
      expect(typeof data.skipped_no_pass).toBe('number')
      expect(typeof data.skipped_manual).toBe('number')
      expect(data.dry_run).toBe(true)
      expect(Array.isArray(data.results)).toBe(true)
    } finally {
      await dispose()
    }
  })

  test('@api POST /api/timesheet/autofill rejects inverted period', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.post('/api/timesheet/autofill', {
        data: {
          period_start: '2099-01-31',
          period_end: '2099-01-01',
        },
      })
      expect(resp.status()).toBe(400)
    } finally {
      await dispose()
    }
  })

  test('@api GET /api/internal-notifications returns empty list', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.get('/api/internal-notifications')
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      expect(Array.isArray(data.items)).toBe(true)
      expect(typeof data.unread_count).toBe('number')
    } finally {
      await dispose()
    }
  })

  test('@api POST /api/internal-notifications/{id}/close 404 for unknown', async ({
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const resp = await request.post('/api/internal-notifications/999999/close')
      expect(resp.status()).toBe(404)
    } finally {
      await dispose()
    }
  })
})
