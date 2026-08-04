/**
 * @api Контракт /auth/me/* (единый префикс настроек профиля).
 *
 * Проверяет каноничные пути (T3 #40) + refresh=1 (T4 #41). Старые пути
 * миграции удалены → 404.
 *
 * Примечание: e2e-admin входит через break-glass, поэтому PATCH профиля/
 * аватара и /login-events недоступны по замыслу (400) — здесь только
 * read-контракт и удаление старых путей.
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Profile contract @api', () => {
  test.setTimeout(20_000)

  test('@api /auth/me отдаёт профиль и принимает refresh=1', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const me = await request.get('/api/auth/me')
      expect(me.status()).toBe(200)
      const body = await me.json()
      expect(typeof body.username).toBe('string')
      expect(typeof body.full_name).toBe('string')
      expect(typeof body.role).toBe('string')

      const refreshed = await request.get('/api/auth/me?refresh=1')
      expect(refreshed.status()).toBe(200)
      const refreshedBody = await refreshed.json()
      expect(refreshedBody.username).toBe(body.username)
    } finally {
      await dispose()
    }
  })

  test('@api /auth/me/links возвращает deep-links', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const links = await request.get('/api/auth/me/links')
      expect(links.status()).toBe(200)
      const body = await links.json()
      expect(typeof body.oidc_enabled).toBe('boolean')
      expect('user_settings_url' in body).toBe(true)
    } finally {
      await dispose()
    }
  })

  test('@api старые пути миграции удалены (404)', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const profile = await request.patch('/api/users/me/profile', {
        data: { full_name: 'e2e-x' },
      })
      expect(profile.status()).toBe(404)

      const avatar = await request.patch('/api/users/me/avatar', {
        data: { avatar_seed: 'e2e-seed' },
      })
      expect(avatar.status()).toBe(404)
    } finally {
      await dispose()
    }
  })
})
