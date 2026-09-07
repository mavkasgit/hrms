# ADR-0012: auto_use_days списывает дни только для «Трудовой» отпуск

Дата: 2026-09-07. Статус: принято.

## Контекст

`auto_use_days` (`backend/app/services/vacation_period_service.py:1024`) —
единственная точка, которая уменьшает `vacation_periods.used_days` и
`used_days_auto` при создании приказа/формы отпуска. До принятия этого ADR
она принимала `days_to_use` и `order_id`/`vacation_id`, но не различала
`vacation_type`. Это позволило:

1. **Коммиту c16d740 (2026-08-06)** добавить вызов `auto_use_days` в
   `order_service._create_auto_vacation` с условием
   `if order_type.code not in ("vacation_paid", "vacation_unpaid")`.
   Условие включало `vacation_unpaid`, и приказы «за свой счёт» начали
   уменьшать баланс трудового отпуска.
2. **Form-пути `vacation_service.create_vacation`** —
   `await auto_use_days(...)` вызывался безусловно для любого
   `vacation_type` из формы. Потенциально та же ошибка (form-путь для
   «за свой счёт» в проде не использовался, но защиты не было).

В проде пострадал ровно один кейс: приказ №56-к (vacation_unpaid) для
Божкова О.Л., 7 дней списаны с `period_id=21`. `used_days_auto` уехал с 0
на 7, остаток с 25 на 18.

Доменная норма: «Отпуск за свой счёт» (ТК РФ ст. 128) и «Трудовой
отпуск» (ст. 114) — разные правовые категории. Только трудовой уменьшает
ежегодный оплачиваемый баланс. Запись `vacations` создаётся для обоих
типов (для табеля и истории), но `vacation_period_transactions` —
только для «Трудовой».

## Решение

`auto_use_days` получает обязательный kwarg `vacation_type: str` (default
`"Трудовой"` для обратной совместимости с уже-существующими вызовами).
Если значение не `"Трудовой"` — функция бросает `ValueError` со ссылкой
на этот ADR:

```python
async def auto_use_days(
    ...,
    vacation_type: str = "Трудовой",
) -> None:
    if vacation_type != "Трудовой":
        raise ValueError(
            f"auto_use_days called with non-Tрудовой vacation_type={vacation_type!r}. "
            f"See ADR-0012: ..."
        )
    ...
```

Все существующие callers явно передают `vacation_type="Трудовой"`:

- `order_service._create_auto_vacation` (после фикса гарда
  `code != "vacation_paid"`) — передаёт `vacation_type=v_type`, что
  всегда `"Трудовой"` в этой ветке.
- `vacation_service.create_vacation` (form-путь) — оборачивает вызов
  в `if vacation_type == "Трудовой":`, передаёт `vacation_type=vacation_type`.
- `vacation_service.reapply_vacation_days` — вызывается только для paid
  корректировок, передаёт `vacation_type="Трудовой"` явно.

`order_service._create_auto_vacation` дополнительно сужает гард:
`if order_type.code != "vacation_paid" or not employee or not extra_fields`.
Раньше условие было `not in ("vacation_paid", "vacation_unpaid")` — что
и было источником бага.

## Почему

- **Ранний отказ на уровне сигнатуры**: новый тип отпуска (учебный,
  декрет, дополнительный) нельзя случайно подключить к списанию
  баланса. Разработчик обязан явно решить политику для своего типа.
- **Audit-friendly**: сообщение `ValueError` ссылается на ADR — в логах
  видна причина, не приходится гадать.
- **Минимальный риск регрессии**: default `"Трудовой"` сохраняет
  совместимость с уже-существующими вызовами (если какой-то caller не
  обновлён — поведение не меняется). Если бы default был `None`/missing,
  пришлось бы обновлять все caller'ы атомарно.
- **Не используем `assert`**: хотим видеть ошибку в проде; `assert`
  отключается `-O` и при оптимизации.

## Последствия

- Существующий `test_vacation_auto_use_days.py` (c16d740) продолжает
  работать без изменений — default kwarg совместим.
- Новый `test_vacation_unpaid_no_deduction.py` фиксирует 4 кейса:
  guard auto_use_days, прямой приказ unpaid, прямой paid, групповой
- Одноразовый `backend/scripts/rollback_unpaid_vacation_prod.py` для
  отката единственного пострадавшего кейса в проде. Подключается к БД
  через `--db-url` или `$DATABASE_URL`, вставляет компенсирующую
  транзакцию `vacation_restore` с `is_reversal=true`,
  `reversed_transaction_id=<bad_tx_id>`, `source_type="unpaid_vacation_bugfix"`,
  и пересчитывает `used_days`/`used_days_auto`/`remaining_days` периода
  через прямой SQL (аналог `VacationPeriodRepository.recompute_period_totals`).
  Pre-checks: транзакция существует, ещё не сторнирована, относится к
  `vacation_type='Отпуск за свой счет'`. Dry-run по умолчанию; `--apply`
  требует обязательный `--i-understand-this-touches-prod`. Кейсы
  захардкожены в `ROLLBACK_CASES` (не auto-detect). Скрипт намеренно
  автономен — не импортирует сервисы бэкенда, чтобы его можно было
  запустить с любой машины, имеющей доступ к БД, без поднятого FastAPI.
- Сервисный код (`auto_use_days` и его callers) НЕ содержит логики
  отката. Восстановление данных — ответственность одноразового скрипта,
  а не production-runtime.
- Будущие изменения `auto_use_days` или его вызовов ОБЯЗАНЫ проходить
  ревью с проверкой: (а) гард по `vacation_type` сохранён; (б)
  новые вызовы передают `vacation_type` явно; (в) unit/e2e тесты
  расширены на новые типы отпуска (если добавляются).
- Если в будущем появится новый тип отпуска, который ДОЛЖЕН списывать
  баланс (например, «Учебный с сохранением з/п»), решение принимается
  отдельным ADR и точечно расширяет `auto_use_days`.
