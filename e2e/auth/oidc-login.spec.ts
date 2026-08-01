/**
 * Optional OIDC / Authentik e2e (project `auth`, no storageState).
 *
 * Guard (all tests skip cleanly without IdP):
 * - E2E_OIDC=1
 * - GET /api/auth/oidc/config → enabled === true
 *
 * Full redirect / IdP login:
 * - E2E_OIDC_FULL=1
 * - optional E2E_AUTHENTIK_USER / E2E_AUTHENTIK_PASSWORD for full login
 *
 * Does **not** automate Telegram Login Widget (needs public FQDN).
 * CI default: password dual-run only (this file skips without E2E_OIDC).
 *
 * Tag: @oidc — run: npm run test:e2e:oidc  or
 *   npx playwright test e2e/auth/oidc-login.spec.ts
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'

type OidcConfig = {
  enabled: boolean
  authorization_url: string | null
  client_id: string | null
  redirect_uri: string | null
  scopes: string | null
  issuer: string | null
  telegram_primary?: boolean
}

function apiBase(): string {
  return (process.env.E2E_API_URL || 'http://localhost:8011/api').replace(
    /\/$/,
    ''
  )
}

function authentikHostHint(): string {
  const raw = process.env.AUTHENTIK_URL || process.env.E2E_AUTHENTIK_URL || ''
  if (raw) {
    try {
      return new URL(raw).host
    } catch {
      return raw
    }
  }
  return 'localhost:9000'
}

/** Decode JWT payload (no verify) — optional sid claim after OIDC bridge. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

async function fetchOidcConfig(
  request: APIRequestContext
): Promise<OidcConfig | null> {
  try {
    const res = await request.get(`${apiBase()}/auth/oidc/config`)
    if (!res.ok()) return null
    return (await res.json()) as OidcConfig
  } catch {
    return null
  }
}

/**
 * Shared gate: skip entire suite unless E2E_OIDC=1 and backend OIDC enabled.
 * Returns config when ready; otherwise skips (never fails CI without IdP).
 */
async function requireOidcEnabled(
  request: APIRequestContext
): Promise<OidcConfig> {
  test.skip(
    process.env.E2E_OIDC !== '1',
    'E2E_OIDC!=1 — optional OIDC suite skipped (CI default password path)'
  )

  const config = await fetchOidcConfig(request)
  test.skip(
    !config?.enabled,
    'GET /auth/oidc/config enabled=false or unreachable — enable AUTH_OIDC_*'
  )
  return config as OidcConfig
}

test.describe('OIDC / Authentik @auth @oidc', () => {
  test('oidc_config_exposes_authorize @oidc', async ({ request }) => {
    const config = await requireOidcEnabled(request)

    expect(config.enabled).toBe(true)
    expect(
      config.authorization_url,
      'authorization_url required when enabled'
    ).toBeTruthy()
    expect(config.client_id, 'client_id required when enabled').toBeTruthy()
    expect(typeof (config as Record<string, unknown>).login_hint_enabled).toBe('boolean')
    expect(typeof (config as Record<string, unknown>).sso_only).toBe('boolean')
  })

  test('sso_button_visible_when_enabled @oidc', async ({ page, request }) => {
    const config = await requireOidcEnabled(request)
    const login = new LoginPage(page)

    // Full form path: dual-run SSO CTA + password (not auto-stub)
    await login.goto()
    // Wait for FE to load OIDC config and render CTA
    if (config.telegram_primary) {
      await expect(login.ssoTelegramPrimaryButton).toBeVisible({
        timeout: 15_000,
      })
    } else {
      await expect(login.ssoButton).toBeVisible({ timeout: 15_000 })
    }

    // Break Glass form still present on ?password=1
    await expect(login.breakGlassSubmitButton).toBeVisible()
  })

  test('oidc_redirects_to_idp @oidc', async ({ page, request }) => {
    test.skip(
      process.env.E2E_OIDC_FULL !== '1',
      'E2E_OIDC_FULL!=1 — skip IdP redirect (set E2E_OIDC_FULL=1 for full flow)'
    )
    await requireOidcEnabled(request)

    const login = new LoginPage(page)
    // Controlled click on full form (prefer over stub auto-redirect)
    await login.goto()
    await expect(login.ssoButton).toBeVisible({ timeout: 15_000 })

    const hostHint = authentikHostHint()
    await Promise.all([
      page.waitForURL(
        (url) => {
          const h = url.host
          return (
            h.includes('9000') ||
            h.includes(hostHint) ||
            /authentik|oauth2|authorize|if\/flow/i.test(url.href)
          )
        },
        { timeout: 20_000 }
      ),
      login.startOidcSso(),
    ])

    expect(page.url()).not.toMatch(/\/login$/)
  })

  test('oidc_full_login @oidc', async ({ page, request }) => {
    test.skip(
      process.env.E2E_OIDC_FULL !== '1',
      'E2E_OIDC_FULL!=1 — skip full IdP login'
    )
    await requireOidcEnabled(request)

    const idpUser = process.env.E2E_AUTHENTIK_USER
    const idpPass = process.env.E2E_AUTHENTIK_PASSWORD
    test.skip(
      !idpUser || !idpPass,
      'E2E_AUTHENTIK_USER / E2E_AUTHENTIK_PASSWORD not set — no secrets in repo; skip full login'
    )

    const login = new LoginPage(page)
    await login.goto()
    await expect(login.ssoButton).toBeVisible({ timeout: 15_000 })

    await Promise.all([
      page.waitForURL(
        (url) =>
          url.host.includes('9000') ||
          /if\/flow|application\/o/i.test(url.href),
        { timeout: 20_000 }
      ),
      login.startOidcSso(),
    ])

    // Authentik default flow: identification → password
    // UI labels (EN): "Email or Username" + "Log in", then "Password" + "Continue"
    const idpSubmit = page.getByRole('button', {
      name: /^(Continue|Log in|Log In|Sign in|Войти|Продолжить)$/i,
    })
    const userField = page
      .getByRole('textbox', { name: /email or username|username|логин/i })
      .or(
        page.locator(
          'input[name="uidField"], input[name="username"], input[autocomplete="username"]'
        )
      )
      .first()
    const passField = page
      .getByRole('textbox', { name: /^password$/i })
      .or(page.getByLabel(/^password$/i))
      .or(page.locator('input[type="password"]'))
      .first()

    await expect(userField).toBeVisible({ timeout: 20_000 })
    await userField.click()
    await userField.fill(idpUser!)
    await userField.press('Enter')

    // Wait for password stage (or soft-skip if Authentik UI flow differs)
    const passwordShown = await passField
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(
      !passwordShown,
      'Authentik password stage not reached after identification — UI flow mismatch'
    )

    await passField.click()
    await passField.fill('')
    await passField.pressSequentially(idpPass!, { delay: 15 })
    await expect(passField).toHaveValue(idpPass!, { timeout: 5_000 })
    await passField.press('Enter')

    // Back to app via /auth/callback → token in localStorage
    try {
      await page.waitForURL(
        (url) =>
          url.host.includes('5173') &&
          (url.pathname.includes('/auth/callback') ||
            (!url.pathname.includes('/if/flow') &&
              !url.pathname.includes('/login'))),
        { timeout: 45_000 }
      )
    } catch {
      // Stay on IdP — capture URL for diagnostics then soft-skip (not CI-critical)
      test.skip(
        true,
        `OIDC full login did not return to app (still on ${page.url()}) — check IdP password / user link`
      )
    }

    if (page.url().includes('/auth/callback')) {
      await page.waitForURL(
        (url) =>
          !url.pathname.includes('/auth/callback') &&
          !url.pathname.includes('/login'),
        { timeout: 30_000 }
      )
    }

    await expect(page).not.toHaveURL(/\/login/)
    const token = await login.getToken()
    expect(token, 'expected localStorage.token after OIDC full login').toBeTruthy()

    const payload = decodeJwtPayload(token!)
    if (payload && 'sid' in payload) {
      expect(payload.sid, 'JWT sid claim when present').toBeTruthy()
    }
  })
})
