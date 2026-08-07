/**
 * Хостовый конфиг auth-shell-модуля (HRMS).
 *
 * Общие файлы auth-shell (client.ts / useAuth.tsx / LoginPage.tsx) работают
 * только с машинными кодами ошибок и относительными путями — все бренд-значения
 * (storage-ключи, имя приложения, apiBase, словарь RU-текстов ошибок, способ
 * применения темы/локаль, наличие справочника ролей) задаются здесь.
 *
 * Файл хостовый: содержимое отличается между проектами (HRMS / KTM),
 * в scripts/sync-manifest.json не входит. Версия модуля дублируется здесь,
 * в client.ts, useAuth.tsx и LoginPage.tsx — по ней verify-sync сверяет
 * общий код (режим content + version).
 */
import { applyTheme, storeLocale } from "@/shared/lib/profile-prefs"
import { showGlobalToast } from "@/shared/ui/use-toast"

/** Версия auth-shell-модуля — синхронизируется verify-sync (режим content + version). */
export const AUTH_SHELL_VERSION = "1.0.0"

export type AuthErrorText = {
  title: string
  message: string
  /** Добавить сырой detail бэкенда к message (для fallback-ошибок). */
  withDetail?: boolean
}

export type AuthHostConfig = {
  /** Префикс storage-ключей auth-shell (localStorage/sessionStorage). */
  storagePrefix: string
  /** Ключ app-токена в localStorage. */
  tokenKey: string
  /** Кука app-токена; null — куки не пишем и не чистим. */
  cookieKey: string | null
  /** Базовый URL API (без trailing slash). */
  apiBase: string
  /** Имя приложения (бренд: h1 / alt / aria). */
  appName: string
  /** Подзаголовок приложения на странице входа. */
  appTagline: string
  /** Путь страницы входа (редирект при 401 / после логаута). */
  loginPath: string
  /** Путь после успешного входа / корень приложения. */
  rootPath: string
  /** Ключ sessionStorage для «проскочившей» ошибки входа (читает LoginPage). */
  authErrorStorageKey: string
  /** Есть справочник ролей /auth/roles (KTM — да, HRMS — нет). */
  rolesEnabled: boolean
  /** Словарь машинных кодов ошибок auth-shell → RU-текст. */
  errorText: Record<string, AuthErrorText>
  /** Доп. перевод серверного текста (KTM: словарь серверных фраз; HRMS: нет). */
  translateDetail?: (text: string) => string
  /** Хостовый обработчик не-auth ошибок API (HRMS: глобальный тост; KTM: нет). */
  onApiError?: (info: { status?: number; message: string }) => void
  /** Применить theme/locale профиля (бренд-способ). */
  applyUserPrefs?: (user: { theme?: string | null; locale?: string | null }) => void
}

const envBaseUrl = import.meta.env.VITE_API_URL

const apiBase = (
  typeof envBaseUrl === "string" && envBaseUrl.trim().length > 0
    ? envBaseUrl
    : "/api"
).replace(/\/+$/, "")

export const authHostConfig: AuthHostConfig = {
  storagePrefix: "hrms",
  tokenKey: "token",
  cookieKey: null,
  apiBase,
  appName: "HRMS",
  appTagline: "Система управления персоналом",
  loginPath: "/login",
  rootPath: "/",
  authErrorStorageKey: "hrms_auth_error",
  rolesEnabled: false,
  errorText: {
    AUTH_SESSION_EXPIRED: {
      title: "Сессия истекла",
      message: "Сессия истекла. Войдите снова.",
    },
    AUTH_BREAK_GLASS_DISABLED: {
      title: "Аварийный доступ",
      message: "Аварийный доступ отключен.",
    },
    AUTH_BREAK_GLASS_INVALID: {
      title: "Аварийный вход",
      message: "Неверный пароль аварийного доступа.",
    },
    AUTH_BREAK_GLASS_FAILED: {
      title: "Аварийный вход",
      message: "Ошибка аварийного входа. Попробуйте снова.",
      withDetail: true,
    },
    AUTH_OIDC_LOGIN_FAILED: {
      title: "Единый вход",
      message: "Ошибка входа через единый вход.",
      withDetail: true,
    },
    AUTH_ME_FAILED: {
      title: "Профиль",
      message: "Не удалось загрузить данные пользователя.",
      withDetail: true,
    },
    AUTH_LOGOUT_FAILED: {
      title: "Выход",
      message: "Не удалось завершить выход.",
      withDetail: true,
    },
    AUTH_HTTP_401: {
      title: "Ошибка входа",
      message: "Сессия недействительна. Войдите снова.",
    },
    AUTH_HTTP_403: {
      title: "Доступ запрещён",
      message: "У вас недостаточно прав для этого действия.",
    },
    AUTH_HTTP_5XX: {
      title: "Сервис недоступен",
      message: "Сервер временно недоступен. Попробуйте позже.",
    },
    AUTH_UNKNOWN: {
      title: "Ошибка",
      message: "Неизвестная ошибка. Попробуйте снова.",
      withDetail: true,
    },
  },
  onApiError: ({ status, message }) => {
    const statusCode = status
    let title = "Ошибка запроса"
    if (!statusCode) title = "Ошибка сети"
    else if (statusCode === 403) title = "Доступ запрещен"
    else if (statusCode === 404) title = "Ресурс не найден"
    else if (statusCode === 422) title = "Ошибка валидации данных"
    else if (statusCode >= 500) title = "Ошибка сервера"
    showGlobalToast({
      title,
      description: message || "Неизвестная ошибка",
      variant: "destructive",
    })
  },
  applyUserPrefs: (user) => {
    applyTheme(user.theme)
    storeLocale(user.locale)
  },
}
