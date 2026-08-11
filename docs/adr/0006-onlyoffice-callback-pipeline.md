# ADR-0006: Единая статус-машина OnlyOffice-колбэков

Дата: 2026-08-10. Статус: принято.

## Контекст

5 колбэк-обработчиков в `api/onlyoffice.py` несли три разных семантики
(order/order-draft, template, notification/statement), per-kind дрейф статусов
(2/3/6 против 2/6), два рассинхронизированных save-state стора
(in-memory tracker + on-disk save_status) и приватные monkeypatch-тесты.
Статус-баги (3 без URL, 7) жили в каждом call-site.

## Решение

Один deep-модуль `OnlyOfficeCallbackPipeline` владеет lifecycle попытки
сохранения: `normalize_status` → `strategy.resolve_target` →
`download_and_replace` (порт `DocumentDownloader`) → `strategy.apply_persisted`
→ `tracker.mark_persisted`. Четыре вида (order, order-draft, notification,
statement) через registry; template остаётся отдельным path.
`request_forcesave` — в том же модуле, CommandClient отдельным портом.

Каноническая карта статусов: 2/6 → PERSISTED (скачиваем), 3/7 → FAILED
(не скачиваем даже при наличии URL), **4 → IGNORE** (не колбэк-save исход;
ACK 0, без tracker/strategy), прочие → IGNORE (ACK 0).
`CallbackResult(physical, http_error)` с
`PhysicalOutcome = PERSISTED | FAILED | IGNORE`: pipeline владеет physical,
strategy эскалирует только HTTP. `no_changes` — request-time исход,
не колбэк-исход. Correlation попытки — только userdata-echo (best-effort).

HTTP-маппинг в роутере — **единый для всех 4 видов**: `http_error=0` →
200 `{"error": 0}`, `http_error=1` → 500 `{"error": 1}`. Исторический
502 (download) для notification/statement намеренно заменён на единый
500 error:1: файл не скачан либо DB-эффект не применён — retry осмыслен.
Исторический 404 (missing) заменён на ACK 200 error:0: target не найден —
детерминированный промах, retry OnlyOffice не поможет (тест
`test_callback_unknown_record_acks_ok`). Различие статусов — семантика
save pipeline, не только диагностика.

## Почему

Консолидация устраняет исторический дрейф (в т.ч. сомнительное скачивание
по status 3 = ошибке), даёт один owner save-attempt и чистый тестовый seam
через порт вместо monkeypatch частного.

## Последствия

- Поведенческое изменение: status 3 + URL больше не скачивается (было у
  order/draft). 4 и 3/7 продолжают ACK-аться error=0.
- Callback без userdata не обновляет tracker; файловая персистенция
  выполняется независимо (correctness ≠ observability).
- HTTP-статусы ошибок унифицированы: у notification/statement
  download-failure → 500 error:1 (retry), target missing → ACK 200 error:0
  (повторов нет; retry-семантика OnlyOffice не меняется).
- Известный gap: forcesave принят → документ закрыт без изменений (status 4)
  → трекер остаётся pending до TTL/timeout. Сознательно не чинится здесь.
- `onlyoffice_service` остаётся адаптером и не импортирует pipeline
  (направление зависимостей не замыкается).
