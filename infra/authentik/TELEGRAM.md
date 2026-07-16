# Authentik Telegram Source — единый вход (TG1)

**Epic:** unified IdP · primary interactive login via Telegram  
**Related:** [`BLUEPRINT.md`](./BLUEPRINT.md) §4 · HRMS OIDC bridge (`AUTH_OIDC_*`)  
**Do not commit** bot tokens / secrets.

---

## Цель

```text
HRMS «Войти через Telegram»
  → Authentik authorize (OIDC + PKCE)
  → Telegram Source (Login Widget HMAC)
  → Authentik SSO session
  → OIDC code → HRMS POST /api/auth/oidc/callback
  → link User (authentik_sub / telegram_id claim / username)
  → app JWT (login_method=oidc_telegram | oidc)
```

Та же SSO-сессия Authentik позже откроет **KTM-2000** без повторного Telegram (фаза A6).

---

## 0. Требования

| # | Требование |
|---|------------|
| 1 | Authentik **≥ 2025.10** (рекомендуется **≥ 2025.12** — connect existing user) |
| 2 | Публичный **FQDN** для Authentik (не bare IP) — Telegram domain rules |
| 3 | HTTPS (prod) или tunnel (dev) — см. § Localhost |
| 4 | HRMS OIDC bridge уже настроен (`BLUEPRINT.md` §3, `AUTH_OIDC_ENABLED=true`) |
| 5 | Отдельный бот для IdP **предпочтителен** (см. § Bot) |

---

## 1. BotFather — бот для IdP

### Рекомендация: отдельный IdP-бот

| Бот | Назначение |
|-----|------------|
| **IdP bot** (например `hrms_authentik_bot`) | Только Authentik Telegram Source (Widget HMAC) |
| **App bot** (`ktm2000_bot` и т.п.) | Deep-link / notifications / invite в HRMS |

**Почему не shared token:**

- Legacy `/setdomain` — **один** domain = FQDN Authentik (не origin HRMS).
- Webhook / `getUpdates` **эксклюзивны** для одного consumer: polling HRMS украдёт updates у другого.
- Компрометация token затрагивает IdP + app; UX «один бот в двух местах» путает пользователей.

Shared token **возможен** только если: Authentik = Widget only, HRMS — единственный Bot API consumer, domain = Authentik. **Не рекомендуется.**

### Шаги

1. `@BotFather` → `/newbot` → name + username (например `hrms_authentik_bot`).
2. Сохранить **token** и **username** (без `@` в Authentik UI).
3. `/setdomain` → **точный** FQDN Authentik (как в браузере пользователя), без `https://`, без path.
4. Опционально: request message access (если Source UI предлагает) — не обязателен для login.

---

## 2. Authentik Admin — Telegram Source

1. **Directory → Federation and Social login → Create → Telegram**
2. Name / slug (например `Telegram` / `telegram`)
3. **Bot username** + **Bot token**
4. Save

### Показать на странице входа

1. **Flows → default-authentication-flow → Stage Bindings**
2. Stage **default-authentication-identification** → **Source settings**
3. **Selected sources** → добавить Telegram

Документация: [Telegram Source](https://docs.goauthentik.io/users-sources/sources/social-logins/telegram/), [Add sources to login](https://docs.goauthentik.io/users-sources/sources/#add-sources-to-default-login-page).

### Enrollment policy

Open enrollment = любой TG-аккаунт может создать IdP user. Для корпоративного режима:

- ограничить enrollment flow политиками / invitation; или
- pre-create Authentik users + connect TG; или
- HRMS с `AUTH_OIDC_ALLOW_JIT=false` (default) — без local link вход в app запрещён (`oidc_user_not_linked`).

---

## 3. Property mapping — claim `telegram_id`

HRMS link order (TG1):

1. `authentik_sub` (`sub`)
2. **`telegram_id` claim** → `users.telegram_id`
3. `preferred_username` / email
4. JIT (если `AUTH_OIDC_ALLOW_JIT=true`)

Telegram Source кладёт identity в `info.id` (numeric). Нужно **пробросить** в OIDC id_token.

### Scope mapping (рекомендуемый путь)

**Customization → Property Mappings → Create → Scope Mapping**

| Field | Value |
|-------|--------|
| Name | `telegram_id` from Telegram Source |
| Scope name | `profile` *(или отдельный scope, если добавляете в client scopes)* |
| Expression | см. ниже |

```python
# Scope mapping: telegram_id (Authentik expression)
# Source connection identifier = Telegram user id (string/int)

tg_id = None
tg_username = None

# Connections on the Authentik user (Telegram source)
for conn in request.user.source_connections.all():
    # identifier is Telegram numeric id as string
    # Filter by source slug if multiple sources exist
    src = getattr(conn, "source", None)
    slug = getattr(src, "slug", None) if src is not None else None
    if slug and slug != "telegram":
        continue
    ident = getattr(conn, "identifier", None)
    if ident:
        tg_id = ident
        break

# Optional: attributes set by source enrollment
attrs = getattr(request.user, "attributes", None) or {}
if tg_id is None:
    tg_id = attrs.get("telegram_id") or attrs.get("id")
tg_username = attrs.get("telegram_username") or attrs.get("username")

out = {}
if tg_id is not None:
    out["telegram_id"] = str(tg_id)  # HRMS accepts str or int
if tg_username:
    out["telegram_username"] = str(tg_username).lstrip("@")

return out
```

> Имена моделей connection / filter by source slug зависят от версии Authentik.  
> Проверьте expression в Admin → **Test** / debug login, и что claim появляется в id_token  
> (jwt.io после exchange, или backend logs). При необходимости упростите до чтения  
> `request.user.attributes["…"]` после Source property mapping на enrollment.

### Source property mapping (альтернатива / дополнение)

На Telegram Source можно задать expression mapping, чтобы при enrollment/login писать:

```python
# Source mapping example — store on Authentik user attributes
return {
    "username": info.get("username") or f"tg_{info['id']}",
    "name": " ".join(
        p for p in [info.get("first_name"), info.get("last_name")] if p
    ) or f"Telegram {info['id']}",
    "attributes": {
        "telegram_id": str(info["id"]),
        "telegram_username": info.get("username"),
    },
}
```

Затем scope mapping читает `request.user.attributes["telegram_id"]`.

### Provider hrms

Убедитесь, что mapping активен на provider **HRMS** (scope list включает `profile` / custom scope).  
Клиент HRMS запрашивает: `AUTH_OIDC_SCOPES=openid profile email hrms_access`.

---

## 4. HRMS env (после Source + mapping)

```env
AUTH_OIDC_ENABLED=true
AUTH_OIDC_ISSUER=https://<authentik-fqdn>/application/o/hrms/
AUTH_OIDC_CLIENT_ID=hrms
AUTH_OIDC_REDIRECT_URI=https://<hrms-origin>/auth/callback
AUTH_OIDC_SCOPES=openid profile email hrms_access
AUTH_OIDC_ALLOW_JIT=false
AUTH_OIDC_TELEGRAM_PRIMARY=true
```

| Flag | Effect |
|------|--------|
| `AUTH_OIDC_TELEGRAM_PRIMARY=true` | FE: primary CTA «Войти через Telegram»; hide in-app bot QR login on LoginPage; helper «Единый вход для HRMS и KTM-2000» |
| `AUTH_OIDC_ALLOW_JIT=false` | Только pre-linked local users (по sub / telegram_id / username) |

**Pre-link:** HRMS users с заполненным `telegram_id` матчятся claim'ом при первом OIDC login; `authentik_sub` записывается автоматически.

---

## 5. Localhost / FQDN (T7)

Telegram **требует** domain (FQDN), не bare IP и не `localhost` для Widget `/setdomain`.

### Dev options

| Option | Notes |
|--------|--------|
| **Cloudflare Tunnel** | `cloudflared tunnel` → Authentik `:9000` (или nginx front) |
| **ngrok / similar** | HTTPS URL → Authentik; set Authentik external URL / brand domain |
| **Real DNS** | `auth.dev.example.com` → lab host |

Checklist:

1. Authentik **external host** / brand domain = public FQDN (cookies + redirects).
2. BotFather `/setdomain` = **тот же** FQDN.
3. OAuth redirect URIs для HRMS FE origin (может остаться `localhost:5173` если FE local, а IdP public — redirect_uri = FE origin).
4. CORS / COOP: `Cross-Origin-Opener-Policy: same-origin` ломает Telegram popup — избегайте на IdP login pages.

---

## 6. Manual checklist (live)

1. [ ] Authentik initial setup + OAuth app `hrms` (`BLUEPRINT.md` §3)
2. [ ] Scope mapping `hrms_access` + groups
3. [ ] BotFather IdP bot + `/setdomain`
4. [ ] Telegram Source + bind to identification stage
5. [ ] Property/scope mapping claim `telegram_id`
6. [ ] `AUTH_OIDC_ENABLED=true`, issuer/client/redirect
7. [ ] `AUTH_OIDC_TELEGRAM_PRIMARY=true` (UX cutover)
8. [ ] Test user: HRMS `telegram_id` = TG account id → login via button → session `oidc_telegram`
9. [ ] Second app (KTM) later: same IdP session → no second TG (A6)

---

## 7. Dual-run / rollback

| Mode | Config |
|------|--------|
| Dual-run | `AUTH_OIDC_ENABLED=true`, `AUTH_OIDC_TELEGRAM_PRIMARY=false` — SSO + app bot TG + password |
| TG SSO primary | `AUTH_OIDC_TELEGRAM_PRIMARY=true` — hide LoginPage bot modal; API bot login still exists |
| Full off | `AUTH_OIDC_ENABLED=false` |

App TG API **не удаляется** в TG1 (только UI hide behind flag).

---

## Ссылки

- [Authentik Telegram Source](https://docs.goauthentik.io/users-sources/sources/social-logins/telegram/)
- [Login Widget (legacy)](https://core.telegram.org/widgets/login-legacy)
- [BotFather](https://core.telegram.org/bots/features#botfather)
- Local: [`BLUEPRINT.md`](./BLUEPRINT.md), [`README.md`](./README.md), `docs/telegram-auth.md`
