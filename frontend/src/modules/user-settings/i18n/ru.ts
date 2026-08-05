/**
 * Русский словарь — базовый (source of truth для типа UserSettingsDict).
 * Любой другой язык обязан повторять эту структуру (typeof ru).
 */
export const ru = {
  meta: {
    /** Locale для Intl.DateTimeFormat / Intl.RelativeTimeFormat. */
    intl: "ru-RU",
  },
  common: {
    save: "Сохранить",
    cancel: "Отмена",
    saving: "Сохранение…",
    saved: "Сохранено",
    retry: "Повторить",
    loading: "Загрузка…",
    copy: "Копировать",
    copied: "Скопировано",
    reset: "Сбросить",
    notSet: "Не задано",
  },
  nav: {
    profile: "Профиль",
    appearance: "Внешний вид",
    security: "Безопасность",
    sessions: "Сессии",
  },
  profile: {
    title: "Профиль",
    description: "Имя, аватар и контактные данные вашей учётной записи",
    dataTitle: "Личные данные",
    avatarChange: "Изменить аватар",
    usernameLabel: "Имя пользователя (логин)",
    roleLabel: "Системная роль",
    roleFromIdp: "Роль назначается через единый вход",
    fullNameLabel: "Полное имя",
    fullNamePlaceholder: "Иван Иванов",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    idpSyncHint:
      "Единый профиль: имя и аватар синхронизируются через IdP для всех приложений.",
    idpSettings: "Настройки входа",
    roleAdmin: "Администратор",
    roleViewer: "Сотрудник",
  },
  appearance: {
    title: "Внешний вид",
    description: "Тема оформления и язык интерфейса",
    themeLabel: "Тема",
    themeSystem: "Системная",
    themeSystemHint: "Следовать настройкам ОС",
    themeLight: "Светлая",
    themeDark: "Тёмная",
    localeLabel: "Язык",
    hint: "Общие настройки — сохраняются в едином профиле и доступны во всех приложениях.",
  },
  security: {
    title: "Безопасность",
    description: "Способы входа в систему",
    idpTitle: "Единый вход (SSO)",
    idpDescription:
      "MFA и способы входа настраиваются в системе единого входа.",
    idpDashboard: "Дашборд SSO",
    idpOpen: "Открыть настройки входа",
  },
  sessions: {
    title: "Активные сессии",
    description: "Устройства и браузеры, с которых выполнен вход",
    currentBadge: "Текущий сеанс",
    refresh: "Обновить",
    revoke: "Завершить",
    revokeOthers: "Завершить другие сессии",
    revoking: "Завершение…",
    revokeCurrentConfirmTitle: "Завершить текущий сеанс?",
    revokeCurrentConfirmDescription:
      "Вы будете разлогинены на этом устройстве и перейдёте на страницу входа.",
    revokeOthersConfirmTitle: "Завершить все остальные сессии?",
    revokeOthersConfirmDescription:
      "Все сеансы, кроме текущего, будут отозваны. Потребуется повторный вход на тех устройствах.",
    confirmAction: "Завершить",
    empty: "Нет активных сессий",
    unknownDevice: "Неизвестное устройство",
    unknownIp: "IP неизвестен",
    lastActive: "Активность",
    signedIn: "Вход",
    lastOfN: "Последние {shown} из {total}",
    noteText:
      "При подозрении на несанкционированный доступ завершите чужие сессии — сеанс отзывается на сервере, повторный вход потребует авторизации.",
    historyTitle: "История входов",
    historyDescription: "Успешные и неудачные попытки входа (до 90 дней)",
    historyEmpty: "Пока нет записей о входах",
    successLogin: "Успешный вход",
    failedLogin: "Неудачная попытка",
  },
  avatar: {
    title: "Выберите аватар",
    description:
      "Сгенерированные варианты. Кликните на понравившийся — выбор сохранится автоматически.",
    shuffle: "Другие варианты",
    reset: "Сбросить",
    hoverHint: "Наведите на аватар, чтобы увидеть полную иконку",
    emptyHint: "Аватар не задан — показывается пустая заглушка.",
    pickAriaLabel: "Выбрать аватар",
    error: "Не удалось сохранить аватар. Попробуйте ещё раз.",
  },
  guard: {
    title: "Отменить несохранённые изменения?",
    description: "В форме есть изменения, которые ещё не сохранены.",
    discard: "Отменить изменения",
    keepEditing: "Продолжить редактирование",
  },
  errors: {
    profile: "Не удалось сохранить. Попробуйте ещё раз.",
    name: "Не удалось сохранить имя. Попробуйте ещё раз.",
    sessions: "Не удалось загрузить активные сессии",
    events: "Не удалось загрузить историю входов",
    revoke: "Не удалось завершить сеанс",
    revokeOthers: "Не удалось завершить другие сессии",
  },
  loginMethods: {
    password: "Пароль",
    oidc: "Единый вход",
  } as Record<string, string>,
}

export type UserSettingsDict = typeof ru
