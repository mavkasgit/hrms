# Промт для агента: восстановление хранилища уведомлений/заявлений на удалённом сервере

Самодостаточная инструкция (runbook) для нового агента на удалённом сервере.
Сценарий — инцидент 2026-08-27/28: в `docker-compose.prod.yml` не были
примонтированы `data/notifications` и `data/statements`, файлы .docx жили в
эфемерном слое контейнера и погибли при пересоздании; БД цела, списки работают,
но «Открыть/Скачать/Печать» дают 404 «Файл отсутствует на диске». Бэкапы эти
каталоги не включали. Фикс (маунты + `BACKUP_STORAGE_DIRS` + регенерация)
вошёл в репозиторий; на удалённом сервере нужно воспроизвести восстановление.

Прототип процедуры отработан 2026-08-28 (локальный прод, стек hrms-prod).

---

## ПРОМТ (копировать отсюда)

Ты работаешь на машине с прод-стеком HRMS (docker compose). Найди репозиторий
HRMS на диске (подсказка: рядом со стеком контейнеров `hrms-*-prod`; compose —
`infra/compose/docker-compose.prod.yml`, env — `.env.prod`). Работай только
читающими командами, пока не дойдёшь до шагов с явным изменением.

### ЖЁСТКИЕ ПРАВИЛА

1. **Живая БД.** ЗАПРЕЩЕНЫ: `DROP SCHEMA/DATABASE`, `TRUNCATE`,
   `pg_restore` поверх основной БД, удаление/перемещение `data/postgres*`,
   снос postgres-контейнеров. Схема меняется только вперёд через alembic
   (при старте бэкенда сам).
2. **Сначала страховка, потом изменения.** Порядок обязателен:
   (а) сальвидж эфемерного слоя контейнера и print_cache, (б) pg_dump-снапшот,
   и только потом пересоздание контейнеров и регенерация.
3. **Не перезаписывать данные.** Регенерация идемпотентна: существующие файлы
   не трогать (`EXISTS` → skip). БД не менять вообще (ни строки, ни file_path).
4. **Не пушить в git** и не менять код без явной команды: деплой = свежий код
   из репозитория + правки окружения (маунты).
5. Персональные данные (дампы, спасённые PDF, отчёты) остаются локально в
   gitignored `data/` и `logs/`.

### Окружение (обнаружить, не верить вслепую)

- Стек: `docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.prod`,
  контейнеры `hrms-{postgres,backend,frontend,nginx,onlyoffice}-prod`;
  web обычно `http://<host>:8081`, health `http://<host>:8081/api/health`.
- Креды БД — в `.env.prod`; в контейнер postgres — `docker exec hrms-postgres-prod
  psql -U hrms_user -d hrms_prod ...` (имена могут отличаться — возьми из
  `docker ps` и `.env.prod`).
- Утилитарные скрипты — внутри бэкенд-контейнера:
  `docker exec -e PYTHONPATH=/app hrms-backend-prod python /tmp/<script>.py`.
- Коды ошибок 404 из-за файлов: `notification_file_missing` /
  `statement_file_missing` («отсутствует на диске»), `*_file_not_found`
  («файл не найден», file_path NULL).

### Шаги

1. **Pre-flight.**
   ```powershell
   git pull                                     # забрать фиксы: маунты compose, BACKUP_STORAGE_DIRS, scripts/rescue_regen_docx.py
   git log --oneline -3                         # убедиться, что фиксы приехали
   docker ps --filter name=hrms-*-prod          # стек поднят
   Invoke-WebRequest http://localhost:8081/api/health -UseBasicParsing
   docker exec hrms-postgres-prod psql -U hrms_user -d hrms_prod -c "select count(*) total, count(file_path) with_file from notifications; select count(*) total, count(file_path) with_file from statements;"
   ```
   Ожидание: `total = with_file > 0`. Если строк 0 — инцидент другой, стоп и
   разбирайся отдельно.

2. **Подтверди диагноз.**
   ```powershell
   docker inspect hrms-backend-prod --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
   docker logs --tail 300 hrms-backend-prod 2>&1 | Select-String 'onlyoffice/config|file_missing|file_not_found'
   ```
   Диагноз подтверждён, если маунтов `/app/data/notifications` и
   `/app/data/statements` нет (или они добавлены только что), при этом в логах
   404 на `GET /api/{notifications|statements}/{id}/onlyoffice/config` и
   `.../download` при 200 на `GET /api/{notifications|statements}/{id}`.

3. **Сальвидж (ДО пересоздания контейнеров!).**
   - **Эфемерный слой.** Если backend-контейнер ещё СТАРЫЙ (не пересоздавался
     после инцидента), в его слое могут лежать живые файлы:
     ```powershell
     docker exec hrms-backend-prod ls -la /app/data/notifications /app/data/statements
     ```
     Файлы, имена которых совпадают с `file_path` из БД, вытащи на хост:
     ```powershell
     docker cp hrms-backend-prod:/app/data/notifications/. ./data/notifications/
     docker cp hrms-backend-prod:/app/data/statements/. ./data/statements/
     ```
     (Если контейнер уже пересоздавался — там только мусор, впечённый в образ
     из `backend/data/`; такое НЕ копируй: имена могут коллидировать с БД.
     Проверь совпадение с `file_path` по БД перед копированием.)
   - **Печатные PDF.** `data/orders/.print_cache/{notification,statement}-*.pdf`
     — PDF-копии напечатанных документов (orders примонтирован и не гибнет).
     Скопируй в `data/rescue_print_cache_<ts>/` + `README.md`-манифест
     (`id;number;title;date` по каждой строке из БД).
4. **Страховочный снапшот БД.**
   ```powershell
   $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
   $out = "data\backups\pre_rebuild_snapshot_$ts.dump"
   cmd /c "docker exec hrms-postgres-prod pg_dump -U hrms_user -d hrms_prod -F c > ""$out"""
   ```
   Проверь: размер > 0, магия первых 5 байт = `PGDMP`.
5. **Фикс окружения.** После `git pull` в `infra/compose/docker-compose.prod.yml`
   у backend должны быть volumes `../../data/notifications:/app/data/notifications`
   и `../../data/statements:/app/data/statements` (фикс в репо). Если на сервере
   свой форк compose — добавь строки руками. Создай каталоги:
   `mkdir data/notifications, data/statements` (на Linux: `mkdir -p`).
   Если бэкенд-код ещё без фикса `BACKUP_STORAGE_DIRS` в
   `backend/app/api/backups.py` (orders, notifications, statements, staffing,
   templates, personal) — значит pull не приехал, разберись прежде чем продолжать.
6. **Пересоздай backend (и frontend при свежем коде).**
   ```powershell
   docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.prod build backend frontend
   docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.prod up -d backend frontend
   ```
   Дождись `/api/health` = 200 и чистого старта в `docker logs hrms-backend-prod`
   (alembic может накатывать ревизии — это норма, только вперёд).
7. **Регенерация docx из шаблонов + БД** (идемпотентно, файлы по `file_path`
   из БД, существующие не трогает):
   ```powershell
   docker cp scripts/rescue_regen_docx.py hrms-backend-prod:/tmp/rescue_regen.py
   docker exec -e PYTHONPATH=/app hrms-backend-prod python /tmp/rescue_regen.py
   ```
   Первый прогон — `REGEN` для отсутствующих файлов; второй (контроль) — все
   `EXISTS`. Скрипт воспроизводит пайплайн `create_draft` (тип/сотрудник →
   замены → шаблон типа `template__notification__*` / `template__statement__*`
   → `render_docx_placeholders` → docx). Оговорка: регенерированный файл —
   «шаблонное» состояние документа; ручные правки, внесённые в OnlyOffice
   поверх шаблона, восстановить нельзя (их нет ни в БД, ни в бэкапах).
8. **Верификация.**
   ```powershell
   # все id из БД: каждый /api/notifications/{id}/download и /api/statements/{id}/download => 200
   # /api/health => 200
   docker logs --tail 100 hrms-backend-prod 2>&1 | Select-String 'onlyoffice/(config|file)'   # 200 после кликов в UI
   ```
   В UI: «Просмотр» (OnlyOffice), «Скачать», «Печать» на произвольных строках.
9. **Отчёт** в `logs/storage_recovery_report_<ts>.md`: подтверждённый диагноз,
   спасённое (эфемерка/print_cache — списки файлов), регенерированное
   (id → файл → шаблон), размер дампа, результат верификации, оговорка про
   ручные правки. Данные не подгоняй; факты — как есть.

### Ключевые команды шпаргалкой

```powershell
# маунты контейнера
docker inspect hrms-backend-prod --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
# счётчики
docker exec hrms-postgres-prod psql -U hrms_user -d hrms_prod -t -A -c "select count(*) from notifications where file_path is not null"
# идемпотентный прогон регенерации
docker exec -e PYTHONPATH=/app hrms-backend-prod python /tmp/rescue_regen.py
# health / корень
Invoke-WebRequest http://localhost:8081/api/health -UseBasicParsing
```
