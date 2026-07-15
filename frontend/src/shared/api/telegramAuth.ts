/**
 * Telegram bot deep-link / QR login client helper.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api"
const BOT_POLL_SECRET_PREFIX = "telegram_bot_poll_secret:"
const BOT_POLL_INTERVAL_MS = 1500

export type TelegramBotConfig = {
  bot_username: string
  /** Real bot username configured and bot login enabled */
  bot_enabled?: boolean
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

export async function fetchTelegramBotConfig(): Promise<TelegramBotConfig> {
  const response = await fetch(`${API_BASE}/auth/telegram/bot/config`)
  if (!response.ok) {
    throw new Error("Не удалось загрузить конфигурацию Telegram")
  }
  return response.json()
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
  handlers: BotLoginHandlers = { onChallenge: () => undefined }
): Promise<TelegramLoginResponse> {
  const challenge = await createTelegramBotChallenge()
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
    case "telegram_bot_token_invalid":
      return "Токен Telegram-бота не проходит проверку (Bot API getMe отклонил его). Проверьте токен в настройках: возможно, он отозван, опечатан или не применён через @BotFather."
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
