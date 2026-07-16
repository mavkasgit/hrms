# Authentik Blueprint — Applications `hrms` + `ktm2000`

**Версия:** A2 · 2026-07-16  
**IdP:** `infra/authentik/` (compose, pin `2026.5.4`)  
**Admin UI (dev):** http://localhost:9000  
**Epic:** `.opencode/plans/authentik-unified-idp.md` (R2 hybrid bridge, R4 Auth Code + PKCE)

Этот документ — **канон** для ручной настройки IdP и для задач **A3/A4** (backend/frontend OIDC).  
Живые `client_secret` / API tokens **не** коммитить.

---

## 0. Решение по bridge (A3 contract)

| | |
|---|---|
| **Выбор** | **Public SPA + PKCE + backend exchange/verify → `complete_login`** |
| **Не делаем v1** | Голый OIDC JWT в API на каждый запрос; confidential secret в frontend bundle |
| **Почему** | HRMS уже требует app JWT с `sid` + `user_sessions`; IdP-токены используются **только** на callback |

### Поток (зафиксировано для A3/A4)

```text
1. FE (Login)  →  redirect browser to Authentik authorize
                  (response_type=code, client_id=hrms, PKCE S256,
                   scope=openid profile email hrms_access,
                   redirect_uri=http://localhost:5173/auth/callback,
                   state, code_challenge)

2. User login  →  Authentik session (SSO cookie)

3. Authentik   →  redirect FE /auth/callback?code=...&state=...

4. FE callback →  POST /api/auth/oidc/callback
                  { code, state, code_verifier, redirect_uri }

5. Backend     →  token endpoint exchange (public client + code_verifier)
               →  validate id_token (JWKS, iss, aud=client_id, exp)
               →  read claims: sub, preferred_username/email, hrms_access_level
               →  link/create local User (by authentik_sub / email / username)
               →  session_service.complete_login(..., login_method="oidc")
               →  return app JWT (sub, username, full_name, hrms_access_level, sid)

6. FE          →  store app JWT (localStorage.token as today); normal /api calls
```

**Альтернатива (не preferred):** confidential client — secret **только** на backend, FE не шлёт `code_verifier` (или PKCE + secret). Допустимо позже; blueprint v1 = **public + PKCE**.

**Dual-run:** пока `AUTH_OIDC_ENABLED=false` — password / invite / TG login без изменений (R10).

---

## 1. Сводная таблица приложений

| Параметр | **hrms** | **ktm2000** (фаза 2 / A6) |
|----------|----------|---------------------------|
| Application name | `HRMS` | `KTM-2000` |
| Application **slug** (= path segment) | `hrms` | `ktm2000` |
| **client_id** (рекомендуем = slug) | `hrms` | `ktm2000` |
| Client type | **Public** | **Public** |
| Protocol | OAuth2 / OIDC | OAuth2 / OIDC |
| Grant | Authorization Code + **PKCE (S256)** | same |
| Signing Key | **обязательно** (asymmetric → JWKS) | same |
| Encryption Key | off (v1) | off |
| Issuer mode | **Per-provider** (default) | same |
| Scopes (request) | `openid profile email hrms_access` | `openid profile email` (+ later ktm claims) |
| Refresh (`offline_access`) | **off** v1 (app session covers TTL) | off v1 |

### Issuer / discovery (dev)

| | URL pattern |
|---|-------------|
| **Issuer (`iss`)** | `http://localhost:9000/application/o/<slug>/` |
| **Discovery** | `http://localhost:9000/application/o/<slug>/.well-known/openid-configuration` |
| **JWKS** | `http://localhost:9000/application/o/<slug>/jwks/` |
| **Authorize** | `http://localhost:9000/application/o/authorize/` |
| **Token** | `http://localhost:9000/application/o/token/` |
| **UserInfo** | `http://localhost:9000/application/o/userinfo/` |
| **End session** | `http://localhost:9000/application/o/<slug>/end-session/` |

> Reserved slugs (нельзя): `authorize`, `token`, `device`, `userinfo`, `introspect`, `revoke`.

### Redirect / logout URIs (dev) — **канон для A3/A4**

| App | Type | URI |
|-----|------|-----|
| hrms | Redirect | `http://localhost:5173/auth/callback` |
| hrms | Redirect | `http://127.0.0.1:5173/auth/callback` |
| hrms | Post-logout / Login landing | `http://localhost:5173/login` |
| hrms | Post-logout | `http://127.0.0.1:5173/login` |
| ktm2000 | Redirect (placeholder) | `http://localhost:5180/auth/callback` |
| ktm2000 | Redirect | `http://127.0.0.1:5180/auth/callback` |
| ktm2000 | Post-logout | `http://localhost:5180/login` |
| ktm2000 | Post-logout | `http://127.0.0.1:5180/login` |

**FE route name (A4):** `/auth/callback` — **не** `/login/oidc/callback`.  
**API (A3):** `POST /api/auth/oidc/callback` (и при необходимости `GET /api/auth/oidc/login` для start URL).

Prod/test: заменить origin на `BASE_URL` / `PUBLIC_URL`; pin exact URIs, regex только при необходимости (`\.` escape).

---

## 2. Groups + claim `hrms_access_level`

### 2.1 Groups (Directory)

Создать в **Directory → Groups**:

| Group name | Назначение |
|------------|------------|
| `hrms-admin` | Полный доступ HRMS (`hrms_access_level=admin`) |
| `hrms-viewer` | Только чтение (`hrms_access_level=viewer`) |

Опционально позже: `ktm2000-users` и т.п. (A6).

**Правило приоритета:** membership в `hrms-admin` **важнее** `hrms-viewer`.  
Нет ни одной группы → claim `no_access` (API отклонит, как сегодня в `deps.py`).

### 2.2 Scope mapping (custom claim)

**Customization → Property Mappings → Create → Scope Mapping**

| Field | Value |
|-------|--------|
| Name | `hrms_access` scope → `hrms_access_level` |
| Scope name | `hrms_access` |
| Description | Maps Authentik groups to HRMS RBAC claim |
| Expression | см. ниже |

```python
# Scope mapping: hrms_access
# Claim consumed by HRMS bridge → app JWT hrms_access_level (admin|viewer|no_access)

groups = {g.name for g in request.user.groups.all()}
if "hrms-admin" in groups:
    level = "admin"
elif "hrms-viewer" in groups:
    level = "viewer"
else:
    level = "no_access"

return {
    "hrms_access_level": level,
}
```

На провайдере **hrms** включить scope mappings:

- built-in: `openid`, `profile`, `email`
- custom: `hrms_access` (выше)

Клиент **обязан** запрашивать scope `hrms_access` (см. `AUTH_OIDC_SCOPES`).

### 2.3 Application access policies (рекомендуется)

На Application **HRMS** → **Policy / Group bindings**:

- bind group `hrms-admin`
- bind group `hrms-viewer`

Пользователь без групп не получит consent/login в app (отдельно от claim `no_access`).

**Разделение:**

| Слой | Что делает |
|------|------------|
| Application policy | Можно ли войти в OIDC app |
| Claim `hrms_access_level` | Какой RBAC в HRMS API после bridge |
| Local `User.role` | Синхронизируется из claim (как сейчас из JWT) |

### 2.4 Связка с HRMS JWT (после bridge)

App JWT (как сейчас `auth_token.create_access_token`):

| Claim | Источник после OIDC bridge |
|-------|----------------------------|
| `sub` / `username` | local User (linked by Authentik `sub` / email) |
| `full_name` | local User / id_token `name` |
| `hrms_access_level` | id/access token claim **или** local role after sync |
| `sid` | new `user_sessions` row (`login_method="oidc"`) |
| `exp` | app TTL (`ACCESS_TOKEN_EXPIRE_MINUTES`) |

IdP tokens **не** ходят в `Authorization` на обычные `/api/*` endpoints.

---

## 3. UI steps — создание Applications (Admin)

**Предусловия:** initial setup выполнен (`akadmin` password set), вход в Admin interface.

### 3.0 One-time: groups + scope mapping

1. **Directory → Groups → Create**  
   - Name: `hrms-admin` → Create  
   - Name: `hrms-viewer` → Create  
2. **Directory → Users** — назначить тестового user в нужную группу (или создать user).  
3. **Customization → Property Mappings → Create**  
   - Type: **Scope Mapping**  
   - Name / Scope name / Expression — §2.2  
   - Create  

### 3.1 Application + Provider: **hrms**

1. **Applications → Applications → Create with Provider**  
   (кнопка *Create with Provider* / *New Provider* wizard — docs: [Create OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/create-oauth2-provider/))
2. **Application**  
   - Name: `HRMS`  
   - Slug: `hrms`  
   - (optional) Launch URL: `http://localhost:5173/`  
   - Next  
3. **Provider type:** OAuth2/OpenID Connect → Next  
4. **Configure OAuth2/OpenID Provider**  
   - Name: `Provider for HRMS` (или auto)  
   - Authorization flow: default explicit consent / default authentication (оставить default brand flow, если подходит)  
   - **Client type: Public**  
   - Client ID: `hrms` (или сгенерированный — тогда **перенести в** `AUTH_OIDC_CLIENT_ID`; предпочтительно зафиксировать `hrms`)  
   - Client secret: **не используется** SPA (public); backend exchange без secret  
   - **Redirect URIs:**  
     ```text
     http://localhost:5173/auth/callback
     http://127.0.0.1:5173/auth/callback
     ```  
   - **Signing Key:** выбрать любой self-signed / generated certificate (обязательно для JWKS)  
   - **Scope mappings:** `openid`, `profile`, `email`, `hrms_access`  
   - **Subject mode:** default (User UUID / recommended) — backend хранит `authentik_sub`  
   - **Issuer mode:** Each provider has a different issuer (default)  
   - Advanced (optional v1): short access token lifetime (минуты); refresh **не** включать  
   - Submit  
5. **Application → HRMS → Policy bindings**  
   - Bind `hrms-admin`, `hrms-viewer`  
6. Скопировать с provider page:  
   - Client ID  
   - OpenID Configuration URL  
   - JWKS URL  
   → в **локальный** `.env.dev` (не commit secrets; для public client secret пустой)

### 3.2 Application + Provider: **ktm2000** (placeholder)

Повторить §3.1:

| Field | Value |
|-------|--------|
| Name | `KTM-2000` |
| Slug / client_id | `ktm2000` |
| Client type | Public |
| Redirect | `http://localhost:5180/auth/callback`, `http://127.0.0.1:5180/auth/callback` |
| Scopes | `openid`, `profile`, `email` (custom claims — A6) |
| Signing Key | same or separate cert |
| Policies | optional group later |

Интеграция кода KTM — **A6**, не A3.

### 3.3 Проверка discovery (после create)

```powershell
Invoke-RestMethod "http://localhost:9000/application/o/hrms/.well-known/openid-configuration" | ConvertTo-Json -Depth 5
```

Ожидание: `issuer` = `http://localhost:9000/application/o/hrms/`, есть `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `code_challenge_methods_supported` включает `S256`.

### 3.4 Logout (v1 notes)

- RP-initiated: browser → `/application/o/hrms/end-session/`  
- Default: инвалидируется session **этого** provider; SSO cookie Authentik может остаться (SSO в ktm2000).  
- Full SLO: добавить User Logout stage в invalidation flow (см. [SLO docs](https://docs.goauthentik.io/add-secure-apps/providers/single-logout/)) — **не блокер A3**.  
- FE logout: `POST /api/auth/logout` (revoke app `sid`) + optional IdP end-session + clear `localStorage.token`.

---

## 4. Telegram Source (optional later — только документ)

**Не** включать в v1 cutover HRMS. Dual-run R5: app-level TG (bot QR / link) остаётся.

### Prerequisites

| # | Требование |
|---|------------|
| 1 | Authentik на **реальном FQDN** (не bare IP для Telegram domain rules) |
| 2 | `@BotFather` → bot (можно отдельный IdP-bot ≠ `ktm2000_bot`) |
| 3 | BotFather `/setdomain` = **точный** FQDN Authentik |
| 4 | HTTPS public (Telegram Widget / Login) |

### Admin path (когда готово)

1. **Directory → Federation and Social login → Create → Telegram**  
2. Bot username + token  
3. Property mappings: `info` → `id`, `username`, `first_name`, …  
4. Добавить source на default login flow ([docs](https://docs.goauthentik.io/users-sources/sources/social-logins/telegram/))  

Source логинит **в Authentik**; OIDC apps получают SSO session.  
HRMS TG **link/unlink** columns и bot challenge — app domain, не переносим в v1.

---

## 5. HRMS env keys (A3)

Добавлены в корневой `.env.example`. Значения для **локального** `.env.dev` после UI create:

```env
# OIDC / Authentik (A3) — dual-run: false = только local login
AUTH_OIDC_ENABLED=false
AUTH_OIDC_ISSUER=http://localhost:9000/application/o/hrms/
AUTH_OIDC_CLIENT_ID=hrms
AUTH_OIDC_CLIENT_SECRET=
AUTH_OIDC_REDIRECT_URI=http://localhost:5173/auth/callback
AUTH_OIDC_SCOPES=openid profile email hrms_access
# Optional overrides (derive from discovery if empty)
# AUTH_OIDC_AUTHORIZATION_URL=
# AUTH_OIDC_TOKEN_URL=
# AUTH_OIDC_JWKS_URL=
# AUTH_OIDC_END_SESSION_URL=
```

| Key | A3 usage |
|-----|----------|
| `AUTH_OIDC_ENABLED` | Gate dual-run; show IdP button / accept OIDC callback |
| `AUTH_OIDC_ISSUER` | Validate `iss`; discovery base |
| `AUTH_OIDC_CLIENT_ID` | authorize + token + `aud` check |
| `AUTH_OIDC_CLIENT_SECRET` | empty for public; set only if confidential BFF |
| `AUTH_OIDC_REDIRECT_URI` | must **exact-match** provider allow-list |
| `AUTH_OIDC_SCOPES` | space-separated; include `hrms_access` |

**Не коммитить** заполненный `AUTH_OIDC_CLIENT_SECRET` (если появится).  
Public client: secret field empty is correct.

---

## 6. Optional: Authentik Blueprint YAML (apply after admin exists)

Файлы можно положить в `infra/authentik/blueprints/` и применить через Admin **Blueprints** или `ak apply_blueprint` в worker — **после** initial setup.  
Ниже — **черновик** (имена flows/certs зависят от instance; UI path §3 надёжнее для первого раза).

```yaml
# infra/authentik/blueprints/hrms-apps.draft.yaml
# DRAFT — verify flow/certificate names on your instance before apply.
version: 1
metadata:
  name: hrms-oidc-apps
entries:
  - model: authentik_core.group
    identifiers:
      name: hrms-admin
    attrs:
      name: hrms-admin
  - model: authentik_core.group
    identifiers:
      name: hrms-viewer
    attrs:
      name: hrms-viewer
  - model: authentik_providers_oauth2.scopemapping
    identifiers:
      scope_name: hrms_access
    attrs:
      name: hrms_access → hrms_access_level
      scope_name: hrms_access
      expression: |
        groups = {g.name for g in request.user.groups.all()}
        if "hrms-admin" in groups:
            level = "admin"
        elif "hrms-viewer" in groups:
            level = "viewer"
        else:
            level = "no_access"
        return {"hrms_access_level": level}
  # OAuth2Provider + Application: create via UI wizard first time
  # (Signing Key certificate PK is instance-specific)
```

Полноценный auto-create provider через blueprint потребует UUID существующего certificate + authorization flow — зафиксировать после first admin setup, если понадобится IaC.

---

## 7. API automation (если есть token)

Если создан Admin API token (**Directory → Tokens and App passwords**):

```http
Authorization: Bearer <token>
Base: http://localhost:9000/api/v3/
```

Полезные endpoints (см. OpenAPI на instance):

- `POST /api/v3/core/groups/`
- `POST /api/v3/propertymappings/provider/scope/`
- `POST /api/v3/providers/oauth2/` (`client_type=public`, redirect_uris, signing_key)
- `POST /api/v3/core/applications/`
- `PUT /api/v3/core/transactional/applications/` (app+provider pair)

**A2 status:** instance был на `/-/health/ready` + initial-setup; **API token отсутствовал** → apps **не** создавались автоматически. После setup admin — либо UI §3, либо API с token (не commit).

---

## 8. Чеклист DoD A2

| Критерий | Статус |
|----------|--------|
| BLUEPRINT.md complete (RU) | ✅ this file |
| Redirect paths fixed for A3/A4 (`/auth/callback`) | ✅ |
| Claim mapping design (`hrms_access` → `hrms_access_level`) | ✅ |
| Groups `hrms-admin` / `hrms-viewer` | ✅ designed |
| Bridge choice documented (public PKCE + backend) | ✅ |
| Telegram Source prerequisites (optional) | ✅ §4 |
| `.env.example` AUTH_OIDC_* | ✅ root `.env.example` |
| Apps created in running Authentik | ⏳ manual after initial-setup / token |
| Secrets not committed | ✅ |

---

## 9. Next

1. Завершить Authentik **initial-setup** (akadmin).  
2. Выполнить §3 UI (или API §7).  
3. Заполнить локальный `.env.dev` ключами §5.  
4. **A3** — backend: settings, discovery/JWKS, `POST /api/auth/oidc/callback`, user link, `complete_login(login_method="oidc")`.  
5. **A4** — FE: IdP button, `/auth/callback`, dual-run UI.

### Ссылки

- [OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)  
- [Create OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/create-oauth2-provider/)  
- [Property / scope mappings](https://docs.goauthentik.io/add-secure-apps/providers/property-mappings/)  
- [Telegram source](https://docs.goauthentik.io/users-sources/sources/social-logins/telegram/)  
- [First steps](https://docs.goauthentik.io/install-config/first-steps/)  
- Local ops: [`README.md`](./README.md)  
