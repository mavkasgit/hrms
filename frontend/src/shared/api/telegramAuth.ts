/**
 * Telegram Login Widget + OIDC + bot challenge client helper.
 *
 * Primary browser path: official Login Widget callback fields → POST /widget
 * (HMAC verified server-side with bot token). OIDC path only when a real
 * id_token is returned from authorize URL that included the same nonce.
 * Bot deep-link uses poll_secret (sessionStorage) so deep_link alone cannot poll.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api"
const NONCE_STORAGE_KEY = "telegram_oidc_nonce"
const BOT_POLL_SECRET_PREFIX = "telegram_bot_poll_secret:"
const BOT_POLL_INTERVAL_MS = 1500

export type TelegramOidcConfig = {
  enabled: boolean
  client_id: string
  bot_username: string
  authorize_url: string
  scopes: string[]
  /** Real bot username or dev QR path available */
  bot_enabled?: boolean
  /** QR opens local confirm page (no Telegram bot) */
  dev_qr?: boolean
}

export type TelegramLoginResponse = {
  access_token: string
  token_type: string
  username: string
  role: string
  full_name: string
  require_password_setup?: boolean
}

export type TelegramBotChallenge = {
  challenge_id: string
  poll_secret: string
  deep_link: string
  expires_in: number
  poll_url: string
}

export type TelegramBotChallengeStatus = {
  status: "pending" | "confirmed" | "expired" | "consumed"
  access_token: string | null
  token_type: string
  username: string | null
  role: string | null
  full_name: string | null
  require_password_setup?: boolean
}

/** Fields returned by Telegram Login Widget / Telegram.Login.auth (legacy). */
export type TelegramWidgetAuthData = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: {
            bot_id: string | number
            request_access?: boolean
            lang?: string
          },
          callback: (data: Record<string, unknown> | false) => void
        ) => void
      }
    }
  }
}

export async function fetchTelegramOidcConfig(): Promise<TelegramOidcConfig> {
  const response = await fetch(`${API_BASE}/auth/telegram/oidc/config`)
  if (!response.ok) {
    throw new Error("Не удалось загрузить конфигурацию Telegram")
  }
  return response.json()
}

export function createTelegramNonce(): string {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  sessionStorage.setItem(NONCE_STORAGE_KEY, nonce)
  return nonce
}

export function getStoredTelegramNonce(): string | null {
  return sessionStorage.getItem(NONCE_STORAGE_KEY)
}

export function clearStoredTelegramNonce(): void {
  sessionStorage.removeItem(NONCE_STORAGE_KEY)
}

function storeBotPollSecret(challengeId: string, pollSecret: string): void {
  sessionStorage.setItem(`${BOT_POLL_SECRET_PREFIX}${challengeId}`, pollSecret)
}

function getBotPollSecret(challengeId: string): string | null {
  return sessionStorage.getItem(`${BOT_POLL_SECRET_PREFIX}${challengeId}`)
}

function clearBotPollSecret(challengeId: string): void {
  sessionStorage.removeItem(`${BOT_POLL_SECRET_PREFIX}${challengeId}`)
}

function storeLoginResponse(data: TelegramLoginResponse): TelegramLoginResponse {
  localStorage.setItem("token", data.access_token)
  return data
}

/** POST id_token + nonce → store HRMS JWT. Only when nonce was in OIDC authorize. */
export async function loginWithTelegramOidc(
  idToken: string,
  nonce: string
): Promise<TelegramLoginResponse> {
  const response = await fetch(`${API_BASE}/auth/telegram/oidc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken, nonce }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail = typeof data.detail === "string" ? data.detail : "Ошибка входа через Telegram"
    throw new Error(detail)
  }
  const data: TelegramLoginResponse = await response.json()
  clearStoredTelegramNonce()
  return storeLoginResponse(data)
}

/** POST Login Widget fields → HMAC verify on backend → JWT. */
export async function loginWithTelegramWidget(
  authData: TelegramWidgetAuthData
): Promise<TelegramLoginResponse> {
  const response = await fetch(`${API_BASE}/auth/telegram/widget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: authData.id,
      first_name: authData.first_name,
      last_name: authData.last_name,
      username: authData.username,
      photo_url: authData.photo_url,
      auth_date: authData.auth_date,
      hash: authData.hash,
    }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail =
      typeof data.detail === "string" ? data.detail : "Ошибка входа через Telegram Widget"
    throw new Error(detail)
  }
  const data: TelegramLoginResponse = await response.json()
  return storeLoginResponse(data)
}

function parseWidgetAuthData(raw: Record<string, unknown>): TelegramWidgetAuthData | null {
  const id = raw.id
  const hash = raw.hash
  const authDate = raw.auth_date
  if (id === undefined || id === null || typeof hash !== "string" || !hash) {
    return null
  }
  const numericId = typeof id === "number" ? id : Number(id)
  if (!Number.isFinite(numericId)) return null
  const numericAuthDate =
    typeof authDate === "number" ? authDate : Number(authDate)
  if (!Number.isFinite(numericAuthDate)) return null

  return {
    id: numericId,
    first_name: typeof raw.first_name === "string" ? raw.first_name : undefined,
    last_name: typeof raw.last_name === "string" ? raw.last_name : undefined,
    username: typeof raw.username === "string" ? raw.username : undefined,
    photo_url: typeof raw.photo_url === "string" ? raw.photo_url : undefined,
    auth_date: numericAuthDate,
    hash,
  }
}

/**
 * Load telegram-widget.js once (official Login Widget).
 * Domain must be allowlisted in BotFather for the bot.
 */
export function loadTelegramLoginScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-telegram-login-js="1"]'
  )
  if (existing) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.async = true
    script.dataset.telegramLoginJs = "1"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Не удалось загрузить Telegram Login script"))
    document.head.appendChild(script)
  })
}

/**
 * Start Telegram login.
 * Primary: Login Widget → POST /widget (no fake OIDC nonce).
 * Secondary: if callback returns id_token only, require stored OIDC nonce match path
 *   (do not POST OIDC with a nonce that was never sent to Telegram).
 * Fallback: open oauth.telegram.org with nonce (manual setup).
 */
export async function startTelegramLogin(config: TelegramOidcConfig): Promise<TelegramLoginResponse> {
  if (!config.enabled || !config.client_id) {
    throw new Error("Telegram login не настроен")
  }

  try {
    await loadTelegramLoginScript()
  } catch {
    // Script optional if host already injected
  }

  const authFn = window.Telegram?.Login?.auth
  if (typeof authFn === "function") {
    const authData = await new Promise<Record<string, unknown>>((resolve, reject) => {
      authFn(
        {
          bot_id: config.client_id,
          request_access: true,
        },
        (data) => {
          if (!data) {
            reject(new Error("Вход через Telegram отменён"))
            return
          }
          resolve(data)
        }
      )
    })

    // Prefer verified Login Widget path (hash + id). Never invent OIDC nonce.
    const widgetData = parseWidgetAuthData(authData)
    if (widgetData) {
      return loginWithTelegramWidget(widgetData)
    }

    // True OIDC id_token only if nonce was previously bound to authorize request.
    const idToken = authData.id_token
    const nonce = getStoredTelegramNonce()
    if (typeof idToken === "string" && idToken && nonce) {
      return loginWithTelegramOidc(idToken, nonce)
    }

    throw new Error(
      "Telegram вернул неожиданный ответ. Ожидаются поля Login Widget (hash) или id_token после OIDC authorize."
    )
  }

  // Fallback: open Web Login authorize URL with nonce (for true OIDC clients).
  const nonce = createTelegramNonce()
  const params = new URLSearchParams({
    client_id: config.client_id,
    scope: (config.scopes || ["openid", "profile"]).join(" "),
    nonce,
    origin: window.location.origin,
  })
  const url = `${config.authorize_url}?${params.toString()}`
  window.open(url, "telegram_oauth", "width=550,height=600")
  throw new Error(
    "Открыто окно Telegram OAuth. После получения id_token обмен через POST /auth/telegram/oidc с тем же nonce (sessionStorage)."
  )
}

// ─── Bot deep-link login ─────────────────────────────────────────────────

/** Create login challenge → deep_link + poll_secret (store secret in sessionStorage). */
export async function createTelegramBotChallenge(): Promise<TelegramBotChallenge> {
  const response = await fetch(`${API_BASE}/auth/telegram/bot/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "login" }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail =
      typeof data.detail === "string" ? data.detail : "Не удалось создать challenge бота"
    throw new Error(detail)
  }
  const challenge: TelegramBotChallenge = await response.json()
  if (challenge.poll_secret) {
    storeBotPollSecret(challenge.challenge_id, challenge.poll_secret)
  }
  return challenge
}

/** Create invite challenge → deep_link + poll_secret (store secret in sessionStorage). */
export async function createTelegramBotInviteChallenge(inviteCode: string): Promise<TelegramBotChallenge> {
  const response = await fetch(`${API_BASE}/auth/telegram/bot/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "invite", invite_code: inviteCode }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail =
      typeof data.detail === "string" ? data.detail : "Не удалось активировать инвайт-код"
    throw new Error(detail)
  }
  const challenge: TelegramBotChallenge = await response.json()
  if (challenge.poll_secret) {
    storeBotPollSecret(challenge.challenge_id, challenge.poll_secret)
  }
  return challenge
}

export async function pollTelegramBotChallenge(
  challengeId: string,
  pollSecret?: string
): Promise<TelegramBotChallengeStatus> {
  const secret = pollSecret || getBotPollSecret(challengeId)
  if (!secret) {
    throw new Error("telegram_invalid_poll_secret")
  }
  const params = new URLSearchParams({ poll_secret: secret })
  const response = await fetch(
    `${API_BASE}/auth/telegram/bot/challenge/${encodeURIComponent(challengeId)}?${params}`
  )
  if (response.status === 410) {
    clearBotPollSecret(challengeId)
    return {
      status: "expired",
      access_token: null,
      token_type: "bearer",
      username: null,
      role: null,
      full_name: null,
    }
  }
  if (response.status === 404) {
    throw new Error("challenge_not_found")
  }
  if (response.status === 401) {
    throw new Error("telegram_invalid_poll_secret")
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail =
      typeof data.detail === "string" ? data.detail : "Ошибка опроса challenge"
    throw new Error(detail)
  }
  return response.json()
}

export type BotLoginHandlers = {
  onChallenge: (challenge: TelegramBotChallenge) => void
  onStatus?: (status: TelegramBotChallengeStatus["status"]) => void
  signal?: AbortSignal
  /**
   * Whether to auto-open the deep link in a new tab. Default true
   * (preserves prior UX for callers that want a "one click" flow).
   * Set false for QR-only flows where the user scans the code with a phone.
   */
  openDeepLink?: boolean
}

/**
 * Create challenge, optionally open deep link, poll every 1.5s with
 * poll_secret until done. On success stores JWT in localStorage.token.
 */
export async function startTelegramBotLogin(
  handlers: BotLoginHandlers = { onChallenge: () => undefined },
  inviteCode?: string
): Promise<TelegramLoginResponse> {
  const challenge = inviteCode
    ? await createTelegramBotInviteChallenge(inviteCode)
    : await createTelegramBotChallenge()
  handlers.onChallenge(challenge)

  if (handlers.openDeepLink !== false) {
    try {
      window.open(challenge.deep_link, "_blank", "noopener,noreferrer")
    } catch {
      // ignore popup blockers — user can open link / scan QR manually
    }
  }
  const deadline = Date.now() + challenge.expires_in * 1000
  const pollSecret = challenge.poll_secret

  return new Promise<TelegramLoginResponse>((resolve, reject) => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      stopped = true
      if (timer) clearTimeout(timer)
      handlers.signal?.removeEventListener("abort", onAbort)
    }

    const onAbort = () => {
      cleanup()
      clearBotPollSecret(challenge.challenge_id)
      reject(new Error("Вход через Telegram-бота отменён"))
    }
    handlers.signal?.addEventListener("abort", onAbort)

    const tick = async () => {
      if (stopped) return
      if (Date.now() > deadline) {
        cleanup()
        clearBotPollSecret(challenge.challenge_id)
        reject(new Error("Время ожидания подтверждения в Telegram истекло"))
        return
      }
      try {
        const status = await pollTelegramBotChallenge(
          challenge.challenge_id,
          pollSecret
        )
        handlers.onStatus?.(status.status)

        if (status.status === "confirmed" && status.access_token) {
          localStorage.setItem("token", status.access_token)
          clearBotPollSecret(challenge.challenge_id)
          cleanup()
          resolve({
            access_token: status.access_token,
            token_type: status.token_type || "bearer",
            username: status.username || "",
            role: status.role || "",
            full_name: status.full_name || "",
            require_password_setup: status.require_password_setup,
          })
          return
        }
        if (status.status === "expired") {
          cleanup()
          clearBotPollSecret(challenge.challenge_id)
          reject(new Error("Challenge истёк. Запросите новый вход через бота."))
          return
        }
        if (status.status === "consumed" && !status.access_token) {
          cleanup()
          clearBotPollSecret(challenge.challenge_id)
          reject(new Error("Challenge уже использован"))
          return
        }
      } catch (err) {
        if (stopped) return
        cleanup()
        clearBotPollSecret(challenge.challenge_id)
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      timer = setTimeout(tick, BOT_POLL_INTERVAL_MS)
    }

    timer = setTimeout(tick, BOT_POLL_INTERVAL_MS)
  })
}

export function translateTelegramError(detail: string): string {
  switch (detail) {
    case "telegram_not_allowed":
      return "Данный аккаунт Telegram не зарегистрирован или не привязан к системе. Войдите по паролю или инвайт-коду и привяжите Telegram в настройках профиля."
    case "telegram_already_linked":
      return "Этот аккаунт Telegram уже привязан к другому пользователю."
    case "challenge_expired":
      return "Срок действия запроса истек. Пожалуйста, обновите QR-код."
    case "challenge_not_found":
      return "Запрос авторизации не найден или был аннулирован."
    case "challenge_not_confirmed":
      return "Вход еще не подтвержден в Telegram-боте. Откройте бота и нажмите СТАРТ."
    case "invalid_purpose":
      return "Неверная цель запроса авторизации."
    case "user_not_found":
      return "Пользователь с таким именем не найден."
    case "telegram_invalid_token":
      return "Неверный токен авторизации Telegram."
    case "telegram_bot_not_configured":
      return "Интеграция с Telegram-ботом не настроена на сервере."
    case "invite_code_required":
      return "Код приглашения обязателен для входа."
    case "invalid_invite_code":
      return "Введен неверный код приглашения."
    case "telegram_id_required":
      return "Идентификатор Telegram обязателен."
    case "telegram_signature_invalid":
      return "Подпись авторизации Telegram недействительна."
    case "telegram_auth_expired":
      return "Срок действия сессии авторизации Telegram истек."
    default:
      return detail
  }
}
