/**
 * Telegram OIDC client helper (Phase 1).
 *
 * Widget glue expects BotFather Web Login client_id configured on backend
 * (TELEGRAM_OIDC_CLIENT_ID) and domain allowlisted in BotFather.
 * Load script: https://telegram.org/js/telegram-login.js (see LoginPage).
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api"
const NONCE_STORAGE_KEY = "telegram_oidc_nonce"

export type TelegramOidcConfig = {
  enabled: boolean
  client_id: string
  bot_username: string
  authorize_url: string
  scopes: string[]
}

export type TelegramLoginResponse = {
  access_token: string
  token_type: string
  username: string
  role: string
  full_name: string
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

/** POST id_token + nonce → store HRMS JWT in localStorage.token */
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
  localStorage.setItem("token", data.access_token)
  clearStoredTelegramNonce()
  return data
}

/**
 * Load telegram-login.js once (BotFather Web Login).
 * Comment: register domain + client in BotFather → Web Login.
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
 * Start Telegram login: nonce → optional Telegram.Login.auth popup → backend exchange.
 * If widget API is unavailable, throws with setup hint.
 */
export async function startTelegramLogin(config: TelegramOidcConfig): Promise<TelegramLoginResponse> {
  if (!config.enabled || !config.client_id) {
    throw new Error("Telegram login не настроен")
  }

  const nonce = createTelegramNonce()

  // Prefer Telegram.Login.auth when script exposes it (legacy widget path).
  // OIDC id_token path: widget/callback should supply id_token; we exchange on backend.
  try {
    await loadTelegramLoginScript()
  } catch {
    // Script optional if host already injected; continue to manual flow check
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

    // Modern OIDC may return id_token; legacy returns fields + hash.
    // Phase 1 backend accepts id_token + nonce only.
    const idToken = authData.id_token
    if (typeof idToken !== "string" || !idToken) {
      throw new Error(
        "Telegram не вернул id_token. Настройте Web Login (OIDC) в BotFather и telegram-login.js."
      )
    }
    return loginWithTelegramOidc(idToken, nonce)
  }

  // Fallback: open authorize URL (user completes flow; full redirect/callback = BotFather setup).
  const params = new URLSearchParams({
    client_id: config.client_id,
    scope: (config.scopes || ["openid", "profile"]).join(" "),
    nonce,
    origin: window.location.origin,
  })
  const url = `${config.authorize_url}?${params.toString()}`
  window.open(url, "telegram_oauth", "width=550,height=600")
  throw new Error(
    "Открыто окно Telegram OAuth. Для автоматического обмена id_token настройте BotFather Web Login и callback (см. telegramAuth.ts)."
  )
}
