import { test, expect } from '../fixtures/index'
import { UsersPage } from '../pages/UsersPage'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Users admin @ui (/users) после удаления админ-IAM (#35).
 *
 * Локальной таблицы и CRUD нет:
 * - OIDC on: карточка «Управление — в IdP» со ссылками на админку Authentik.
 * - OIDC off: заглушка-предупреждение.
 * Эндпоинты создания/редактирования/удаления/инвайтов удалены (404).
 */
async function isOidcEnabled(request: {
  get: (url: string) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>
}): Promise<boolean> {
  try {
    const res = await request.get('/api/auth/oidc/config')
    if (!res.ok()) return false
    const body = (await res.json()) as { enabled?: boolean }
    return Boolean(body.enabled)
  } catch {
    return false
  }
}

test.describe('Users admin @ui', () => {
  test.setTimeout(60_000)

  test('@ui /users: IdP links when OIDC, else warning stub', async ({
    page,
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const oidcOn = await isOidcEnabled(request)
      const usersPage = new UsersPage(page)
      await usersPage.goto()

      if (oidcOn) {
        await usersPage.expectIdpFirstLayout()
      } else {
        await usersPage.expectOidcOffWarning()
      }

      // Админ-IAM удалён: write-эндпоинты /users отдают 404
      const postResp = await request.post('/api/users', {
        data: { username: 'e2e-removed-user' },
      })
      expect(postResp.status()).toBe(404)

      const listResp = await request.get('/api/users')
      expect(listResp.status()).toBe(404)

      const inviteResp = await request.post('/api/users/1/generate-invite')
      expect(inviteResp.status()).toBe(404)
    } finally {
      await dispose()
    }
  })
})
