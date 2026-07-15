import { test, expect } from '../fixtures/index'
import { UsersPage } from '../pages/UsersPage'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Settings users @ui:
 * create viewer linked to employee → generate invite → delete via UI.
 *
 * Seed employee via apiOps; user cleanup via UI delete + residual API DELETE.
 * No Telegram Bot, no admin protection (covered by pytest).
 */
test.describe('Settings users @ui', () => {
  test.setTimeout(60_000)

  test('@ui settings/users: create viewer → invite → delete', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-emp-user-${u}`
    const username = `e2e-u-${u}`

    const employee = await apiOps.createEmployee({ name: empName })
    expect(employee.id).toBeGreaterThan(0)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let createdUserId: number | undefined

    try {
      // Intercept create to track id for residual cleanup
      const createRespPromise = page.waitForResponse(
        (r) =>
          r.url().includes('/api/users') &&
          !r.url().includes('generate-invite') &&
          r.request().method() === 'POST' &&
          r.status() < 400,
        { timeout: 20_000 }
      )

      const usersPage = new UsersPage(page)
      await usersPage.goto()

      await usersPage.openCreateDialog()
      await usersPage.selectEmployeeByName(empName)
      // Employee select auto-fills transliterated login — override to unique e2e username
      await usersPage.fillUsername(username)
      await usersPage.selectRole('Наблюдатель')
      await usersPage.saveCreate()

      const createResp = await createRespPromise
      const body = (await createResp.json().catch(() => ({}))) as { id?: number }
      if (typeof body.id === 'number') createdUserId = body.id

      await usersPage.expectUserInTable(username)
      await expect(usersPage.userRow(username).getByText('Наблюдатель')).toBeVisible()

      await usersPage.generateInvite(username)

      await usersPage.deleteUser(username)
      await usersPage.expectUserNotInTable(username)
      createdUserId = undefined

      // Confirm gone from API list
      const listResp = await request.get('/api/users')
      expect(listResp.ok()).toBeTruthy()
      const list = (await listResp.json()) as Array<{ username?: string }>
      expect(list.some((x) => x.username === username)).toBe(false)
    } finally {
      if (createdUserId != null) {
        await request.delete(`/api/users/${createdUserId}`).catch(() => {})
      } else {
        // Fallback by username if create intercept missed id
        const listResp = await request.get('/api/users').catch(() => null)
        if (listResp?.ok()) {
          const list = (await listResp.json()) as Array<{ id?: number; username?: string }>
          const found = list.find((x) => x.username === username)
          if (found?.id) {
            await request.delete(`/api/users/${found.id}`).catch(() => {})
          }
        }
      }
      await dispose()
    }
  })
})
