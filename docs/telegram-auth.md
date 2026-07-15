# Telegram Auth / Identity — ops runbook

Краткий runbook по **реализованной** модели входа через Telegram в HRMS.  
Без aspirational-фич: то, что есть в коде после hardening (T1).

---

## 1. Identity model

```text
Telegram (SoT личности)
    │  telegram_user_id  (= message.from.id / Widget id)
    ▼
users.telegram_id   ← partial UNIQUE (is_deleted = false)
users.telegram_username  (mutable soft attribute)
    │
    ▼
Platform User (HRMS account)
    └── JWT access token (stateless session)
```

| Принцип | Реализация |
|--------|------------|
| Source of truth | `telegram_user_id` (BIGINT), колонка `users.telegram_id` |
| Отдельная таблица `TelegramIdentity` | **Нет** — поля на `User` |
| 1 TG → 1 active User | partial unique index `ix_users_telegram_id_active` |
| 1 User → max 1 TG | одна колонка `telegram_id` |
| Device / browser identity | **Нет** — challenge + `poll_secret` |
| Sessions table / refresh tokens | **Нет** — JWT (`ACCESS_TOKEN_EXPIRE_MINUTES`) |
| Phone как identity | **Нет auto-link** по телефону |
| Password | колонка `password_hash` NOT NULL; JIT/SSO → placeholder `sso_bypass_hash` |

Модуль identity: in-process `TelegramAuthService` + API prefix `/api/auth/telegram`  
(не отдельный microservice).

---

## 2. Flows

### 2.1. First login / re-login (primary: Bot QR)

1. FE: `POST /api/auth/telegram/bot/challenge` (`purpose=login`) → `challenge_id`, `poll_secret`, `deep_link` (`https://t.me/{bot}?start={token}`).
2. Пользователь сканирует QR / открывает deep-link в Telegram.
3. Бот получает `/start <token>` (webhook **или** getUpdates polling).
4. Backend: `apply_bot_update` → challenge `confirmed`, пишет `telegram_id` / `telegram_username`.
5. FE poll: `GET /api/auth/telegram/bot/challenge/{id}?poll_secret=…` (или header `X-Telegram-Poll-Secret`).
6. При `confirmed` + known `telegram_id`:
   - resolve user by `telegram_id` → JWT (atomic consume → status `consumed`);
   - unknown + **JIT off** → **403** `telegram_not_allowed`;
   - unknown + **JIT on** → create user (`sso_bypass_hash`, role=`TELEGRAM_DEFAULT_ROLE`) → JWT.

**Re-login** = тот же flow: find by `telegram_id`, JWT. Пароль не спрашивается.

UI: `TelegramLoginModal` + poll ~1.5s; secret в `sessionStorage`.

### 2.2. Link (привязка TG к существующему аккаунту)

1. Пользователь уже в системе (Bearer JWT).
2. `POST /bot/challenge` с `purpose=link` (+ Bearer) → deep-link.
3. Confirm в боте → poll status `confirmed` (**без** JWT).
4. `POST /api/auth/telegram/link` body `{ "challenge_id": "…" }` → `telegram_id` на User.

Конфликты:

| Ситуация | Код | detail |
|----------|-----|--------|
| TG id уже на другом User | **409** | `telegram_already_linked` |
| У User уже другой TG id | **409** | `telegram_already_linked` |
| Challenge не confirmed / wrong purpose | **400** | … |
| Challenge expired | **410** | `challenge_expired` |
| Challenge bound to another user | **403** | `telegram_not_allowed` |

**OIDC / Login Widget `id_token`:** body `{ "id_token": "…" }` → **501** `oidc_link_not_implemented`.  
Не реализовано намеренно (primary path = Bot QR).

### 2.3. Unlink

`DELETE /api/auth/telegram/link` (Bearer):

| Состояние | Результат |
|-----------|-----------|
| Есть usable password (не пустой и ≠ `sso_bypass_hash`) | **200**, `telegram_id`/`username` cleared |
| Только TG (placeholder / empty hash) | **400** `cannot_unlink_last_auth_factor` |

### 2.4. Invite + Telegram (API)

`purpose=invite` + `invite_code` на create challenge: после confirm poll выдаёт JWT и `require_password_setup: true`, очищает `invite_code`.  
**FE primary invite path** — `POST /api/auth/invite/login` (код), не TG deep-link.

### 2.5. Widget login (API only)

`POST /api/auth/telegram/widget` — HMAC-SHA256 Login Widget payload.  
**FE не вызывает** этот endpoint; primary UX = Bot QR. Endpoint + unit-тесты сохранены.

---

## 3. API surface

Prefix: **`/api/auth/telegram`**

| Method | Path | Auth | Назначение |
|--------|------|------|------------|
| GET | `/bot/config` | public | `bot_username`, `bot_enabled` |
| POST | `/bot/challenge` | public login; Bearer link; invite_code invite | создать challenge |
| GET | `/bot/challenge/{id}` | `poll_secret` query **или** header | статус / JWT |
| POST | `/webhook` | header `X-Telegram-Bot-Api-Secret-Token` | Bot API Update |
| POST | `/widget` | public | legacy Widget HMAC login |
| POST | `/link` | Bearer | link via `challenge_id` (или 501 id_token) |
| DELETE | `/link` | Bearer | unlink (с guard last factor) |

**Rate limit (public):** `/widget`, `POST /bot/challenge`, `GET /bot/challenge/{id}` — sliding window per IP (`request.client.host`), default **30 / 60s** → **429** `rate_limit_exceeded`.  
In-memory only (не shared между multi-worker).

---

## 4. Env keys (`TELEGRAM_*`)

| Key | Default | Смысл |
|-----|---------|--------|
| `TELEGRAM_BOT_TOKEN` | `""` | Fallback токена, если нет в DB. **Prod/ops:** токен в UI → `system_settings.telegram.bot_token` (приоритет над env) |
| `TELEGRAM_BOT_USERNAME` | `""` | Username бота без `@`; нужен для deep-link / `bot_enabled` |
| `TELEGRAM_ALLOW_JIT` | `false` | Авто-создание User при первом TG login |
| `TELEGRAM_DEFAULT_ROLE` | `viewer` | Роль JIT-пользователя (`admin`\|`viewer`) |
| `TELEGRAM_BOT_CHALLENGE_TTL_SECONDS` | `300` | TTL challenge (deep-link) |
| `TELEGRAM_AUTH_DATE_MAX_AGE_SECONDS` | `600` (код) / часто `86400` в `.env.example` | Max age `auth_date` для Widget |
| `TELEGRAM_WEBHOOK_SECRET` | `""` | Ожидаемое значение header webhook; **пусто → webhook 503** |
| `TELEGRAM_UPDATES_POLLING` | `true` | На poll: `deleteWebhook` + `getUpdates` (без публичного HTTPS) |
| `TELEGRAM_PUBLIC_APP_URL` | `http://localhost:5173` | URL для inline-кнопки «Open HRMS» в ответе бота; кнопка только если **https** |
| `TELEGRAM_BOT_REPLY_ENABLED` | `true` | Ответ бота после `/start <token>` |
| `TELEGRAM_RATE_LIMIT_REQUESTS` | `30` | Max запросов в окне (public TG) |
| `TELEGRAM_RATE_LIMIT_WINDOW_SECONDS` | `60` | Окно rate limit, секунды |

**Reserved / not used:** `TELEGRAM_ALLOWED_ORIGINS` — origin allowlist **не реализован** (ключ зарезервирован в комментариях env, из Settings удалён).

Файлы: `.env.example`, `.env.dev`, `.env.prod`.

---

## 5. Prod: polling vs webhook

| Режим | Когда | Как |
|-------|--------|-----|
| **Polling** (default) | `TELEGRAM_UPDATES_POLLING=true`, webhook secret может быть пустым | Backend на poll challenge тянет `getUpdates`. Отдельного bot-контейнера **нет**. |
| **Webhook** | Нужен публичный HTTPS до backend + ненулевой `TELEGRAM_WEBHOOK_SECRET` | `POST /api/auth/telegram/webhook` с header secret; empty secret → **503** |

Рекомендации ops:

1. Задать `TELEGRAM_BOT_USERNAME` в env.
2. Сохранить bot token в **Admin → settings** (`telegram.bot_token`), не обязательно в env.
3. **JIT off** (`TELEGRAM_ALLOW_JIT=false`): заранее привязать TG к User (profile link) или выдать invite / admin pre-link.
4. Prod compose: nginx **:8081**; bot process не выделяется.
5. Если webhook: tunnel (`prod:tunnel:up` / публичный HTTPS) + secret; иначе оставить polling.

---

## 6. Security (implemented)

| Механизм | Поведение |
|----------|-----------|
| Widget HMAC-SHA256 | secret = SHA256(bot_token); data-check-string |
| Widget anti-replay | `used_telegram_signatures` (hash once) |
| `auth_date` TTL | `TELEGRAM_AUTH_DATE_MAX_AGE_SECONDS` |
| Challenge TTL | `TELEGRAM_BOT_CHALLENGE_TTL_SECONDS` (default 300) |
| Poll secret | plaintext once in create-response; store **sha256**; `hmac.compare_digest` |
| Atomic JWT consume | `try_consume_confirmed` — один poll получает token |
| No phone auto-link | resolve only by `telegram_id` / JIT create |
| Webhook secret | compare_digest; empty → 503 |
| Rate limit | public TG endpoints, 429 |
| Unlink last factor | blocked without usable password |
| OIDC id_token | explicit **501**, не silent 500 |

---

## 7. Explicit non-goals (current codebase)

| Тема | Статус |
|------|--------|
| Telegram OIDC Login (JWKS / PKCE / id_token verify) | **Не реализован** → 501 |
| FE Telegram Login Widget | Backend есть, UI **не** подключён |
| Отдельный Identity Service / `telegram_identities` table | **Нет** в этом спринте |
| Multi-account (один TG → много User) | **Нет** |
| Rate limit multi-worker shared store | **Нет** (in-memory) |
| E2E Playwright live Telegram QR | **Нет** (pytest mock coverage) |

---

## 8. Pre-link users (JIT off — рекомендуемый prod)

При `TELEGRAM_ALLOW_JIT=false` (default):

1. Admin создаёт User (password / invite).
2. User логинится паролем (или invite → setup password).
3. Profile / security banner → **Link Telegram** (QR challenge `purpose=link`).
4. Далее вход — Bot QR login по `telegram_id`.

JIT on — только осознанно (авто-viewer/admin из env); placeholder password блокирует unlink без установки реального пароля.

---

## 9. Код (ориентиры)

| Слой | Путь |
|------|------|
| Service | `backend/app/services/telegram_auth_service.py` |
| API | `backend/app/api/telegram_auth.py` |
| Schemas | `backend/app/schemas/telegram_auth.py` |
| Models | `user.py`, `auth_challenge.py`, `used_signature.py` |
| Rate limit | `backend/app/core/rate_limit.py` |
| Constant SSO hash | `backend/app/core/constants.py` → `SSO_BYPASS_HASH` |
| Unit tests | `backend/tests/test_auth_telegram.py` |
| FE | `frontend/src/shared/api/telegramAuth.ts`, `features/auth/telegram/TelegramLoginModal.tsx` |

```bash
cd backend && python -m pytest tests/test_auth_telegram.py -q
```
