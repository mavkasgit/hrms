# Sprint 6: Календарь предварительных отпусков, периоды отпусков, фильтры сотрудников

## Обзор

Этот спринт добавляет три ключевые функции:
1. **Календарь предварительных отпусков** — таблица 12 месяцев для визуализации и планирования отпусков по сотрудникам
2. **Разделение отпусков на периоды** — годовой цикл отпусков с основным (24 дня) и дополнительным балансом
3. **Расширенные фильтры сотрудников** — фильтрация по полу с toggle-кнопками

---

## HRMS-027: Календарь предварительных отпусков

### Описание
Страница с таблицей-календарём на каждый год: 12 колонок (январь–декабрь), строки — сотрудники. В каждой ячейке можно отметить количество дней отпуска (целое число) или доли (1, 1/2, 1/3).

### Требования
- Выбор года (dropdown)
- Таблица: строки = сотрудники, колонки = 12 месяцев
- Ячейки редактируемые: ввод числа или долей (1, 1/2, 1/3)
- Подсветка ячеек с данными
- Итоговая колонка «Всего дней» по сотруднику
- Возможность поиска/фильтрации по сотруднику
- Сохранение данных в БД
- Визуальное отображение уже запланированных отпусков из таблицы `vacations`

### Технические детали

**Backend:**
- Новая модель `VacationPlan` (таблица `vacation_plans`):
  - `id` (UUID)
  - `employee_id` (FK → employees)
  - `year` (int)
  - `month` (int, 1–12)
  - `days` (float) —支持 1, 0.5, 0.33
  - `comment` (str, optional)
  - `created_at`, `updated_at`
- API endpoints:
  - `GET /api/vacation-plans?year=2026&employee_id=...` — получить план
  - `POST /api/vacation-plans` — создать/обновить ячейку
  - `PUT /api/vacation-plans/{id}` — обновить
  - `DELETE /api/vacation-plans/{id}` — удалить
  - `GET /api/vacation-plans/summary?year=2026` — сводка по всем сотрудникам

**Frontend:**
- Новая страница `/vacation-calendar` (или вкладка на `/vacations`)
- Компонент `VacationCalendarTable`:
  - Фиксированная первая колонка (ФИО сотрудника)
  - Горизонтальный скролл для 12 месяцев
  - Inline-редактирование ячеек
  - Автоподсветка изменений
- Интеграция с существующими `useVacations` для отображения подтверждённых отпусков
- Типы: `VacationPlan`, `VacationPlanCreate`, `VacationPlanSummary`

**Файлы для создания/изменения:**
```
backend/app/models/vacation_plan.py           [NEW]
backend/app/schemas/vacation_plan.py          [NEW]
backend/app/repositories/vacation_plan_repository.py  [NEW]
backend/app/services/vacation_plan_service.py  [NEW]
backend/app/api/vacation_plans.py              [NEW]
backend/alembic/versions/..._004_vacation_plan.py     [NEW]
frontend/src/pages/VacationCalendarPage.tsx   [NEW]
frontend/src/entities/vacation-plan/          [NEW DIR]
  ├── api.ts
  ├── types.ts
  ├── useVacationPlans.ts
  └── index.ts
frontend/src/app/Router.tsx                   [MODIFY]
frontend/src/pages/VacationsPage.tsx          [MODIFY — добавить вкладку или ссылку]
```

---

## HRMS-028: Разделение отпусков на периоды (периоды + баланс)

### Описание
Каждый сотрудник имеет годовой период отпусков, начинающийся с даты начала контракта. Каждый год:
- **Основной отпуск**: 24 дня (единый для всех)
- **Дополнительный отпуск**: индивидуальное количество (задаётся в карточке сотрудника)

Общий баланс = основной + дополнительный.

### Требования
- При создании сотрудника автоматически создаётся первый период отпусков
- Период начинается с `contract_start` и длится 1 год
- Каждый год автоматически создаётся новый период
- Баланс дней = 24 (основной) + `additional_vacation_days` (дополнительный)
- При создании отпуска дни списываются из текущего периода
- Отображение остатка дней на странице отпусков
- Возможность задать `additional_vacation_days` на странице отпусков (для конкретного сотрудника)

### Технические детали

**Backend:**
- Новая модель `VacationPeriod` (таблица `vacation_periods`):
  - `id` (UUID)
  - `employee_id` (FK → employees)
  - `period_start` (date) — начало периода (дата начала контракта + N лет)
  - `period_end` (date) — конец периода
  - `main_days` (int, default=24) — основной отпуск
  - `additional_days` (int, default=0) — дополнительный
  - `used_days` (int, default=0) — использовано
  - `year_number` (int) — номер периода (1, 2, 3...)
  - `created_at`, `updated_at`
- Добавить поле `additional_vacation_days` в модель `Employee` (если ещё нет)
- Сервис `VacationPeriodService`:
  - Автоматическое создание периодов
  - Расчёт доступных дней
  - Обновление `used_days` при создании/удалении отпуска
  - Проверка, что отпуск не превышает баланс
- Миграция: для существующих сотрудников создать первый период

**API endpoints:**
  - `GET /api/vacation-periods?employee_id=...` — периоды сотрудника
  - `GET /api/vacation-periods/{id}/balance` — текущий баланс
  - `POST /api/vacation-periods/{id}/adjust` — скорректировать дополнительные дни

**Frontend:**
- На странице `/vacations`:
  - Блок «Периоды отпусков» при выборе сотрудника
  - Отображение: период, основной (24), дополнительный, использовано, остаток
  - Редактирование дополнительных дней
- На странице `/employees`:
  - Поле `additional_vacation_days` в форме сотрудника

**Файлы для создания/изменения:**
```
backend/app/models/vacation_period.py          [NEW]
backend/app/schemas/vacation_period.py         [NEW]
backend/app/repositories/vacation_period_repository.py  [NEW]
backend/app/services/vacation_period_service.py  [NEW]
backend/app/api/vacation_periods_api.py         [NEW]
backend/alembic/versions/..._005_vacation_periods.py  [NEW]
backend/app/models/employee.py                 [MODIFY — добавить additional_vacation_days]
backend/app/schemas/employee.py                [MODIFY]
backend/app/services/vacation_service.py        [MODIFY — списание из периода]
backend/app/services/employee_service.py        [MODIFY — создание периода при найме]
frontend/src/entities/vacation-period/         [NEW DIR]
  ├── api.ts
  ├── types.ts
  ├── useVacationPeriods.ts
  └── index.ts
frontend/src/pages/VacationsPage.tsx            [MODIFY — блок периодов]
frontend/src/pages/EmployeesPage.tsx            [MODIFY — поле additional_vacation_days]
```

---

## HRMS-029: Расширенные фильтры сотрудников

### Описание
Добавить toggle-кнопки для фильтрации сотрудников по полу (М/Ж) на странице сотрудников, аналогично существующим toggle-кнопкам для подразделений на дашборде.

### Требования
- Toggle-кнопки «М» и «Ж» для фильтрации по полу
- Цветовая схема:
  - М: синяя/голубая (sky)
  - Ж: розовая/фиолетовая (pink/rose)
- Сочетаются с существующими фильтрами (поиск, подразделения)
- Отображение возраста в таблице (вычисляется из `birth_date`)
- Колонки таблицы: ФИО, Возраст, Подразделение, Должность, Действия

### Технические детали

**Backend:**
- Добавить фильтр `gender` в `GET /api/employees`
- Repository: добавить параметр `gender: Optional[str]` в метод получения списка
- Возраст вычислять на бэкенде или фронтенде (рекомендуется фронтенд из `birth_date`)

**Frontend:**
- `EmployeesPage.tsx`:
  - Добавить состояние `selectedGenders: Set<string>`
  - Toggle-кнопки «М» / «Ж» рядом с фильтрами подразделений
  - Паттерн аналогичен `ContractsTable.tsx` (getDeptButtonClass → getGenderButtonClass)
  - Колонка «Возраст» в таблице (вычисление из `birth_date`)
  - Фильтрация на клиенте или запрос с параметром `gender`

**Файлы для изменения:**
```
backend/app/repositories/employee_repository.py   [MODIFY — фильтр gender]
backend/app/api/employees.py                       [MODIFY — параметр gender]
frontend/src/pages/EmployeesPage.tsx               [MODIFY — toggle кнопки, колонка возраст]
```

**Пример цветных кнопок (паттерн из ContractsTable.tsx):**
```tsx
const GENDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "М": { bg: "bg-sky-500/70", text: "text-sky-600", border: "border-sky-500" },
  "Ж": { bg: "bg-rose-500/70", text: "text-rose-600", border: "border-rose-500" },
}

function getGenderButtonClass(gender: string, active: boolean): string {
  const colors = GENDER_COLORS[gender]
  if (!colors) return active ? "bg-muted text-foreground" : "hover:bg-accent text-muted-foreground"
  return active
    ? `${colors.bg.replace("/70", "/100")} ${colors.text} ${colors.border}`
    : "hover:bg-accent text-muted-foreground"
}
```

---

## Порядок выполнения

### Фаза 1: HRMS-028 (Периоды отпусков) — Foundation
Это фундамент для остальных задач. Без периодов календарь не имеет смысла.

1. Модель + миграция `VacationPeriod`
2. Сервис + репозиторий
3. Интеграция с `VacationService` (списание дней из периода)
4. API endpoints
5. Frontend: блок периодов на странице отпусков
6. Тесты

### Фаза 2: HRMS-027 (Календарь отпусков) — Visualization
1. Модель + миграция `VacationPlan`
2. API endpoints
3. Frontend: страница VacationCalendarPage
4. Inline-редактирование ячеек
5. Тесты

### Фаза 3: HRMS-029 (Фильтры сотрудников) — Quick Win
1. Backend: фильтр gender
2. Frontend: toggle-кнопки + колонка возраста
3. Тесты

---

## Миграции (порядок важен)

```
004_vacation_plan.py        — таблица vacation_plans
005_vacation_periods.py     — таблица vacation_periods + additional_vacation_days в employees
```

---

## Оценка сложности

| Задача | Сложность | Файлы (new/modify) |
|--------|-----------|-------------------|
| HRMS-028 Периоды отпусков | ⭐⭐⭐⭐ | 12 new / 6 modify |
| HRMS-027 Календарь отпусков | ⭐⭐⭐ | 9 new / 2 modify |
| HRMS-029 Фильтры сотрудников | ⭐ | 0 new / 3 modify |

---

## Зависимости

- HRMS-028 → HRMS-027 (календарь использует данные о балансе из периодов)
- HRMS-029 → независимая

---

## Критерии приёмки

### HRMS-027 Календарь
- [ ] Таблица 12 месяцев × сотрудники
- [ ] Inline-редактирование ячеек (числа и доли)
- [ ] Сохранение в БД
- [ ] Отображение подтверждённых отпусков из `vacations`
- [ ] Подсчёт итогов по сотруднику
- [ ] Выбор года

### HRMS-028 Периоды
- [ ] Автоматическое создание периодов при найме
- [ ] 24 дня основной + индивидуальный дополнительный
- [ ] Списание дней из текущего периода при создании отпуска
- [ ] Блок «Периоды» на странице отпусков
- [ ] Редактирование дополнительных дней
- [ ] Проверка: нельзя создать отпуск больше баланса

### HRMS-029 Фильтры
- [ ] Toggle-кнопки М/Ж с цветовой схемой
- [ ] Фильтрация работает (бэкенд + фронтенд)
- [ ] Колонка «Возраст» в таблице сотрудников
- [ ] Сочетается с фильтрами по подразделениям
