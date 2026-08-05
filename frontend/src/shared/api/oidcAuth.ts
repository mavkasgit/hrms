/**
 * Authentik / OIDC login client (public SPA + PKCE).
 * Dual-run: when GET /auth/oidc/config returns enabled=false, callers hide SSO UI.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api"

const PKCE_VERIFIER_KEY = "hrms_oidc_code_verifier"
const PKCE_STATE_KEY = "hrms_oidc_state"
const PKCE_REDIRECT_URI_KEY = "hrms_oidc_redirect_uri"
/** Loop guard: at most one auto re-authorize after recoverable callback failure */
const OIDC_RELOGIN_ONCE_KEY = "hrms_oidc_relogin_once"

export type OidcConfig = {
  enabled: boolean
  authorization_url: string | null
  client_id: string | null
  redirect_uri: string | null
  scopes: string | null
  issuer: string | null
  login_hint_enabled?: boolean
  sso_only?: boolean
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

/** Structured OIDC/SSO error for UI (title + plain-language message). */
export type OidcErrorInfo = {
  /** Short heading, e.g. «Нет учётной записи» */
  title: string
  /** What happened and what to do next */
  message: string
  /** Machine code for support (optional, shown muted) */
  code?: string
  httpStatus?: number
}

export class OidcAuthError extends Error {
  readonly title: string
  readonly code?: string
  readonly httpStatus?: number

  constructor(info: OidcErrorInfo) {
    super(info.message)
    this.name = "OidcAuthError"
    this.title = info.title
    this.code = info.code
    this.httpStatus = info.httpStatus
  }

  static fromInfo(info: OidcErrorInfo): OidcAuthError {
    return new OidcAuthError(info)
  }
}

/** Normalize FastAPI `detail` (string | {msg} | array | nested). */
export function extractOidcDetail(detail: unknown): string {
  if (detail == null) return ""
  if (typeof detail === "string") return detail.trim()
  if (typeof detail === "number" || typeof detail === "boolean") return String(detail)
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg)
        }
        return ""
      })
      .filter(Boolean)
      .join("; ")
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>
    if (typeof o.detail === "string") return o.detail.trim()
    if (typeof o.code === "string") return o.code.trim()
    if (typeof o.message === "string") return o.message.trim()
    if (typeof o.error === "string") return o.error.trim()
    try {
      return JSON.stringify(detail)
    } catch {
      return ""
    }
  }
  return ""
}

/**
 * User-facing RU errors for known OIDC bridge / IdP failures.
 * Prefer specific title+message over raw English codes.
 */
export function mapOidcError(status: number, detail: unknown): OidcErrorInfo {
  const text = extractOidcDetail(detail)
  const lower = text.toLowerCase()
  const code = text || undefined

  const known: Array<{ match: (t: string) => boolean; info: Omit<OidcErrorInfo, "httpStatus"> }> = [
    {
      match: (t) => t === "oidc_user_not_linked" || t.includes("oidc_user_not_linked"),
      info: {
        title: "Нет учётной записи в HRMS",
        message:
          "Вход в единый IdP прошёл успешно, но этот пользователь не привязан к HRMS. " +
          "Обратитесь к администратору: нужно создать пользователя в HRMS или связать " +
          "аккаунт (authentik_sub / тот же логин) либо включить автосоздание (JIT).",
        code: "oidc_user_not_linked",
      },
    },
    {
      match: (t) => t === "no_access" || t.includes("no_access"),
      info: {
        title: "Нет доступа к HRMS",
        message:
          "Учётная запись есть, но нет роли доступа (нужна группа hrms-admin или hrms-viewer в IdP). " +
          "Попросите администратора добавить вас в группу.",
        code: "no_access",
      },
    },
    {
      match: (t) => t === "invalid_oidc_code" || t.includes("invalid_oidc_code"),
      info: {
        title: "Код входа недействителен",
        message:
          "Код авторизации от IdP истёк или уже использован. Закройте вкладку и начните вход заново.",
        code: "invalid_oidc_code",
      },
    },
    {
      match: (t) =>
        t.includes("invalid_id_token") ||
        t === "invalid_id_token_key" ||
        t === "invalid_id_token_sub",
      info: {
        title: "Ошибка проверки токена IdP",
        message:
          "Не удалось проверить id_token (ключ, подпись или срок). Проверьте issuer/JWKS и время на серверах.",
        code: text || "invalid_id_token",
      },
    },
    {
      match: (t) => t.includes("token endpoint") || t.includes("token response"),
      info: {
        title: "IdP не выдал токен",
        message:
          "Обмен кода на токен не удался. Проверьте client_id, redirect_uri, PKCE и grant_types у приложения OIDC.",
        code: text || "oidc_token_error",
      },
    },
    {
      match: (t) => t.includes("disabled") || t.includes("OIDC login disabled"),
      info: {
        title: "Единый вход выключен",
        message: "OIDC отключён на сервере (AUTH_OIDC_ENABLED). Войдите другим способом или включите SSO.",
        code: "oidc_disabled",
      },
    },
    {
      match: (t) => t.includes("redirect_uri"),
      info: {
        title: "Неверный адрес возврата",
        message:
          "redirect_uri не совпадает с allow-list в IdP. Должен быть точный URL, например http://localhost:5171/auth/callback.",
        code: text || "redirect_uri",
      },
    },
    {
      match: (t) => t.includes("issuer not configured") || t.includes("client_id not configured"),
      info: {
        title: "SSO не настроен",
        message: "На сервере HRMS не заданы параметры OIDC (issuer / client_id). Проверьте .env.",
        code: text || "oidc_config",
      },
    },
  ]

  for (const row of known) {
    if (row.match(lower) || row.match(text)) {
      return { ...row.info, httpStatus: status }
    }
  }

  if (status === 403) {
    return {
      title: "Доступ запрещён",
      message: text
        ? `Сервер отклонил вход: ${text}`
        : "Сервер отклонил вход (403). Обратитесь к администратору.",
      code,
      httpStatus: status,
    }
  }
  if (status === 401) {
    return {
      title: "Ошибка авторизации",
      message: text
        ? `Не удалось завершить вход: ${text}. Попробуйте снова.`
        : "Не удалось завершить вход через единый вход. Попробуйте снова.",
      code,
      httpStatus: status,
    }
  }
  if (status === 404) {
    return {
      title: "Единый вход недоступен",
      message: "Эндпоинт OIDC не найден или вход через IdP отключён.",
      code: "oidc_not_found",
      httpStatus: status,
    }
  }
  if (status === 503 || status === 502) {
    return {
      title: "Сервис недоступен",
      message: "IdP или API временно недоступны. Подождите и попробуйте снова.",
      code,
      httpStatus: status,
    }
  }

  return {
    title: "Не удалось войти",
    message: text || `Ошибка входа через единый вход (HTTP ${status || "?"}).`,
    code,
    httpStatus: status,
  }
}

/** Map IdP redirect query ?error=&error_description= to RU. */
export function mapIdpRedirectError(error: string, description: string | null): OidcErrorInfo {
  const err = (error || "").toLowerCase()
  const desc = (description || "").trim()
  const descLower = desc.toLowerCase()

  if (err === "access_denied") {
    return {
      title: "Вход отменён",
      message: desc || "Вы отменили вход в IdP или доступ к приложению запрещён политикой.",
      code: error,
    }
  }
  if (
    err === "invalid_request" ||
    descLower.includes("malformed") ||
    descLower.includes("otherwise malformed")
  ) {
    return {
      title: "Некорректный запрос к IdP",
      message:
        (desc ? `${desc}. ` : "") +
        "Частые причины: у OAuth-провайдера не включён grant authorization_code, " +
        "неверный redirect_uri или client_id. Проверьте настройки приложения hrms в Authentik.",
      code: error || "invalid_request",
    }
  }
  if (err === "unauthorized_client") {
    return {
      title: "Клиент не разрешён",
      message:
        desc ||
        "IdP отклонил client_id (тип клиента, grant types или redirect). Проверьте provider HRMS.",
      code: error,
    }
  }
  if (err === "login_required" || err === "interaction_required") {
    return {
      title: "Нужен повторный вход",
      message: desc || "Сессия IdP истекла. Начните вход заново.",
      code: error,
    }
  }
  if (err === "server_error" || err === "temporarily_unavailable") {
    return {
      title: "Ошибка IdP",
      message: desc || "Сервер единого входа временно недоступен. Попробуйте позже.",
      code: error,
    }
  }

  return {
    title: "Ошибка IdP",
    message: desc || `IdP вернул ошибку: ${error}`,
    code: error,
  }
}

export async function fetchOidcConfig(): Promise<OidcConfig> {
  const response = await fetch(`${API_BASE}/auth/oidc/config`)
  if (!response.ok) {
    // Treat misconfigured/disabled as disabled — break-glass login remains available
    return {
      enabled: false,
      authorization_url: null,
      client_id: null,
      redirect_uri: null,
      scopes: null,
      issuer: null,
    }
  }
  return response.json()
}

/** localStorage key: OIDC id_token for Authentik end-session (id_token_hint).
 *  localStorage (not sessionStorage): id_token must be readable from any tab,
 *  e.g. when the app is opened in a new tab via the Authentik dashboard tile —
 *  sessionStorage is per-tab, so logout there would lose the hint and land on
 *  Authentik's own "Logout successful" page instead of the app /login.
 */
export const OIDC_ID_TOKEN_KEY = "hrms_oidc_id_token"

export function storeOidcIdToken(idToken: string | null | undefined): void {
  try {
    if (idToken) {
      localStorage.setItem(OIDC_ID_TOKEN_KEY, idToken)
    } else {
      localStorage.removeItem(OIDC_ID_TOKEN_KEY)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearOidcIdToken(): void {
  storeOidcIdToken(null)
}

export async function fetchOidcLogoutUrl(): Promise<OidcLogoutUrlResponse> {
  try {
    // Authentik requires id_token_hint together with post_logout_redirect_uri
    // when logout redirect URIs are registered on the provider.
    let idToken: string | null = null
    try {
      idToken = localStorage.getItem(OIDC_ID_TOKEN_KEY)
    } catch {
      idToken = null
    }
    const qs = new URLSearchParams()
    if (idToken) {
      qs.set("id_token_hint", idToken)
      try {
        if (typeof window !== "undefined" && window.location?.origin) {
          qs.set("post_logout_redirect_uri", `${window.location.origin}/login?logout=1`)
        }
      } catch {
        /* ignore */
      }
    }
    const q = qs.toString()
    const response = await fetch(
      `${API_BASE}/auth/oidc/logout-url${q ? `?${q}` : ""}`,
    )
    if (!response.ok) {
      return { enabled: false, logout_url: null }
    }
    const data = (await response.json()) as OidcLogoutUrlResponse
    // Consume hint after building URL (one-shot logout)
    if (idToken) {
      clearOidcIdToken()
    }
    return data
  } catch {
    return { enabled: false, logout_url: null }
  }
}

/**
 * Resolve redirect_uri from the page origin (LAN IP / localhost / hostname).
 * Prefer window.location so both dev (:5171) and prod (:8081) work without
 * hardcoding — Authentik allow-list must include both ports × hosts.
 */
export function resolveOidcRedirectUri(config: OidcConfig): string {
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/auth/callback`
    }
  } catch {
    /* ignore */
  }
  const fromConfig = (config.redirect_uri || "").trim()
  if (fromConfig) return fromConfig
  return "/auth/callback"
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Align IdP authorize URL host with the page host.
 * Config may say localhost:9000 while SPA is opened as http://192.168.x.x:8081 —
 * rewrite to the LAN IP so cookies and redirects stay on the same host.
 */
export function resolveAuthorizationUrl(authorizationUrl: string): string {
  try {
    const u = new URL(authorizationUrl)
    const pageHost = window.location.hostname
    if (!pageHost) return authorizationUrl
    if (!LOOPBACK_HOSTS.has(pageHost) && LOOPBACK_HOSTS.has(u.hostname)) {
      u.hostname = pageHost
      return u.toString()
    }
    return authorizationUrl
  } catch {
    return authorizationUrl
  }
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
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return base64UrlEncode(bytes)
}

/**
 * Pure JS SHA-256 (for non-secure contexts where crypto.subtle is missing).
 * HTTP on a LAN IP is not a Secure Context → SubtleCrypto.digest is undefined.
 */
function sha256Bytes(message: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  const bitLen = message.length * 8
  const withPad = message.length + 1 + 8
  const totalLen = (withPad + 63) & ~63
  const buf = new Uint8Array(totalLen)
  buf.set(message)
  buf[message.length] = 0x80
  const view = new DataView(buf.buffer)
  // length in bits as 64-bit big-endian (high 32 always 0 for SPA sizes)
  view.setUint32(totalLen - 4, bitLen >>> 0, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let i = 0; i < totalLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false)
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3)
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10)
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false)
  outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false)
  outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false)
  outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false)
  outView.setUint32(28, h7, false)
  return out
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain)
  // Secure Context (https / localhost): WebCrypto. HTTP + LAN IP → pure JS.
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const digest = await crypto.subtle.digest("SHA-256", data)
    return base64UrlEncode(digest)
  }
  return base64UrlEncode(sha256Bytes(data))
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

export type StartOidcLoginOptions = {
  /**
   * Force interactive re-auth at IdP (overwrite SSO session / tokens).
   * Uses OIDC `prompt=login` + `max_age=0` (MSAL / Auth0 / oidc-client pattern).
   */
  forceReauth?: boolean
  /** Optional pre-filled username/email for Authentik identification step */
  loginHint?: string
}

/** Policy / config failures — show error card, do not auto-retry. */
const NON_RECOVERABLE_OIDC_CODES = new Set([
  "oidc_user_not_linked",
  "no_access",
  "user_disabled",
  "access_denied",
  "consent_required",
  "interaction_required",
  "oidc_disabled",
  "oidc_not_found",
  "oidc_config",
])

/**
 * Recoverable token/session failures → clear local state and re-login once
 * (invalid_grant terminal for current code; re-auth only — RFC 6749 / SPA SDKs).
 */
export function isRecoverableOidcFailure(
  code?: string,
  httpStatus?: number,
): boolean {
  if (code && NON_RECOVERABLE_OIDC_CODES.has(code)) return false
  if (code && NON_RECOVERABLE_OIDC_CODES.has(code.toLowerCase())) return false
  const recoverable = new Set([
    "invalid_id_token",
    "invalid_id_token_key",
    "invalid_id_token_sub",
    "invalid_oidc_code",
    "invalid_oidc_token_response",
    "missing_access_token",
    "pkce_missing",
    "state_mismatch",
    "missing_code",
    "oidc_token_error",
  ])
  if (code) {
    const c = code.toLowerCase()
    if (recoverable.has(c) || [...recoverable].some((r) => c.includes(r))) {
      return true
    }
  }
  if (httpStatus === 502 || httpStatus === 503) return true
  if (httpStatus === 401 && (!code || !NON_RECOVERABLE_OIDC_CODES.has(code))) {
    return true
  }
  return false
}

/** Drop app JWT leftovers so re-login overwrites session cleanly. */
export function clearAppAuthTokens(): void {
  try {
    localStorage.removeItem("token")
  } catch {
    /* ignore */
  }
  try {
    document.cookie = "token=; path=/; max-age=0"
  } catch {
    /* ignore */
  }
}

export function clearOidcReloginGuard(): void {
  try {
    sessionStorage.removeItem(OIDC_RELOGIN_ONCE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * If recoverable failure and auto-retry not used yet: clear tokens/PKCE,
 * strip callback query, start authorize with prompt=login (≤1 auto attempt).
 * Returns true if browser is navigating away.
 */
export async function tryForceOidcRelogin(info: {
  code?: string
  httpStatus?: number
}): Promise<boolean> {
  if (!isRecoverableOidcFailure(info.code, info.httpStatus)) return false
  let already = false
  try {
    already = sessionStorage.getItem(OIDC_RELOGIN_ONCE_KEY) === "1"
  } catch {
    already = false
  }
  if (already) return false

  try {
    sessionStorage.setItem(OIDC_RELOGIN_ONCE_KEY, "1")
  } catch {
    /* ignore */
  }

  clearPkce()
  clearAppAuthTokens()

  // Process callback once: drop code/state/error from URL (next-auth / MSAL style)
  try {
    window.history.replaceState({}, document.title, "/auth/callback")
  } catch {
    /* ignore */
  }

  const config = await fetchOidcConfig()
  if (!config.enabled || !config.authorization_url || !config.client_id) {
    clearOidcReloginGuard()
    return false
  }
  await startOidcLogin(config, { forceReauth: true })
  return true
}

/**
 * Build Authentik authorize URL (Auth Code + PKCE S256) and redirect browser.
 * Stores code_verifier + state in sessionStorage for /auth/callback.
 */
export async function startOidcLogin(
  config: OidcConfig,
  options: StartOidcLoginOptions = {},
): Promise<void> {
  if (!config.enabled || !config.authorization_url || !config.client_id) {
    throw new Error("Вход через единый вход недоступен")
  }

  const redirectUri = resolveOidcRedirectUri(config)
  const codeVerifier = randomString(32)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const state = randomString(16)
  const scopes = (config.scopes || "openid profile email hrms_access").trim()

  storePkce(codeVerifier, state, redirectUri)

  const url = new URL(resolveAuthorizationUrl(config.authorization_url))
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.client_id)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("scope", scopes)
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  if (config.login_hint_enabled !== false && options.loginHint) {
    url.searchParams.set("login_hint", options.loginHint)
  }
  // Force re-auth: overwrite IdP session / tokens (prompt=login + max_age=0)
  if (options.forceReauth) {
    url.searchParams.set("prompt", "login")
    url.searchParams.set("max_age", "0")
  }

  window.location.href = url.toString()
}

/**
 * Exchange authorization code for app JWT via backend bridge.
 * Stores token in localStorage under the standard auth key.
 */
export async function completeOidcCallback(params: {
  code: string
  state?: string | null
}): Promise<OidcLoginResponse> {
  const { codeVerifier, state: storedState, redirectUri } = takePkce()
  if (!codeVerifier) {
    throw OidcAuthError.fromInfo({
      title: "Сессия входа истекла",
      message:
        "Не найден code_verifier (PKCE). Так бывает, если закрыли вкладку, сменили браузер " +
        "или открыли callback без старта с /login. Начните вход заново с страницы входа HRMS.",
      code: "pkce_missing",
    })
  }
  if (params.state && storedState && params.state !== storedState) {
    throw OidcAuthError.fromInfo({
      title: "Ошибка проверки state",
      message:
        "Параметр state не совпал с сохранённым — возможна подмена или устаревшая вкладка. " +
        "Начните вход заново.",
      code: "state_mismatch",
    })
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
    throw OidcAuthError.fromInfo(mapOidcError(response.status, detail))
  }

  const data = (await response.json()) as OidcLoginResponse & { id_token?: string }
  if (!data.access_token) {
    throw OidcAuthError.fromInfo({
      title: "Нет токена доступа",
      message: "Сервер HRMS не вернул access_token после обмена кода. Попробуйте войти снова.",
      code: "missing_access_token",
    })
  }
  // Fresh app JWT overwrites any previous token; clear re-login loop guard
  clearOidcReloginGuard()
  localStorage.setItem("token", data.access_token)
  // Keep id_token for Authentik RP-initiated logout (id_token_hint)
  storeOidcIdToken(data.id_token)
  return data
}
