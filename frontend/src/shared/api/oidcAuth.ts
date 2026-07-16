/**
 * Authentik / OIDC login client (public SPA + PKCE).
 * Dual-run: when GET /auth/oidc/config returns enabled=false, callers hide SSO UI.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api"

const PKCE_VERIFIER_KEY = "hrms_oidc_code_verifier"
const PKCE_STATE_KEY = "hrms_oidc_state"
const PKCE_REDIRECT_URI_KEY = "hrms_oidc_redirect_uri"

export type OidcConfig = {
  enabled: boolean
  authorization_url: string | null
  client_id: string | null
  redirect_uri: string | null
  scopes: string | null
  issuer: string | null
  /** TG1: prefer Telegram SSO CTA; hide in-app bot login modal on LoginPage */
  telegram_primary?: boolean
}

export type OidcLoginResponse = {
  access_token: string
  token_type: string
  username: string
  role: string
  full_name: string
}

export type OidcLogoutUrlResponse = {
  enabled: boolean
  logout_url: string | null
}

/** User-facing RU errors for known OIDC bridge failures. */
export function mapOidcError(status: number, detail: unknown): string {
  const text =
    typeof detail === "string"
      ? detail
      : detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : ""

  if (status === 403) {
    if (text === "oidc_user_not_linked" || text.includes("oidc_user_not_linked")) {
      return "Пользователь не найден в HRMS. Обратитесь к администратору."
    }
    if (text === "no_access" || text.includes("no_access")) {
      return "Нет доступа к системе. Обратитесь к администратору."
    }
    return text || "Доступ запрещён."
  }
  if (status === 401) {
    return text || "Ошибка входа через единый вход. Попробуйте снова."
  }
  if (status === 404) {
    return "Вход через единый вход отключён."
  }
  return text || "Ошибка входа через единый вход."
}

export async function fetchOidcConfig(): Promise<OidcConfig> {
  const response = await fetch(`${API_BASE}/auth/oidc/config`)
  if (!response.ok) {
    // Treat misconfigured/disabled as disabled — keep password login working
    return {
      enabled: false,
      authorization_url: null,
      client_id: null,
      redirect_uri: null,
      scopes: null,
      issuer: null,
      telegram_primary: false,
    }
  }
  return response.json()
}

export async function fetchOidcLogoutUrl(): Promise<OidcLogoutUrlResponse> {
  try {
    const response = await fetch(`${API_BASE}/auth/oidc/logout-url`)
    if (!response.ok) {
      return { enabled: false, logout_url: null }
    }
    return response.json()
  } catch {
    return { enabled: false, logout_url: null }
  }
}

/** Resolve redirect_uri without hardcoding host (localhost vs 127.0.0.1). */
export function resolveOidcRedirectUri(config: OidcConfig): string {
  const fromConfig = (config.redirect_uri || "").trim()
  if (fromConfig) return fromConfig
  return `${window.location.origin}/auth/callback`
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return base64UrlEncode(digest)
}

function storePkce(verifier: string, state: string, redirectUri: string): void {
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  sessionStorage.setItem(PKCE_STATE_KEY, state)
  sessionStorage.setItem(PKCE_REDIRECT_URI_KEY, redirectUri)
}

export function clearPkce(): void {
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(PKCE_STATE_KEY)
  sessionStorage.removeItem(PKCE_REDIRECT_URI_KEY)
}

export function takePkce(): {
  codeVerifier: string | null
  state: string | null
  redirectUri: string | null
} {
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
  const state = sessionStorage.getItem(PKCE_STATE_KEY)
  const redirectUri = sessionStorage.getItem(PKCE_REDIRECT_URI_KEY)
  clearPkce()
  return { codeVerifier, state, redirectUri }
}

/**
 * Build Authentik authorize URL (Auth Code + PKCE S256) and redirect browser.
 * Stores code_verifier + state in sessionStorage for /auth/callback.
 */
export async function startOidcLogin(config: OidcConfig): Promise<void> {
  if (!config.enabled || !config.authorization_url || !config.client_id) {
    throw new Error("Вход через единый вход недоступен")
  }

  const redirectUri = resolveOidcRedirectUri(config)
  const codeVerifier = randomString(32)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const state = randomString(16)
  const scopes = (config.scopes || "openid profile email hrms_access").trim()

  storePkce(codeVerifier, state, redirectUri)

  const url = new URL(config.authorization_url)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.client_id)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("scope", scopes)
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")

  window.location.href = url.toString()
}

/**
 * Exchange authorization code for app JWT via backend bridge.
 * Stores token in localStorage under the same key as password login.
 */
export async function completeOidcCallback(params: {
  code: string
  state?: string | null
}): Promise<OidcLoginResponse> {
  const { codeVerifier, state: storedState, redirectUri } = takePkce()
  if (!codeVerifier) {
    throw new Error("Сессия входа истекла. Начните вход через единый вход заново.")
  }
  if (params.state && storedState && params.state !== storedState) {
    throw new Error("Ошибка проверки state. Начните вход заново.")
  }

  const response = await fetch(`${API_BASE}/auth/oidc/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: params.code,
      code_verifier: codeVerifier,
      state: params.state ?? storedState ?? undefined,
      redirect_uri: redirectUri ?? undefined,
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail = data?.detail ?? data
    throw new Error(mapOidcError(response.status, detail))
  }

  const data = (await response.json()) as OidcLoginResponse
  if (!data.access_token) {
    throw new Error("Сервер не вернул токен доступа")
  }
  localStorage.setItem("token", data.access_token)
  return data
}
