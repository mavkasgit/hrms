# Authentik — единый IdP (HRMS + KTM-2000)

Локальный / small-scale **Authentik** (server + worker + PostgreSQL) для SSO.

| | |
|---|---|
| **Стек** | Authentik `2026.5.4`, Postgres 16, **без Redis** (убран с 2025.10) |
| **Образ** | `ghcr.io/goauthentik/server:2026.5.4` |
| **Порты** | HTTP `9000`, HTTPS `9443` |
| **Назначение** | Shared IdP: приложения **hrms** и **ktm2000** (Applications настраиваются в A2) |

Официальная документация: [Docker Compose install](https://docs.goauthentik.io/install-config/install/docker-compose/).

Compose в репозитории выровнен с [docs.goauthentik.io/compose.yml](https://docs.goauthentik.io/compose.yml) (тег зафиксирован на момент A1).

---

## Быстрый старт

### 1. Скопировать env и сгенерировать secrets

```powershell
cd infra/authentik
copy .env.example .env
```

**PowerShell (генерация secrets):**

```powershell
# PG_PASS
$pg = [Convert]::ToBase64String((1..36 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
# AUTHENTIK_SECRET_KEY (≥50 chars)
$sk = [Convert]::ToBase64String((1..60 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])

(Get-Content .env) `
  -replace 'PG_PASS=.*', "PG_PASS=$pg" `
  -replace 'AUTHENTIK_SECRET_KEY=.*', "AUTHENTIK_SECRET_KEY=$sk" |
  Set-Content .env
```

**OpenSSL / Git Bash / WSL:**

```bash
echo "PG_PASS=$(openssl rand -base64 36 | tr -d '\n')" >> .env
echo "AUTHENTIK_SECRET_KEY=$(openssl rand -base64 60 | tr -d '\n')" >> .env
```

(Если уже есть placeholder-строки в `.env` после `copy`, лучше заменить их, а не дублировать ключи.)

**Python one-liner:**

```powershell
python -c "import secrets; print('PG_PASS='+secrets.token_urlsafe(36)); print('AUTHENTIK_SECRET_KEY='+secrets.token_urlsafe(60))"
```

Вставьте вывод в `.env` вместо placeholder-значений.

> **Важно:** `AUTHENTIK_SECRET_KEY` должен быть длинным и случайным. Смена ключа инвалидирует активные сессии Authentik.  
> `PG_PASS` — не длиннее ~99 символов (ограничение Postgres).

### 2. Поднять стек

```powershell
cd infra/authentik
docker compose pull
docker compose up -d
```

Проверка:

```powershell
docker compose ps
docker compose config   # валидация YAML + env
```

### 3. Initial admin

Откройте в браузере:

**http://localhost:9000**

При первом заходе Authentik предложит задать пароль пользователю **`akadmin`**.

---

## Порты

| Порт (host) | Назначение |
|-------------|------------|
| `9000` | HTTP UI / API Authentik (`COMPOSE_PORT_HTTP`) |
| `9443` | HTTPS (`COMPOSE_PORT_HTTPS`) |

Не пересекаются с dev HRMS (`5173` FE, `8000` API, `5432` Postgres app, `8085` OnlyOffice).

Смена портов — в `.env`:

```env
COMPOSE_PORT_HTTP=9000
COMPOSE_PORT_HTTPS=9443
```

---

## Структура

```text
infra/authentik/
  docker-compose.yml   # server, worker, postgresql
  .env.example         # шаблон переменных
  .env                 # локальные secrets (не коммитить)
  BLUEPRINT.md         # A2: apps hrms/ktm2000, groups, claims, UI steps
  data/                # media/geoip (создаётся compose)
  certs/               # certs worker
  custom-templates/    # кастомные шаблоны UI
  README.md
```

Сервисы:

| Сервис | Роль |
|--------|------|
| `postgresql` | БД Authentik (отдельный volume, не БД HRMS) |
| `server` | HTTP/HTTPS UI, API, flows |
| `worker` | фоновые задачи; Docker socket для auto-outposts |

**Не монтировать** `/etc/timezone` / `/etc/localtime` в контейнеры Authentik — ломает OAuth/SAML (см. [issue #3005](https://github.com/goauthentik/authentik/issues/3005)).

---

## Secrets (чеклист)

| Переменная | Требование |
|------------|------------|
| `PG_PASS` | Сильный пароль; required |
| `AUTHENTIK_SECRET_KEY` | ≥50 случайных символов; required |
| `PG_USER` / `PG_DB` | по умолчанию `authentik` |
| `AUTHENTIK_TAG` | pin образа, сейчас `2026.5.4` |

Живые secrets **не** коммитить. Файл `.env` игнорируется git (корневой `.gitignore`).

Проверка применённого конфига:

```powershell
docker compose run --rm worker ak dump_config
```

---

## Shared IdP: HRMS + KTM-2000

Один instance Authentik — два **Application** (OIDC):

| Application (slug) | Клиент | Назначение |
|--------------------|--------|------------|
| `hrms` | SPA + API bridge | HRMS (приоритет) |
| `ktm2000` | SPA + API bridge | KTM-2000 (фаза 2) |

SSO: одна browser-сессия на Authentik → вход во второе приложение без полного re-login.

Интеграция приложений **не** входит в этот шаг (A1) — только runtime IdP.

---

## Applications blueprint (A2)

Пошаговая настройка Apps / groups / claims / env: **[`BLUEPRINT.md`](./BLUEPRINT.md)**.

| Application slug | client_id | Redirect (dev) |
|------------------|-----------|----------------|
| `hrms` | `hrms` | `http://localhost:5173/auth/callback` |
| `ktm2000` | `ktm2000` | `http://localhost:5180/auth/callback` |

Discovery (после UI create):  
`http://localhost:9000/application/o/<slug>/.well-known/openid-configuration`

HRMS env keys: корневой `.env.example` → `AUTH_OIDC_*`.

## Что дальше (A3+)

1. **A3–A4** — HRMS backend/frontend OIDC (Auth Code + PKCE) → bridge → app JWT + `sid`.
2. **A6** — KTM-2000 на тот же IdP.

Полезные ссылки после admin setup:

- [First steps](https://docs.goauthentik.io/install-config/first-steps/)
- [OAuth2 / OIDC provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)

---

## Upgrade

1. Скачать/сверить новый compose с docs (тег образа меняется).
2. Обновить `AUTHENTIK_TAG` в `.env` и default в `docker-compose.yml`.
3. `docker compose pull && docker compose up -d --remove-orphans`
4. Server и все outposts — **одна** версия.

---

## TODO (не в scope A1)

- [ ] Production TLS / reverse proxy (nginx) перед Authentik
- [ ] SMTP (`AUTHENTIK_EMAIL__*`) для recovery
- [ ] Docker Socket Proxy вместо raw `/var/run/docker.sock` (security)
- [ ] Managed Postgres вместо compose volume (крупный prod / K8s)
- [x] OIDC Applications blueprint (A2 — `BLUEPRINT.md`; create apps after initial-setup)
- [ ] OIDC интеграция HRMS/KTM (A3+)

---

## Troubleshooting

| Симптом | Действие |
|---------|----------|
| `database password required` | Заполните `PG_PASS` в `.env` |
| `secret key required` | Заполните `AUTHENTIK_SECRET_KEY` |
| Нет initial setup UI | См. [troubleshooting login](https://docs.goauthentik.io/troubleshooting/login/) |
| Порт занят | Смените `COMPOSE_PORT_HTTP` / `HTTPS` |
| После upgrade «висит» Redis | Redis с 2025.10 не нужен; `up -d --remove-orphans` |

Остановка:

```powershell
docker compose down
# с удалением volume БД (destructive):
# docker compose down -v
```
