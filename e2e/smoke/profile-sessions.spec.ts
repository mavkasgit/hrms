/**
 * Smoke: profile modal shows real active sessions + login history section.
 * Requires storageState admin (setup) with form login → JWT sid + server session.
 */
import { test, expect } from '../fixtures/index'
import { LayoutPage } from '../pages/LayoutPage'

test.describe('Profile sessions @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke profile: active sessions list and login history', async ({
    page,
  }) => {
    const layout = new LayoutPage(page)
    await layout.gotoHome()
    await layout.openProfileSessions()

    // Wait until loading spinner for sessions disappears (if present)
    const loading = page.getByText('Загрузка сессий...')
    await loading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {
      /* may never appear if fetch is fast */
    })

    // Must not stay on empty-only state when API works after real login
    await expect(page.getByText('Нет активных сессий')).toHaveCount(0)

    // At least one session card: current badge and/or device-ish label
    await expect(page.getByText('Текущий сеанс')).toBeVisible({
      timeout: 10_000,
    })

    // History section heading
    await expect(page.getByRole('heading', { name: 'Входы' })).toBeVisible()
  })
})
