# Карта защит

Что именно защищает проект, где эта защита ещё живёт, блокирует ли она и чем доказано, что умеет падать.

Список шагов между маркерами сверяется с `STEPS` из [`scripts/gate.mjs`](../../scripts/gate.mjs) машинно (`npm run check:docs`, шаг `docs-sync`). Добавили шаг — внесите строку; убрали — уберите. Иначе гейт красный.

Полная доктрина workspace — `harness/rules/quality-gates.md` (соседний репозиторий, вне этого checkout).

---

## 1. Ярусы

| Ярус | Команда | Состав | Бюджет | Где ещё живёт |
|------|---------|--------|--------|----------------|
| Fast | `npm run gate:fast` | статика по всему репозиторию, офлайн | **≤ 60 с** | `mise run check`, pre-push |
| Gate | `npm run gate` | fast + vitest + pytest (изолированная БД) | минуты | CI |
| E2E | `npm run gate:e2e` | gate + Playwright smoke | отдельный стенд | schedule / вручную |

`gate` и `gate:e2e` накопительные: `gate` включает `fast`, `e2e` — оба предыдущих яруса.

Стенд для `gate:e2e`: `npm run dev` (frontend `:5171`, backend `:8011`) и один раз `npx playwright install chromium`. Без живого стенда шаг печатается как `missing` (с `--strict` — краснеет).

`mise run check` не дублирует логику: это алиас `npm run gate:fast`.

---

## 2. Шаги

<!-- gate-steps:start -->

| Шаг | Ярус | Что ловит | Где ещё живёт | Блокирует | Доказано падает |
|-----|------|-----------|---------------|-----------|------------------|
| `docs-sync` | fast | шаг в коде без строки в этой карте и наоборот | CI test-backend: npm run check:docs | да | `proven-checks.json#docs-sync` |
| `verify-profile-settings` | fast | манифест версии ядра профиля разошёлся с кодом | CI test-backend (strict) | да | — |
| `reactuse-diff` | fast | новые ручные `matchMedia`/clipboard/observers вместо ReactUse | mise run reactuse-diff | да | `proven-checks.json#reactuse-diff` |
| `modern-web` | fast | новые legacy-паттерны веб-платформы сверх `docs/quality/modern-web-baseline.json` | mise run modern-web | да | `proven-checks.json#modern-web` |
| `frontend-types` | fast | ошибка типов `tsc -b` | — | да | — |
| `frontend-build` | fast | production-сборка frontend (`vite build`) | — | да | — |
| `frontend-unit` | gate | регрессия frontend (vitest) | mise run test | да | — |
| `backend-tests` | gate | регрессия backend (pytest, своя БД) | CI test-backend.yml | да | — |
| `e2e-smoke` | e2e | сломан пользовательский путь (Playwright smoke) | CI e2e-smoke.yml | да | — |

<!-- gate-steps:end -->

Колонка «Где ещё живёт» — не проза: `docs-sync` собирает её из поля `also` в `STEPS`. Удалили строку или поменяли ярус — гейт красный.

---

## 3. Как читать колонки

- **Где ещё живёт** — другая точка, где та же защита уже стоит.
- **Блокирует** — если «нет», это отчёт, а не защита; такие шаги живут в `doctor`/`schedule`.
- **Доказано падает** — запись в [`proven-checks.json`](proven-checks.json): реальное нарушение, падение шага, откат дерева. Полный прогон — `npm run prove-checks` на чистом дереве.

Минимум для ретро закрыт тремя шагами (`docs-sync`, `reactuse-diff`, `modern-web`). Остальные — честные пробелы, а не зелёные галочки: добавляйте запись в `proven-checks.json` вместе с новым шагом.

---

## 4. Что не попало в гейт и почему

| Проверка | Решение |
|----------|---------|
| `knip` | Отдельный тикет: установка и настройка ratchet-а в новом репозитории — не «прикрутить гейт». |
| Полный Playwright (`test:e2e`, `ui`, `api`, `auth`) | Долго и нужен стенд: `gate:e2e` держит только smoke, остальное — по запросу. |
| Синк-гейт `verify:sync` | Зависит от sibling-репозитория: свой pre-push и `.github/workflows/sync.yml`, а не шаг локального гейта. |

---

## 5. Регламент

1. Новый шаг = `STEPS` + строка здесь + запись в `proven-checks.json` — одним изменением.
2. `gate:fast` стабильно дольше 60 с — шаг ускоряют или переносят в `gate`/`gate:e2e`, а не поднимают лимит.
3. Упавший гейт не «чинится» отключением правила: `ignore`/`skip` — решение человека, с причиной и датой пересмотра.
4. Гейт ничего не правит: `--fix`/`--write`/`stage_fixed` внутри шагов запрещены. Фиксы — отдельная осознанная команда.
