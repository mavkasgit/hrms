/**
 * Smoke: profile modal — канон user-settings 2.0.0.
 *
 * Покрывает в реальном браузере:
 * - read-only ФИО/email (нет input/textarea) + hint про единый профиль;
 * - счётчик «Последние N из N» в сессиях (когда список сессий реально
 *   доступен — OIDC-стек; break-glass отдаёт 400 и панель показывает
 *   ошибку/пустое состояние — это допустимо для аварийного входа);
 * - две SSO-кнопки в «Безопасности» (когда IdP включён на бэкенде).
 *
 * Break Glass (is_break_glass) не создаёт серверные сессии: /auth/sessions
 * возвращает 400 и панель рендерит сообщение об ошибке — приемлемо для
 * emergency auth. Нормальные (OIDC) пользователи видят список + счётчик.
 */
import { test, expect } from '../fixtures/index'
import { LayoutPage } from '../pages/LayoutPage'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Profile canon 2.0.0 @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke profile: ФИО/email read-only + hint единого профиля', async ({
    page,
  }) => {
    const layout = new LayoutPage(page)
    await layout.gotoHome()
    await layout.openProfile()

    const dialog = page.getByRole('dialog')

    // Карточка «Личные данные» с hint про IdP
    await expect(
      dialog.getByRole('heading', { name: 'Личные данные' }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      dialog.getByText(
        'Единый профиль: имя и аватар синхронизируются через IdP для всех приложений.',
      ),
    ).toBeVisible()

    // Поля ФИО и Email присутствуют, но read-only: в разделе профиля
    // нет ни одного редактируемого поля ввода.
    await expect(dialog.getByText('Полное имя')).toBeVisible()
    await expect(dialog.getByText('Email')).toBeVisible()
    await expect(dialog.locator('input, textarea, select')).toHaveCount(0)
  })

  test('@smoke profile: sessions section loads + counter', async ({ page }) => {
    const layout = new LayoutPage(page)
    await layout.gotoHome()
    await layout.openProfileSessions()

    // Settled states: нормальный список, пустое состояние, Break Glass API
    // error или карточка истории. Retries until loading finishes.
    const currentSession = page.getByText('Текущий сеанс')
    const noSessions = page.getByText('Нет активных сессий')
    const sessionsError = page.getByText('Не удалось загрузить активные сессии')
    const historyHeading = page.getByRole('heading', { name: 'История входов' })

    await expect(
      currentSession.or(noSessions).or(sessionsError).or(historyHeading).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Канон: когда список сессий реально отрисован (OIDC-пользователь),
    // счётчик «Последние N из N» обязан быть видимым.
    if (await currentSession.first().isVisible().catch(() => false)) {
      await expect(page.getByText(/Последние \d+ из \d+/)).toBeVisible()
    }
  })

  test('@smoke profile: две SSO-кнопки в «Безопасности» при включённом IdP', async ({
    page,
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let oidcEnabled = false
    try {
      const links = await request.get('/api/auth/me/links')
      if (links.status() === 200) {
        const body = await links.json()
        oidcEnabled = Boolean(body.oidc_enabled)
      }
    } finally {
      await dispose()
    }

    const layout = new LayoutPage(page)
    await layout.gotoHome()
    await layout.openProfile()

    if (!oidcEnabled) {
      test.info().annotations.push({
        type: 'skip',
        description:
          'AUTH_OIDC_ENABLED=false на бэкенде — IdP-кнопки не отрисовываются. Проверка работает на OIDC-стеке.',
      })
      test.skip(true, 'OIDC disabled — SSO buttons not rendered')
    }

    await page.getByRole('button', { name: 'Безопасность' }).click()
    await expect(
      page.getByRole('heading', { name: 'Единый вход (SSO)' }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByRole('button', { name: 'Дашборд SSO' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Открыть настройки входа' }),
    ).toBeVisible()
  })
})
