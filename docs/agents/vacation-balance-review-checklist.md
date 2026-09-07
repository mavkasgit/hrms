# Vacation Balance Review Checklist

Чек-лист для ревью изменений в логике баланса отпусков. Дополняет
[`CONTEXT.md`](../../CONTEXT.md) и [ADR-0012](../adr/0012-vacation-use-policy.md).

## Когда применять

Обязательно — при любом изменении:

- `backend/app/services/vacation_period_service.py` (особенно `auto_use_days`,
  `recalculate_vacation_days_only`, `recalculate_periods`,
  `recompute_period_totals`).
- `backend/app/services/order_service.py` (особенно `_create_auto_vacation`).
- `backend/app/services/vacation_service.py` (особенно `create_vacation`,
  `reapply_vacation_days`, `apply_vacation_adjustment`).
- `backend/app/repositories/vacation_period_repository.py`
  (особенно `add_transaction`, `add_used_days`, `remove_used_days`,
  `recompute_period_totals`).
- Миграций, затрагивающих `vacation_periods`, `vacation_period_transactions`,
  `vacations`.

## Проверки

### 1. Гард по типу отпуска

`auto_use_days` принимает kwarg `vacation_type: str`. Если добавляется
новый caller:

- [ ] **Передаёт `vacation_type` явно.** Default `"Трудовой"` сохранён для
  обратной совместимости, но новые caller'ы обязаны передавать явно.
- [ ] **Значение = `"Трудовой"` ИЛИ это новый тип, для которого политика
  списания решена отдельным ADR.** Не `"Трудовой"` без явного решения —
  `ValueError` на уровне `auto_use_days` (см. ADR-0012).
- [ ] Если добавляется новый тип (учебный, декрет, доп.), который ДОЛЖЕН
  списывать баланс — отдельный ADR с обоснованием. Точечное расширение
  `auto_use_days`.

### 2. Гард в order-пути

`order_service._create_auto_vacation`:

- [ ] Запись `Vacation` создаётся для всех типов (`vacation_paid`,
  `vacation_unpaid`), где есть `extra_fields.vacation_start/_end`.
- [ ] `auto_use_days` вызывается ТОЛЬКО для `order_type.code == "vacation_paid"`.
  Для `vacation_unpaid` — запись в `vacations` без списания `used_days`.

### 3. Гард в form-пути

`vacation_service.create_vacation`:

- [ ] `auto_use_days` обёрнут в `if vacation_type == "Трудовой":`.
- [ ] Для `vacation_type == "За свой счет"` — запись `vacations` создаётся,
  транзакции списания НЕТ.

### 4. Групповой путь

`create_vacation_unpaid_group_order`:

- [ ] НЕ вызывает `auto_use_days` ни в одной ветке.
- [ ] Записи `Vacation` создаются для всех `employees`.

### 5. Корректировки

`apply_vacation_adjustment` → `reapply_vacation_days`:

- [ ] Только для `vacation_paid`. Проверить, что для других типов отпуска
  нельзя создать adjustment через API/UI.
- [ ] `reapply_vacation_days` всегда передаёт `vacation_type="Трудовой"`.

### 6. Пересчёт баланса

`recompute_period_totals`:

- [ ] Суммирует **ВСЕ** транзакции (`is_reversal = true` и `false`),
  чтобы сторно (отрицательные `days_count`) корректно уменьшали итог.
- [ ] `remaining_days = NULL` для открытых периодов; пересчитывается только
  если есть `manual_close`/`partial_close` (см. ADR-0011).
- [ ] `used_days_manual` отделено от `used_days_auto`.

### 7. Тесты

При добавлении нового типа отпуска или новой точки вызова `auto_use_days`:

- [ ] Расширить `backend/tests/test_vacation_unpaid_no_deduction.py`
  (или создать аналогичный) тестом для нового пути.
- [ ] Обновить e2e в `e2e/api/vacation-unpaid-no-balance-deduction.spec.ts`
  (если меняется HTTP-контракт).
- [ ] Проверить, что существующие `test_vacation_auto_use_days.py` (6 тестов)
  остаются зелёными.

### 8. Документация

- [ ] Если политика изменилась (новый тип, новая логика списания) — обновить
  `CONTEXT.md` (глоссарий) и создать новый ADR.
- [ ] Если меняется API (новые эндпоинты, схемы) — обновить
  `docs/api/` (если есть) и OpenAPI/Swagger.

## Как НЕ надо

❌ **Убирать `ValueError`-гард в `auto_use_days`** «для простоты».
Это единственная защита от регрессии c16d740. Если кажется, что гард
мешает — сначала ADR, потом снятие.

❌ **Менять `transaction_type="vacation_use"` на другой тип «ради
совместимости»**. Это сломает фильтры в отчётах и рекалькуляциях.

❌ **Добавлять `if vacation_type != "Трудовой": continue` без объяснения**.
Все такие ветки должны быть в ADR-0012.

❌ **Писать `is_reversal` фильтр в `recompute_period_totals`**. Сторно
транзакции должны ВЫЧИТАТЬСЯ (т.к. у них отрицательный `days_count`).

## Связанные документы

- [ADR-0011: «Закрытый период»](adr/0011-is-closed-full-balance.md) —
  классификация периодов по полному остатку.
- [ADR-0012: auto_use_days только для «Трудовой»](adr/0012-vacation-use-policy.md) —
  инвариант политики списания.
- [CONTEXT.md](../../CONTEXT.md) — глоссарий (если есть).
