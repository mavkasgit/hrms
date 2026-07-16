# Authentik IdP — перенесён

Единый IdP (**Authentik**) больше **не** живёт внутри HRMS.

## Где сейчас

| | |
|---|---|
| **Абсолютный путь** | `C:\Users\user\VibeCoding\authentik` |
| **Относительно HRMS** | `../../authentik` (sibling рядом с `hrms/`, `ktm2000/`) |

## Запуск

```powershell
cd C:\Users\user\VibeCoding\authentik
# или: cd ..\..\authentik  (из hrms/)
docker compose up -d
```

UI: **http://localhost:9000** (HTTPS: `9443`).

## Документация (в sibling-папке)

- [`README.md`](../../../authentik/README.md) — compose, ports, secrets
- [`BLUEPRINT.md`](../../../authentik/BLUEPRINT.md) — OIDC apps `hrms` / `ktm2000`
- [`TELEGRAM.md`](../../../authentik/TELEGRAM.md) — Telegram Source

Приложения настраивают issuer:

```env
AUTH_OIDC_ISSUER=http://localhost:9000/application/o/hrms/
```

См. корневой `.env.example` HRMS (`AUTH_OIDC_*`).
