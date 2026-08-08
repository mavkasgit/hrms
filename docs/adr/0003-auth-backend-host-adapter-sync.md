# ADR-0003: Auth-бэкенд — host-адаптеры и presence-гейт синхронизации HRMS/KTM

Дата: 2026-08-08. Статус: принято.

## Контекст

`backend/app/api/auth.py` в HRMS — роутер-монолит (~700 строк): break-glass login,
`/me*`, `/sessions*`, logout, backchannel-logout живут прямо в роутере. Аналогичная
структура в KTM-2000 (`app/api/routes/auth.py`, ~560 строк). При рефакторинге логика
выносится в сервисы: `break_glass_service`, `profile_service`, расширение `session_service`.

При этом HRMS и KTM делят must-match модули (`unified_profile_service`,
`authentik_client`, `session_core`, `oidc_core`) и имеют разные auth-фичи (HRMS:
`/sessions*`, DB-аудит break-glass; KTM: `/roles`, `/frontchannel-logout`). Дословное
копирование новых сервисов невозможно без потери функциональности одной из систем.

## Решение

Синхронизация auth-бэкенда между HRMS и KTM — через паттерн «core + host-адаптер»
плюс presence-гейт:

1. **Общая логика** — в `*_core.py` (must-match, режим `content` в `sync-manifest.json`).
2. **Новые сервисы** (`break_glass_service`, `profile_service`) — host-адаптеры
   одинаковой формы: те же имена и обязанности, содержимое своё (как `session_service`).
3. **Гейт расхождения** — файлы добавляются в `sync-manifest.json` с режимом
   `presence`: обязаны существовать в обоих репозиториях, байты не сверяются.
4. **KTM догоняет** тем же рефакторингом отдельным PR; presence-записи добавляются
   синхронно в оба манифеста, только когда зеркальные файлы у KTM уже существуют.

## Последствия

- Разные фичи (sessions, roles) — норм и ожидаемо; разная структура auth-роутера —
  исключается presence-гейтом.
- `verify-sync` начнёт падать, если один репозиторий удалит файл — это желаемое поведение.
- Схемы auth (`schemas/auth.py`) — host-specific (поля различаются), в манифест не входят.
