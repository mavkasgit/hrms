import { test, expect } from '../fixtures/index'
import { UsersPage } from '../pages/UsersPage'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Users admin @ui (/users, redirect from /settings/users).
 *
 * Dual-run:
 * - OIDC on: IdP-first layout (Authentik SoT), no local create/invite/delete.
 * - OIDC off: create viewer → generate invite → delete via UI.
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

  test('@ui /users: IdP-first when OIDC, else create → invite → delete', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const oidcOn = await isOidcEnabled(request)
      const usersPage = new UsersPage(page)
      await usersPage.goto()

      if (oidcOn) {
        // POM: Authentik SoT, no «Добавить пользователя», heading «Доступ к HRMS»
        await usersPage.expectIdpFirstLayout()
        // Groups blurb and/or TOKEN empty state may both be on page — assert separately
        // (do not .or() two independent texts: strict mode fails when both match)
        await expect(page.getByText(/hrms-admin/).first()).toBeVisible({ timeout: 10_000 })
        // Empty state when !idp_admin_enabled — optional, both markers can coexist
        const tokenHint = page.getByText(/AUTHENTIK_API_TOKEN/i)
        if ((await tokenHint.count()) > 0) {
          await expect(tokenHint.first()).toBeVisible()
        }
        return
      }

      // ── Local IAM path ──
      await usersPage.expectLocalIamLayout()

      const u = apiOps.uid()
      const empName = `e2e-emp-user-${u}`
      const username = `e2e-u-${u}`

      const employee = await apiOps.createEmployee({ name: empName })
      expect(employee.id).toBeGreaterThan(0)

      let createdUserId: number | undefined

      try {
        const createRespPromise = page.waitForResponse(
          (r) =>
            r.url().includes('/api/users') &&
            !r.url().includes('generate-invite') &&
            r.request().method() === 'POST' &&
            r.status() < 400,
          { timeout: 20_000 }
        )

        await usersPage.openCreateDialog()
        await usersPage.selectEmployeeByName(empName)
        await usersPage.fillUsername(username)
        await usersPage.selectRole('Наблюдатель')
        await usersPage.saveCreate()

        const createResp = await createRespPromise
        const body = (await createResp.json().catch(() => ({}))) as { id?: number }
        if (typeof body.id === 'number') createdUserId = body.id

        await usersPage.expectUserInTable(username)
        await expect(
          usersPage.userRow(username).getByText(/Наблюдатель|Администратор/)
        ).toBeVisible()

        await usersPage.generateInvite(username)

        await usersPage.deleteUser(username)
        await usersPage.expectUserNotInTable(username)
        createdUserId = undefined

        const listResp = await request.get('/api/users')
        expect(listResp.ok()).toBeTruthy()
        const list = (await listResp.json()) as Array<{ username?: string }>
        expect(list.some((x) => x.username === username)).toBe(false)
      } finally {
        if (createdUserId != null) {
          await request.delete(`/api/users/${createdUserId}`).catch(() => {})
        } else {
          const listResp = await request.get('/api/users').catch(() => null)
          if (listResp?.ok()) {
            const list = (await listResp.json()) as Array<{
              id?: number
              username?: string
            }>
            const found = list.find((x) => x.username === username)
            if (found?.id) {
              await request.delete(`/api/users/${found.id}`).catch(() => {})
            }
          }
        }
      }
    } finally {
      await dispose()
    }
  })
})
