# user-settings — переносимый модуль настроек пользователя

Модальное окно настроек аккаунта (профиль / внешний вид / безопасность / сессии)
для sidebar-based приложений. Спроектирован как **самодостаточный модуль**:
копируется между приложениями целиком, без правок внутреннего кода.

Версия модуля: `USER_SETTINGS_MODULE_VERSION` (см. `index.ts`) — сверяйте при обновлениях.

## Что внутри

| Раздел          | Содержимое                                                        |
| --------------- | ----------------------------------------------------------------- |
| Профиль         | аватар (seed-пикер), логин (копирование), роль, полное имя, email |
| Внешний вид     | тема (system/light/dark, мгновенный apply), язык (ru/en)          |
| Безопасность    | блок SSO/IdP (deep-link) с источниками входа                     |
| Сессии          | активные сеансы (отзыв, «завершить другие»), история входов       |

Возможности: dirty-guard при закрытии, skeleton-загрузка, подтверждения
разрушающих действий, i18n (ru базовый, en в комплекте), автоскрытие разделов
по доступным методам API.

## Зависимости

- React 18+, TailwindCSS, shadcn-примитивы (dialog, alert-dialog, button,
  input, badge, skeleton, tooltip) — импортируются **только** через `ui.ts`.
- `lucide-react`, `@multiavatar/multiavatar` (изолирован в `components/AvatarArt.tsx`).
- Без axios, date-fns, react-query — чистый fetch + Intl.

## Перенос в другое приложение

1. Скопируйте папку `modules/user-settings` в `src/modules/` нового приложения.
2. Поправьте пути в **`ui.ts`** (единственный файл с импортами хоста):
   укажите на shadcn-примитивы и `cn` нового приложения.
3. Подключите адаптер данных:

```tsx
import {
  UserSettingsDialog,
  createHttpAdapter,
} from "@/modules/user-settings"

const api = createHttpAdapter({
  baseUrl: "/api",
  getToken: () => localStorage.getItem("token"),
  // endpoints: { getProfile: "/me", ... }  // если пути отличаются
})

<UserSettingsDialog
  open={open}
  onOpenChange={setOpen}
  api={api}
  callbacks={{
    onProfileUpdated: (p) => refetchUser(),
    onThemeChange: (t) => applyTheme(t),
    onLocaleChange: (l) => storeLocale(l),
    onLogoutRequest: () => logout(),
    notify: (t) => toast(t),
  }}
/>
```

### Если HTTP-клиент свой (axios и т.п.)

Реализуйте интерфейс `UserSettingsApi` (см. `api/adapter.ts`) поверх своего
клиента — так 401/refresh-логика хоста продолжит работать. Необязательные
методы (`listSessions`, `getIdpLinks`, …) можно не реализовывать —
соответствующие разделы скроются автоматически.

### Локализация / ребрендинг строк

Все строки — в словаре. Передайте `dict` как deep-partial поверх `ru`
(или свой полный словарь формы `UserSettingsDict`, см. `i18n/en.ts`):

```tsx
<UserSettingsDialog dict={{ nav: { sessions: "Устройства" } }} ... />
```

## Контракт бэкенда (эндпоинты по умолчанию)

| Метод адаптера        | HTTP                                    |
| --------------------- | --------------------------------------- |
| getProfile            | `GET /auth/me`                          |
| updateProfile         | `PATCH /auth/me/profile`                |
| updateAvatar          | `PATCH /auth/me/avatar`                 |
| getIdpLinks           | `GET /auth/me/links`                    |
| listSessions          | `GET /auth/sessions`                    |
| revokeSession         | `DELETE /auth/sessions/{id}`            |
| revokeOtherSessions   | `DELETE /auth/sessions/others`          |
| listLoginEvents       | `GET /auth/me/login-events?limit=N`     |

Любой путь переопределяется через `createHttpAdapter({ endpoints })`.

## Структура

```
user-settings/
├── index.ts                  — публичный API (импортируйте только отсюда)
├── UserSettingsDialog.tsx    — корневой диалог (композиция + dirty-guard)
├── context.tsx               — внутренний контекст (api/dict/profile)
├── ui.ts                     — ЕДИНСТВЕННЫЙ файл с импортами хоста (shadcn)
├── types.ts                  — контракты (UserProfile, SessionInfo, …)
├── api/
│   ├── adapter.ts            — интерфейс UserSettingsApi
│   └── http-adapter.ts       — fetch-реализация (без axios)
├── i18n/                     — ru (source of truth), en, deep-merge
├── lib/                      — datetime (Intl), device, avatar-seed
└── components/               — панели, AvatarPickerDialog, AvatarArt, ui-bits
```
