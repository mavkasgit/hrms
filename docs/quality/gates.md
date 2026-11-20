# Карта защит

Что именно защищает проект, где эта защита ещё живёт, блокирует ли она и чем доказано, что умеет падать.

Список шагов между маркерами сверяется с `STEPS` из [`scripts/gate.mjs`](../../scripts/gate.mjs) машинно (`npm run check:docs`, шаг `docs-sync`): имя, ярус, CI и колонка «Доказано падает». Добавили шаг — внесите строку; убрали — уберите. Иначе гейт красный.

Полная доктрина workspace — `harness/rules/quality-gates.md` (соседний репозиторий, вне этого checkout).

---

## 1. Ярусы

| Ярус | Команда | Состав | Бюджет | Где ещё живёт |
|------|---------|--------|--------|----------------|
| Fast | `npm run gate:fast` | статика по всему репозиторию, офлайн | **≤ 60 с** | `mise run gate:fast`, pre-push |
| Gate | `npm run gate` | fast + vitest + pytest (изолированная БД) | минуты | `mise run check`, CI |
| E2E | `npm run gate:e2e` | gate + Playwright smoke | отдельный стенд | schedule / вручную |

`gate` и `gate:e2e` накопительные: `gate` включает `fast`, `e2e` — оба предыдущих яруса.

Стенд для `gate:e2e`: `npm run dev` (frontend `:5171`, backend `:8011`) и один раз `npx playwright install chromium`. Без живого стенда шаг печатается как `missing` (с `--strict` — краснеет).

`mise run check` не дублирует логику: это алиас `npm run gate` (полный прогон, включая vitest и pytest). Быстрый ярус — отдельная задача `mise run gate:fast` (алиас `npm run gate:fast`).

---

## 2. Шаги

<!-- gate-steps:start -->

| Шаг | Ярус | Что ловит | CI | Блокирует | Доказано падает |
|-----|------|-----------|----|-----------|------------------|
| `docs-sync` | fast | шаг в коде без строки в этой карте и наоборот, шаг без доказательства | test-backend.yml | да | `proven-checks.json#docs-sync` |
| `docs-lint` | fast | структурные дефекты Markdown (fences, списки, заголовки) и битые относительные ссылки | npm run gate | да | `proven-checks.json#docs-lint` |
| `verify-profile-settings` | fast | манифест версии ядра профиля разошёлся с кодом | test-backend.yml | да | `proven-checks.json#verify-profile-settings` |
| `reactuse-diff` | fast | новые ручные `matchMedia`/clipboard/observers вместо ReactUse | npm run gate | да | `proven-checks.json#reactuse-diff` |
| `modern-web` | fast | новые legacy-паттерны веб-платформы сверх `docs/quality/modern-web-baseline.json` | npm run gate | да; `missing` (сканер недоступен) — только с `--strict` | `proven-checks.json#modern-web` |
| `frontend-types` | fast | ошибка типов `tsc -b` | npm run gate | да | `proven-checks.json#frontend-types` |
| `frontend-build` | fast | production-сборка frontend (`vite build`, без повторного `tsc -b`) | npm run gate | да | `proven-checks.json#frontend-build` |
| `frontend-unit` | gate | регрессия frontend (vitest) | npm run gate | да | `proven-checks.json#frontend-unit` |
| `backend-tests` | gate | регрессия backend (pytest, своя БД) | test-backend.yml | да | `exempt: нужна изолированная БД` |
| `e2e-smoke` | e2e | сломан пользовательский путь (Playwright smoke) | e2e-smoke.yml | да, если стенд жив; `missing` — только с `--strict` | `exempt: нужен живой стенд` |

<!-- gate-steps:end -->

Колонка «CI» — не проза: `docs-sync` сверяет её с полем `ci` в `STEPS`. `npm run gate` здесь значит «шаг живёт в полном гейте, отдельного workflow нет»; имя файла — конкретный workflow.

---

## 3. Как читать колонки

- **CI** — где шаг уже есть: workflow или `npm run gate`, если отдельного workflow нет.
- **Блокирует** — `fail` блокирует всегда. `missing` — это видимое «не проверено», и он краснеет **только с `--strict`**; поэтому шаги, которые могут быть `missing` (нет стенда, сканера, инструмента), помечены отдельно. Зелёный прогон с `missing` без `--strict` не значит «проверено всё».
- **Доказано падает** — `proven-checks.json#<шаг>`: реальное нарушение, падение шага, откат дерева. Либо `exempt` с причиной и датой пересмотра в [`proven-checks.json`](proven-checks.json), если локально доказать нельзя. Обе колонки сверяются машинно (`npm run check:docs`), полный прогон — `npm run prove-checks` на чистом дереве.

Минимум для ретро закрыт шагами `docs-sync`, `reactuse-diff`, `modern-web`; сейчас доказательство или явное исключение есть у каждого шага.

---

## 4. Что не попало в гейт и почему

| Проверка | Решение |
|----------|---------|
| `knip` | Отдельный тикет: установка и настройка ratchet-а в новом репозитории — не «прикрутить гейт». |
| Полный Playwright (`test:e2e`, `ui`, `api`, `auth`) | Долго и нужен стенд: `gate:e2e` держит только smoke, остальное — по запросу. |
| Синк-гейт `verify:sync` | Зависит от sibling-репозитория: свой pre-push (после `gate:fast`, только если `../ktm2000` рядом) и `.github/workflows/sync.yml`. |
| `guard-tree` | **Явное исключение до 2027-06-30.** В hrms один target-checkout без соседних worktree, а «запись в чужое дерево» проверяется только при наличии списка разрешённых корней — его у проекта нет. Риск закрыт процессом (агент работает в корне проекта) и `git status` в `npm run doctor`. Появится второй worktree — проверку вернуть как шаг гейта. |

---

## 5. Регламент

1. Новый шаг = `STEPS` + строка здесь + запись в [`proven-checks.json`](proven-checks.json) (или `exempt` с причиной и `expires`) — одним изменением.
2. `gate:fast` стабильно дольше 60 с — шаг ускоряют или переносят в `gate`/`gate:e2e`, а не поднимают лимит. `tsc` и `vite build` не дублируются: сборка идёт через `build:vite` после `frontend-types`.
3. Упавший гейт не «чинится» отключением правила: `ignore`/`skip`/`exempt` — решение человека, с причиной и датой пересмотра.
4. Гейт ничего не правит: `--fix`/`--write`/`stage_fixed` внутри шагов запрещены. Фиксы — отдельная осознанная команда.
