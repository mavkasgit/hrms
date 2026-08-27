# Промт для агента: обновление HRMS prod на живой БД (без сноса базы)

Самодостаточная инструкция (runbook) для нового агента. Сценарий — **live-режим**:
прод уже работает на реальной БД, никакой снос/залив дампа НЕ производится.
Агент только: проверяет окружение → страхуется дампом → деплоит свежий код
(пересборка образов + рестарт) → даёт alembic доехать вперёд → при необходимости
аккуратно применяет дата-фиксы (сначала dry-run) → верифицирует → пишет отчёт до/после с ФИО.
Полное восстановление из бекапа (DROP SCHEMA + pg_restore) — вынесено в Приложение В
и выполняется ТОЛЬКО по явной команде человека.

Прототип процедуры отработан 2026-08-27 (стек hrms-prod, восстановление + фикс #120).

---

## ПРОМТ (копировать отсюда)

Ты работаешь на машине с монорепозиторием HRMS: `C:\Users\user\VibeCoding\hrms`
(Windows, PowerShell 7, docker compose). Прод крутится прямо здесь.

### ЖЁСТКИЕ ПРАВИЛА (читать первым делом)

1. **Реальная БД.** Все действия — на живом prod (`hrms-postgres-prod`). ЗАПРЕЩЕНЫ:
   `DROP SCHEMA/DATABASE`, `TRUNCATE`, `pg_restore` поверх основной БД,
   удаление/перемещение `data/postgres*`, снос контейнеров postgres.
   Единственный разрешённый вид миграций схемы — вперёд через alembic (`upgrade head`),
   поэтому убедись, что новые миграции в коде аддитивные/безопасные, прежде чем деплоить.
2. **Сначала страховка.** Любому изменяющему шагу предшествует страхующий артефакт:
   перед деплоем — pg_dump снапшот БД; перед прогоном дата-фиксов — dry-run лог;
   перед второй попыткой фикса — снимок балансов для сравнения.
3. **Dry-run до apply.** Скрипты изменений данных запускаются сначала без `--apply`.
4. Не пушить в git, не менять код: деплой = сборка существующего рабочего дерева.
5. Персональные данные (логи, дампы, отчёты) остаются локально в gitignored `logs/` и `data/`.

### Окружение (проверь, не верь вслепую)

- Прод: `docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.prod`,
  контейнеры `hrms-{postgres,backend,frontend,nginx,onlyoffice}-prod`; web = http://localhost:8081,
  health = http://localhost:8081/api/health. Креды БД в `.env.prod`; внутрь контейнера postgres ходят
  через unix socket без пароля (`docker exec hrms-postgres-prod psql -U hrms_user -d hrms_prod ...`).
- Файловое хранилище приложения: bind-mounts `data/{orders,staffing,templates}` → backend `/app/data/*`.
- Схема — alembic, числовые ревизии (`backend/alembic/versions/NNN_*.py`);
  entrypoint бекенда при старте сам делает `scripts/migrate_production_version.py` + `alembic upgrade head`.
- Утилитарные скрипты запускаются внутри бекенд-контейнера:
  `docker exec -e PYTHONPATH=/app hrms-backend-prod python scripts/<script>.py [args]`
  (контейнер содержит код, собранный в образ).

### Шаги

1. **Pre-flight.**
   ```powershell
   git fetch; git status -sb        # рабочее дерево должно содержать нужный для деплоя код
   docker ps --filter name=hrms-*-prod   # стек поднят
   Invoke-WebRequest http://localhost:8081/api/health -UseBasicParsing   # ok до начала работ
   ```
   Зафиксируй текущий `alembic_version` (это точка сравнения «до»).

2. **Страховочный снапшот БД** (бинарный вывод только через cmd-редирект):
   ```powershell
   $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
   $out = "data\backups\pre_deploy_snapshot_$ts.dump"
   cmd /c "docker exec hrms-postgres-prod pg_dump -U hrms_user -d hrms_prod -F c > ""$out"""
   ```
   Проверь магию `PGDMP` и размер > 0. Если деплой затрагивает файловое хранилище —
   дополнительно скопируй в сторону соответствующие подкаталоги `data/`.

3. **Деплой кода (образы + рестарт сервисов, БД не трогаем руками).**
   ```powershell
   docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.prod build backend frontend
   docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.prod up -d backend frontend
   ```
   Рестарт подхватывает новый entrypoint → alembic сам накатит недостающие ревизии.
   Следи за логами: `docker logs hrms-backend-prod --since 5m` — миграции прошли без ошибок,
   uvicorn поднялся. Это штатный путь «подъёма» схемы на живой БД: только вперёд.

4. **Верификация после деплоя.**
   - `/api/health` = ok; корень :8081 = HTTP 200;
   - `SELECT version_num FROM alembic_version` == локальному head миграций;
   - дымовые счётчики целостности:
     ```sql
     SELECT COUNT(*) FROM vacation_periods WHERE remaining_days < 0;                    -- ожидается 0
     SELECT COUNT(*) FROM vacation_period_transactions t WHERE NOT EXISTS
       (SELECT 1 FROM vacation_periods p WHERE p.id=t.period_id);                       -- 0
     SELECT COUNT(*) FROM vacation_period_transactions t WHERE t.reversed_transaction_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM vacation_period_transactions r WHERE r.id=t.reversed_transaction_id); -- 0
     ```
   Расхождение критичное (ошибка миграции, падение сервиса) → откат: пересобрать образы
   из предыдущего коммита (`git checkout <prev> && build`) и рестарт; схему alembic downgrade
   руками НЕ дёргать без необходимости — сначала оценить фактические ошибки в логах.

5. **Дата-фиксы (если задание их требует; сейчас известен #120).**
   ```powershell
   # сухой прогон: кого затронет, балансы ДО
   docker exec -e PYTHONPATH=/app hrms-backend-prod python scripts/recalculate_misattributed_vacations.py *> logs\<script>_dryrun_<ts>.log
   # применение
   docker exec -e PYTHONPATH=/app hrms-backend-prod python scripts/recalculate_misattributed_vacations.py --apply *> logs\<script>_apply_<ts>.log
   ```
   Контроль после apply:
   - повтори проверки из шага 4 (минусов нет, FK-сироты нулевые);
   - идемпотентность: полный снимок балансов (`employee|period|used|remaining` во временный файл)
     до и после контрольного второго `--apply` — значения обязаны совпасть (id периодов могут меняться);
   - интерпретация остаточных флагов детектора: система списывает дни отпусков FIFO
     из самого раннего незакрытого периода (`auto_use_days`, тест
     `test_auto_use_days_spends_oldest_period_first`), поэтому дни «в периоде до даты старта
     отпуска» или «в следующем периоде, если стартовый год закрыт» — НОРМА, а не баг.
     Ложными считай только расхождения против этого правила; данные под них не подгоняй.
6. **Отчёт в `logs/`.**
   Мастер-файл `<target>_report_<ts>.md`: что деплоилось (коммиты), какая схема была/стала,
   статистика дата-фиксов, сверка «до/после», пути к логам; плюс человекочитаемый diff
   по сотрудникам (ФИО, период `[start..end]`, исп./остаток до→после — парсится из блоков
   `Сотрудник N (ФИО)` / `Балансы ДО/ПОСЛЕ` логов).
   Нюанс: печатный блок «ПОСЛЕ» может отражать незакоммиченную сессию — финальную правду
   сверяй SQL-ом по факту.

### Ключевые команды шпаргалкой

```powershell
# версия схемы
docker exec hrms-postgres-prod psql -U hrms_user -d hrms_prod -t -A -c 'SELECT version_num FROM alembic_version'
# счётчик таблицы
docker exec hrms-postgres-prod psql -U hrms_user -d hrms_prod -t -A -c 'SELECT COUNT(*) FROM "<table>"'
# health / корень
Invoke-WebRequest http://localhost:8081/api/health -UseBasicParsing
# рестарт конкретного сервиса после правки env
docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.prod up -d backend
```

---

## Приложение А. Отличие от полного восстановления

Здесь НЕТ шагов «stop backend → DROP SCHEMA → pg_restore → замена storage-каталогов».
Этот путь описан в истории репозитория (версия файла от 2026-08-27) и выполняется
исключительно по явному приказу человека как аварийная процедура — она ОБЯЗАТЕЛЬНО включает
страховой pg_dump, стоп бекенда, `--single-transaction --exit-on-error` и перенос
прежнего файлового хранилища в `data/_pre_restore_<ts>/`.
