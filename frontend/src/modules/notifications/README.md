# notifications — переносимый модуль уведомлений

Колокольчик уведомлений (бейдж непрочитанных + попап со списком незакрытых)
для sidebar-based приложений. Спроектирован как **самодостаточный модуль**:
копируется между приложениями целиком, без правок внутреннего кода.

Версия модуля: `NOTIFICATIONS_MODULE_VERSION` (см. `index.ts`) — сверяйте при обновлениях.

## Что внутри

- Колокольчик с бейджем непрочитанных, попап раскрывается вправо.
- Список незакрытых уведомлений; непрочитанные помечаются прочитанными
  при открытии попапа; закрытое уведомление пропадает из списка.
- Поллинг по умолчанию 30 с (настраивается через `pollIntervalMs`).
- Пустое состояние «Нет новых уведомлений» — при пустом/отсутствующем бэке
  модуль не падает.

## Зависимости

- React 18+, TailwindCSS, shadcn-примитивы (button, popover) — импортируются
  **только** через `ui.ts`.
- `lucide-react`.
- Без axios, date-fns, react-query — чистый fetch + собственный поллинг.

## Перенос в другое приложение

1. Скопируйте папку `modules/notifications` в `src/modules/` нового приложения.
2. Поправьте пути в **`ui.ts`** (единственный файл с импортами хоста):
   укажите на shadcn-примитивы и `cn` нового приложения.
3. Подключите адаптер данных:

```tsx
import { NotificationsBell, createHttpAdapter } from "@/modules/notifications"

const api = createHttpAdapter({
  baseUrl: "/api",
  getToken: () => localStorage.getItem("token"),
  // endpoints: { list: "/internal-notifications", ... } // если пути отличаются
})

<NotificationsBell api={api} />
```

### Если HTTP-клиент свой (axios и т.п.)

Реализуйте интерфейс `NotificationsApi` (см. `api/adapter.ts`) поверх своего
клиента — так 401/refresh-логика хоста продолжит работать.

## Контракт бэкенда (эндпоинты по умолчанию)

| Метод адаптера | HTTP                                           |
| -------------- | ---------------------------------------------- |
| list(limit=50) | `GET /internal-notifications?limit=N&only_unclosed=true` → `{items, total, unread_count}` |
| markRead(id)   | `POST /internal-notifications/{id}/read`       |
| close(id)      | `POST /internal-notifications/{id}/close`      |

Любой путь переопределяется через `createHttpAdapter({ endpoints })`.

## Структура

```
notifications/
├── index.ts                  — публичный API (импортируйте только отсюда)
├── NotificationsBell.tsx     — колокольчик (бейдж + попап)
├── ui.ts                     — ЕДИНСТВЕННЫЙ файл с импортами хоста (shadcn)
├── types.ts                  — контракты (Notification, …)
└── api/
    ├── adapter.ts            — интерфейс NotificationsApi
    └── http-adapter.ts       — fetch-реализация (без axios)
```
