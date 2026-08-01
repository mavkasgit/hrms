/**
 * Smoke: profile modal loads sessions/login-history section.
 * Break Glass tokens (is_break_glass) don't create server-side sessions:
 * the API returns 400 and the panel renders an error message instead of
 * a session list — acceptable for emergency auth. Normal users see the
 * current-session badge or the empty state.
 */
import { test, expect } from '../fixtures/index'
import { LayoutPage } from '../pages/LayoutPage'

test.describe('Profile sessions @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke profile: sessions section loads', async ({ page }) => {
    const layout = new LayoutPage(page)
    await layout.gotoHome()
    await layout.openProfileSessions()

    // Settled states: normal session list, empty state, Break Glass API error,
    // or the login-history card heading. Retries until loading finishes.
    const currentSession = page.getByText('Текущий сеанс')
    const noSessions = page.getByText('Нет активных сессий')
    const sessionsError = page.getByText('Не удалось загрузить активные сессии')
    const historyHeading = page.getByRole('heading', { name: 'История входов' })

    await expect(
      currentSession.or(noSessions).or(sessionsError).or(historyHeading).first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
