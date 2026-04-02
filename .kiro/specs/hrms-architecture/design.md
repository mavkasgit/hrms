# Документ проектирования: Архитектура HRMS

## Обзор

HRMS — это корпоративная система управления персоналом, предназначенная для развертывания в локальной сети предприятия. Система следует структуре монорепозитория с бэкендом на Python/FastAPI и фронтендом на React/TypeScript, оба работают на одном сервере, доступном клиентам в локальной сети. Архитектура делает упор на строгое разделение слоев, современные практики разработки и конфигурацию на основе окружений для рабочих процессов разработки и тестирования.

## Архитектура

### Топология сети (LAN-first)

Система разворачивается на одном главном компьютере-сервере в локальной сети предприятия:

```mermaid
graph TD
    A[Браузер клиента<br/>192.168.1.x] -->|HTTP :5173| B[Frontend<br/>React/Vite]
    A -->|HTTP :8000| C[Backend<br/>FastAPI]
    C -->|Сеть Docker| D[PostgreSQL<br/>:5432 внутренний]
    D -->|localhost:5432| E[Инструменты администратора<br/>pgAdmin/DBeaver]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#fce4ec
```

**Конфигурация сети:**
- IP-адрес сервера: Выделенный статический IP в локальной сети (например, 192.168.1.100)
- СУБД (PostgreSQL): Крутится в Docker, наружу в сеть не смотрит (доступна только бэкенду по внутренней сети Docker), но порт 5432 проброшен на localhost для удобства администрирования через pgAdmin/DBeaver
- Backend (FastAPI): Крутится на порту 8000, слушает все интерфейсы (0.0.0.0)
- Frontend (React/Vite): Крутится на порту 5173 (в режиме dev) или раздается простым сервером (в режиме build)
- Клиенты: Любой ПК или телефон в сети заходит в браузер по адресу `http://192.168.1.100:5173`

## Структура монорепозитория

Проект хранится в одном Git-репозитории:

```
hrms-web/
├── backend/               # Python / FastAPI
├── frontend/              # Node.js / React / Vite
├── infra/                 # Docker и настройки окружения
│   ├── docker-compose.dev.yml
│   ├── docker-compose.test.yml
│   └── docker-compose.prod.yml
├── .env.dev               # Секреты для разработки (не коммитится)
├── .env.test              # Секреты для тестов
├── .env.prod              # Секреты для продакшена (не коммитится)
├── .gitignore
└── README.md
```

## Компоненты и интерфейсы

### Архитектура Backend (Слоистая модель)

**Стек:** Python 3.11+, FastAPI, SQLAlchemy (Async), asyncpg, Alembic, Pydantic V2

**КРИТИЧЕСКОЕ ТРЕБОВАНИЕ:** Используем паттерн "Слоистая архитектура" (Layered Architecture). Это строгое требование к разработчику — логика не должна смешиваться.

```
backend/app/
├── api/             # СЛОЙ 1: Контроллеры (Routers)
├── services/        # СЛОЙ 2: Бизнес-логика
├── repositories/    # СЛОЙ 3: Работа с БД
├── models/          # SQLAlchemy модели (таблицы)
├── schemas/         # Pydantic схемы (вход/выход API)
└── core/            # Настройки, security, database.py
```

#### Правила слоев и ответственность

**СЛОЙ 1: API (api/)**
- **Назначение:** Обработка HTTP-запросов и форматирование ответов
- **Ответственность:**
  - Принимать HTTP-запросы
  - Валидировать данные через Pydantic схемы
  - Вызывать методы слоя Service
  - Возвращать HTTP-ответы
- **ЗАПРЕЩЕНО:** Никаких SQL-запросов здесь быть не должно! Никакой бизнес-логики!

**СЛОЙ 2: Services (services/)**
- **Назначение:** Реализация бизнес-логики
- **Ответственность:**
  - Вся суть приложения (например, create_order, calculate_vacation_days)
  - Вызывать слой Repository для сохранения/получения данных
  - Оркестрировать сложные операции
- **ЗАПРЕЩЕНО:** Никакого прямого доступа к базе данных! Никакой обработки HTTP!

**СЛОЙ 3: Repositories (repositories/)**
- **Назначение:** Абстракция доступа к базе данных
- **Ответственность:**
  - Только здесь живёт SQLAlchemy
  - Функции типа get_employee_by_id, insert_order
  - Все запросы к базе данных и транзакции
- **ЗАПРЕЩЕНО:** Никакой бизнес-логики! Никакой обработки HTTP!

#### Генерация документов

Документы (.docx) генерируются через библиотеку `python-docx` и сохраняются на диск сервера в директорию `ORDERS_PATH`. Путь к файлу сохраняется в поле `file_path` таблицы `orders` для последующего доступа.

```python
# services/order_service.py
async def generate_and_save_document(
    self, 
    order: Order, 
    employee: Employee
) -> str:
    """Генерация документа и сохранение на диск"""
    doc = Document(template_path)
    
    # Замена плейсхолдеров
    replacements = self._prepare_replacements(order, employee)
    self._replace_placeholders(doc, replacements)
    
    # Формирование имени файла
    filename = f"{order.order_type} {employee.name} {order.order_date}.docx"
    file_path = ORDERS_PATH / filename
    
    # Сохранение на диск
    doc.save(str(file_path))
    
    return str(file_path)
```

### Архитектура Frontend (FSD-lite)

**Стек:** React 18, TypeScript, Vite, TailwindCSS, Shadcn UI, React Query, Axios, React Router

Используем упрощенный Feature-Sliced Design. Это спасет фронтенд от превращения в "кашу" компонентов:

```
frontend/src/
├── app/             # Глобальные провайдеры (QueryClient), роутер, глобальные стили
├── pages/           # Экраны (DashboardPage, EmployeesPage, OrdersPage, VacationsPage, LoginPage)
├── features/        # Сложные блоки (employee-form, order-generation, vacation-calendar, auth)
├── entities/        # Сущности бизнеса (employee, order, vacation, user)
│   ├── employee/    #   ├── useEmployees.ts, types.ts, api.ts
│   ├── order/       #   ├── useOrders.ts, types.ts, api.ts
│   ├── vacation/    #   ├── useVacations.ts, types.ts, api.ts
│   └── user/        #   └── useAuth.ts, types.ts, api.ts
└── shared/          # Переиспользуемый код (кнопки Shadcn, axios instance, utils)
```

#### Детализация FSD структуры

**entities/** - Сущности бизнеса:
- `employee/` - Сотрудники (типы, API-хуки, утилиты)
- `order/` - Приказы (типы, API-хуки, утилиты)
- `vacation/` - Отпуска (типы, API-хуки, утилиты)
- `user/` - Пользователи и аутентификация (типы, API-хуки, утилиты)

**features/** - Сложные функциональные блоки:
- `employee-form/` - Форма создания/редактирования сотрудника
- `order-generation/` - Генерация приказов
- `vacation-calendar/` - Календарь отпусков
- `auth/` - Форма входа и управление сессией

**pages/** - Страницы приложения:
- `DashboardPage` - Главная страница с аналитикой
- `EmployeesPage` - Список сотрудников
- `OrdersPage` - Журнал приказов
- `VacationsPage` - Управление отпусками
- `LoginPage` - Страница входа

**shared/** - Общие компоненты и утилиты:
- `ui/` - UI компоненты из Shadcn (Button, Input, Table, Dialog, etc.)
- `api/` - Настройка Axios, базовый URL
- `utils/` - Утилиты (форматирование дат, валидация, etc.)
- `hooks/` - Общие хуки (useDebounce, useLocalStorage, etc.)

#### Обработка состояний UI

**КРИТИЧЕСКИ ВАЖНО:** Все компоненты должны обрабатывать loading, error и empty states.

**Loading states (скелетоны):**
```typescript
// pages/EmployeesPage.tsx
import { Skeleton } from '@/shared/ui/skeleton';

export function EmployeesPage() {
  const { data, isLoading, isError, error } = useEmployees();
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  
  if (isError) {
    return <ErrorMessage error={error} />;
  }
  
  if (data.items.length === 0) {
    return <EmptyState message="Нет сотрудников" />;
  }
  
  return <EmployeesList employees={data.items} />;
}
```

**Error boundaries:**
```typescript
// app/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Произошла ошибка</AlertTitle>
          <AlertDescription>
            {this.state.error?.message || 'Неизвестная ошибка'}
          </AlertDescription>
        </Alert>
      );
    }
    
    return this.props.children;
  }
}
```

**Empty states:**
```typescript
// shared/ui/EmptyState.tsx
import { FileX } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  description?: string;
}

export function EmptyState({ message, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <FileX className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold">{message}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
}
```

**Использование компонентов Shadcn:**
- `Skeleton` - для loading states
- `Alert` - для error states
- Кастомный `EmptyState` - для empty states

#### Правила фронтенда

**Запросы к API:**
- Выполняются только через хуки @tanstack/react-query
- Разработчику ЗАПРЕЩЕНО использовать useEffect для получения данных

**Управление состоянием:**
- Серверное состояние: Хранится в React Query
- Локальное состояние: useState для состояния UI (например, открыто ли окно)
- Сторонние стейт-менеджеры (Redux): ЗАПРЕЩЕНЫ

**Связь с Backend:**
- Axios настроен в `shared/api/axios.ts`
- Базовый URL из .env: `VITE_API_URL=http://192.168.1.100:8000`

```typescript
// Пример: Паттерн API-хука
export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: () => axios.get('/api/employees').then(res => res.data)
  });
}
```

## Модели данных

### Основные сущности

**Сотрудник (Employee)** - ПОЛНАЯ СТРУКТУРА:
```python
class Employee(Base):
    __tablename__ = "employees"
    
    # Первичный ключ
    tab_number = Column(Integer, primary_key=True)  # Табельный номер (PK)
    
    # Основная информация
    # КРИТИЧЕСКИ ВАЖНО: ФИО - первичный способ идентификации, табельный номер - запасной
    name = Column(String(255), nullable=False)  # ФИО (ПРИОРИТЕТ при идентификации)
    department = Column(String(100), nullable=False)  # Подразделение
    position = Column(String(100), nullable=False)  # Должность
    
    # Даты
    hire_date = Column(Date)  # Дата приёма на работу
    birth_date = Column(Date)  # Дата рождения
    
    # Персональные данные
    gender = Column(String(1))  # Пол (М/Ж)
    citizenship = Column(Boolean, default=True)  # Гражданин РБ
    residency = Column(Boolean, default=True)  # Резидент РБ
    pensioner = Column(Boolean, default=False)  # Пенсионер
    
    # Оплата труда
    payment_form = Column(String(50))  # Форма оплаты
    rate = Column(Float)  # Ставка
    
    # Контракт
    contract_start = Column(Date)  # Начало контракта
    contract_end = Column(Date)  # Конец контракта
    
    # Документы
    personal_number = Column(String(50))  # Личный номер
    insurance_number = Column(String(50))  # Страховой номер
    passport_number = Column(String(50))  # Номер паспорта
    # УДАЛЕНО: personal_file_path - путь детерминирован через helper-функцию
    
    # Служебные поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    vacations = relationship("Vacation", back_populates="employee", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="employee", cascade="all, delete-orphan")
```

**Helper-функция для получения пути к личному делу:**
```python
# utils/file_helpers.py
from pathlib import Path
from core.config import settings

def get_personal_files_dir(tab_number: int) -> Path:
    """Получить путь к папке с личным делом сотрудника"""
    return Path(settings.PERSONAL_FILES_PATH) / str(tab_number)
```

**Приказ (Order)** - ПОЛНАЯ СТРУКТУРА:
```python
class Order(Base):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True)
    order_number = Column(String(50), unique=True, nullable=False)  # Номер приказа (формат: просто число, например: 1, 2, 3)
    order_type = Column(String(50), nullable=False)  # Тип: Прием, Увольнение, Отпуск, Больничный, Перевод, Продление контракта
    tab_number = Column(Integer, ForeignKey("employees.tab_number"), nullable=False)
    order_date = Column(Date, nullable=False)  # Дата приказа
    created_date = Column(DateTime, default=datetime.utcnow)  # Дата создания записи
    file_path = Column(String(255))  # Путь к сгенерированному .docx файлу
    notes = Column(Text)  # Примечания
    
    # Связи
    employee = relationship("Employee", back_populates="orders")

# Таблица для генерации номеров приказов (защита от race condition)
class OrderSequence(Base):
    __tablename__ = "order_sequences"
    
    year = Column(Integer, primary_key=True)  # Год
    last_number = Column(Integer, nullable=False, default=0)  # Последний использованный номер
```

**Отпуск (Vacation)** - ПОЛНАЯ СТРУКТУРА:
```python
class Vacation(Base):
    __tablename__ = "vacations"
    
    id = Column(Integer, primary_key=True)
    tab_number = Column(Integer, ForeignKey("employees.tab_number"), nullable=False)
    start_date = Column(Date, nullable=False)  # Дата начала отпуска
    end_date = Column(Date, nullable=False)  # Дата окончания отпуска
    vacation_type = Column(String(50), nullable=False)  # Типы: Ежегодный, Без сохранения, Учебный, Больничный
    days_count = Column(Integer, nullable=False)  # Количество дней
    vacation_year = Column(Integer, nullable=False)  # Отпускной год (календарный год)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    employee = relationship("Employee", back_populates="vacations")

# ПРАВИЛА ОТПУСКОВ:
# 1. Отпускной год = календарный год (с 1 января по 31 декабря)
# 2. Остаток отпуска НЕ переносится на следующий год (сгорает)
# 3. Для сотрудников принятых в середине года - пропорциональный расчет:
#    28 дней / 12 месяцев * количество отработанных месяцев
```

**Справочник (Reference)** - НОВАЯ ТАБЛИЦА:
```python
class Reference(Base):
    __tablename__ = "references"
    
    id = Column(Integer, primary_key=True)
    category = Column(String(50), nullable=False)  # Категория: Должность, Подразделение, Форма оплаты, Тип отпуска
    value = Column(String(255), nullable=False)  # Значение
    order = Column(Integer, default=0)  # Порядок сортировки
```

**Пользователь (User)** - НОВАЯ ТАБЛИЦА ДЛЯ АУТЕНТИФИКАЦИИ:
```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False)  # Логин
    password_hash = Column(String(255), nullable=False)  # Хэш пароля
    role = Column(String(50), nullable=False)  # Роль: admin, hr_manager, hr_specialist
    full_name = Column(String(255), nullable=False)  # ФИО пользователя
    created_at = Column(DateTime, default=datetime.utcnow)

# Enum для ролей пользователей
class UserRole(str, Enum):
    ADMIN = "admin"  # Полный доступ ко всем функциям
    HR_MANAGER = "hr_manager"  # Управление сотрудниками, приказами, отпусками
    HR_SPECIALIST = "hr_specialist"  # Просмотр и создание приказов, отпусков
```

## API Endpoints

### Authentication API (НОВОЕ)

- **POST /api/auth/login** - аутентификация пользователя
  - Body: `{"username": str, "password": str}`
  - Ответ: `{"access_token": str, "token_type": "bearer", "user": {"id": int, "username": str, "role": str, "full_name": str}}`
  - Ошибки: 401 если неверные учетные данные

- **POST /api/auth/logout** - выход из системы
  - Headers: `Authorization: Bearer {token}`
  - Ответ: `{"message": "Logged out successfully"}`

- **GET /api/auth/me** - получить информацию о текущем пользователе
  - Headers: `Authorization: Bearer {token}`
  - Ответ: `{"id": int, "username": str, "role": str, "full_name": str}`
  - Ошибки: 401 если токен невалиден

### Users API (НОВОЕ)

- **GET /api/users** - получить список пользователей (только admin)
  - Headers: `Authorization: Bearer {token}`
  - Ответ: `List[{"id": int, "username": str, "role": str, "full_name": str, "created_at": str}]`
  - Ошибки: 403 если недостаточно прав

- **POST /api/users** - создать нового пользователя (только admin)
  - Headers: `Authorization: Bearer {token}`
  - Body: `{"username": str, "password": str, "role": str, "full_name": str}`
  - Ответ: `{"id": int, "username": str, "role": str, "full_name": str}`
  - Ошибки: 400 если username уже существует, 403 если недостаточно прав

- **PUT /api/users/{user_id}** - обновить пользователя (только admin)
  - Headers: `Authorization: Bearer {token}`
  - Path параметры: `user_id` (int)
  - Body: `{"username": str (optional), "password": str (optional), "role": str (optional), "full_name": str (optional)}`
  - Ответ: `{"id": int, "username": str, "role": str, "full_name": str}`
  - Ошибки: 404 если не найден, 403 если недостаточно прав

- **DELETE /api/users/{user_id}** - удалить пользователя (только admin)
  - Headers: `Authorization: Bearer {token}`
  - Path параметры: `user_id` (int)
  - Ответ: `{"message": "User deleted"}`
  - Ошибки: 404 если не найден, 403 если недостаточно прав

### Employees API

- **GET /api/employees** - получить всех сотрудников (с фильтром по подразделению и пагинацией)
  - Query параметры: `department` (опционально), `page` (по умолчанию 1), `per_page` (по умолчанию 50), `sort_by` (опционально), `sort_order` (asc/desc)
  - Ответ: `{"items": List[EmployeeResponse], "total": int, "page": int, "per_page": int, "total_pages": int}`

- **GET /api/employees/search?q={query}** - поиск по имени или табельному номеру (ПРИОРИТЕТ: ФИО, затем табельный номер)
  - Query параметры: `q` (обязательно, минимум 1 символ)
  - Ответ: `List[EmployeeResponse]`

- **GET /api/employees/{tab_number}** - получить сотрудника по табельному номеру
  - Path параметры: `tab_number` (int)
  - Ответ: `EmployeeResponse`
  - Ошибки: 404 если не найден

- **POST /api/employees** - создать нового сотрудника
  - Body: `EmployeeCreate`
  - Ответ: `EmployeeResponse`
  - Ошибки: 400 если табельный номер уже существует

- **PUT /api/employees/{tab_number}** - обновить сотрудника
  - Path параметры: `tab_number` (int)
  - Body: `EmployeeUpdate`
  - Ответ: `EmployeeResponse`
  - Ошибки: 404 если не найден

- **DELETE /api/employees/{tab_number}** - удалить сотрудника
  - Path параметры: `tab_number` (int)
  - Query параметры: `keep_files` (по умолчанию false) - сохранить файлы личного дела
  - Ответ: `{"message": "Employee deleted", "files_deleted": bool}`
  - Ошибки: 404 если не найден
  - ВАЖНО: При удалении сотрудника удаляются все файлы из PERSONAL_FILES_PATH/{tab_number}/ (если keep_files=false)

- **GET /api/employees/references/departments** - получить список подразделений
  - Ответ: `List[str]`

- **GET /api/employees/references/positions** - получить список должностей
  - Ответ: `List[str]`

### Orders API

- **GET /api/orders/types** - получить типы приказов
  - Ответ: `List[str]` (7 типов приказов)

- **GET /api/orders/template/{order_type}** - получить информацию о шаблоне
  - Path параметры: `order_type` (str)
  - Ответ: `{"order_type": str, "template_filename": str, "exists": bool, "path": str}`

- **GET /api/orders/next-number?year={year}** - получить следующий номер приказа
  - Query параметры: `year` (опционально, по умолчанию текущий год)
  - Ответ: `{"order_number": str}` (формат: число с ведущими нулями, примеры: "01", "02", "05", "123")
  - ВАЖНО: Использует PostgreSQL sequence с блокировкой строки (SELECT FOR UPDATE) для защиты от race condition
  - ВАЖНО: Это только подсказка для пользователя, он может ввести любой номер вручную

- **POST /api/orders** - сгенерировать приказ и сохранить в БД
  - Body: `{"tab_number": int, "order_type": str, "order_date": str, "order_number": str (optional), "notes": str (optional)}`
  - Ответ: `{"order_number": str, "order_type": str, "order_date": str, "file_path": str, "status": "created"}`
  - Ошибки: 400 если неверный тип приказа, 404 если сотрудник не найден
  - ВАЖНО: Если order_number указан - использовать его (с форматированием 02d), если нет - сгенерировать автоматически
  - ВАЖНО: Файл сохраняется в папку ORDERS_PATH/{year}/
  - ВАЖНО: Формат имени файла: "Приказ_№{order_number}_к_{day}_{month}_{order_type_short}_{last_name}_{initials}.docx"
  - Примеры имен файлов: 
    - "Приказ_№01_к_15_01_прием_Иванов_И_В.docx"
    - "Приказ_№02_к_08_01_продление_Юрочка_И_В.docx"

- **GET /api/orders/recent?limit={limit}** - получить последние приказы
  - Query параметры: `limit` (по умолчанию 10), `year` (опционально, фильтр по году)
  - Ответ: `List[{"order_number": str, "order_type": str, "order_date": str, "employee_name": str, "file_path": str}]`

- **GET /api/orders/all** - получить все приказы (с пагинацией и фильтрацией)
  - Query параметры: `page` (по умолчанию 1), `per_page` (по умолчанию 50), `sort_by` (опционально), `sort_order` (asc/desc), `year` (опционально, фильтр по году)
  - Ответ: `{"items": List[{"order_number": str, "order_type": str, "order_date": str, "tab_number": int, "employee_name": str, "file_path": str}], "total": int, "page": int, "per_page": int, "total_pages": int}`
  - ВАЖНО: Если указан параметр year, возвращать только приказы за указанный год

- **GET /api/orders/years** - получить список годов с приказами
  - Ответ: `{"years": List[int]}` (например: [2026, 2025, 2024])
  - ВАЖНО: Используется для фильтра по годам в UI

- **GET /api/orders/log** - получить журнал приказов
  - Ответ: `List[{"order_number": str, "order_type": str, "order_date": str, "tab_number": int, "employee_name": str, "file_path": str}]`

- **GET /api/orders/settings** - получить настройки путей
  - Ответ: `{"orders_path": str, "templates_path": str}`

- **PUT /api/orders/settings** - обновить настройки путей
  - Body: `{"orders_path": str (optional), "templates_path": str (optional)}`
  - Ответ: `{"orders_path": str, "templates_path": str, "status": "updated"}`

- **POST /api/orders/sync** - синхронизировать приказы с файлами
  - Query параметры: `year` (опционально, синхронизировать только указанный год)
  - Ответ: `{"message": str, "deleted": int, "added": int}`
  - ВАЖНО: Сканирует папки ORDERS_PATH/{year}/ для каждого года
  - ВАЖНО: Парсит имена файлов в формате "Приказ_№{order_number}_к_{day}_{month}_{order_type_short}_{last_name}_{initials}.docx"
  - ВАЖНО: Извлекает фамилию и инициалы для поиска сотрудника в БД

### Vacations API

- **GET /api/vacations** - получить все отпуска
  - Ответ: `List[VacationResponse]`

- **GET /api/vacations/{id}** - получить отпуск по ID
  - Path параметры: `id` (int)
  - Ответ: `VacationResponse`
  - Ошибки: 404 если не найден

- **POST /api/vacations** - создать отпуск
  - Body: `VacationCreate`
  - Ответ: `VacationResponse`

- **PUT /api/vacations/{id}** - обновить отпуск
  - Path параметры: `id` (int)
  - Body: `VacationUpdate`
  - Ответ: `VacationResponse`
  - Ошибки: 404 если не найден

- **DELETE /api/vacations/{id}** - удалить отпуск
  - Path параметры: `id` (int)
  - Ответ: `{"message": "Vacation deleted"}`
  - Ошибки: 404 если не найден

### Files API

**Фотографии сотрудников:**

- **POST /api/employees/{tab_number}/photo** - загрузить фотографию сотрудника
  - Path параметры: `tab_number` (int)
  - Body: `multipart/form-data` с файлом
  - Ответ: `{"status": "uploaded", "path": str}`
  - Ошибки: 404 если сотрудник не найден, 400 если неверный формат

- **GET /api/employees/{tab_number}/photo** - получить фотографию сотрудника
  - Path параметры: `tab_number` (int)
  - Ответ: Файл изображения (JPG/PNG)
  - Ошибки: 404 если фотография не найдена

- **DELETE /api/employees/{tab_number}/photo** - удалить фотографию сотрудника
  - Path параметры: `tab_number` (int)
  - Ответ: `{"status": "deleted"}`

**Личные дела сотрудников:**

- **POST /api/employees/{tab_number}/files** - загрузить файл в личное дело
  - Path параметры: `tab_number` (int)
  - Body: `multipart/form-data` с файлом
  - Ответ: `{"status": "uploaded", "filename": str}`
  - Ошибки: 404 если сотрудник не найден, 400 если превышен лимит размера

- **GET /api/employees/{tab_number}/files** - получить список файлов в личном деле
  - Path параметры: `tab_number` (int)
  - Ответ: `{"files": List[str]}`

- **GET /api/employees/{tab_number}/files/{filename}** - скачать файл из личного дела
  - Path параметры: `tab_number` (int), `filename` (str)
  - Ответ: Файл для скачивания
  - Ошибки: 404 если файл не найден

- **DELETE /api/employees/{tab_number}/files/{filename}** - удалить файл из личного дела
  - Path параметры: `tab_number` (int), `filename` (str)
  - Ответ: `{"status": "deleted"}`

**Приказы:**

- **GET /api/orders/{order_id}/download** - скачать сгенерированный приказ
  - Path параметры: `order_id` (int)
  - Ответ: Файл .docx для скачивания
  - Ошибки: 404 если приказ или файл не найден

**Шаблоны:**

- **GET /api/templates** - получить список всех шаблонов
  - Ответ: `{"templates": List[{"name": str, "order_type": str, "exists": bool, "file_size": int, "last_modified": str}]}`
  - ВАЖНО: Возвращает информацию о всех 7 типах приказов (даже если шаблон не загружен)

- **GET /api/templates/{order_type}** - скачать шаблон
  - Path параметры: `order_type` (str)
  - Ответ: Файл .docx для скачивания
  - Ошибки: 404 если шаблон не найден

- **POST /api/templates/{order_type}** - загрузить новый шаблон
  - Path параметры: `order_type` (str)
  - Body: `multipart/form-data` с файлом .docx
  - Ответ: `{"status": "uploaded", "template": str, "file_size": int}`
  - Ошибки: 400 если неверный формат файла, 403 если недостаточно прав

- **PUT /api/templates/{order_type}** - обновить существующий шаблон
  - Path параметры: `order_type` (str)
  - Body: `multipart/form-data` с файлом .docx
  - Ответ: `{"status": "updated", "template": str, "file_size": int}`
  - ВАЖНО: Просто заменяет файл новым
  - Ошибки: 400 если неверный формат файла, 403 если недостаточно прав, 404 если шаблон не существует

- **DELETE /api/templates/{order_type}** - удалить шаблон
  - Path параметры: `order_type` (str)
  - Ответ: `{"status": "deleted", "template": str}`
  - Ошибки: 403 если недостаточно прав, 404 если шаблон не найден

### Резервное копирование

**Автоматический backup:**
```bash
# Скрипт для ежедневного backup
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d)

# Backup всех файлов
tar -czf $BACKUP_DIR/hrms_files_$DATE.tar.gz ./data/

# Backup базы данных
docker exec hrms-postgres pg_dump -U hrms_user hrms_dev > $BACKUP_DIR/hrms_db_$DATE.sql

# Удалить старые backup (старше 30 дней)
find $BACKUP_DIR -name "hrms_*" -mtime +30 -delete
```

**Восстановление:**
```bash
# Восстановление файлов
tar -xzf hrms_files_20260402.tar.gz

# Восстановление БД
docker exec -i hrms-postgres psql -U hrms_user hrms_dev < hrms_db_20260402.sql
```

### Analytics API

- **GET /api/analytics/dashboard?department={dept}** - статистика дашборда
  - Query параметры: `department` (опционально)
  - Ответ: `DashboardStats` (total, male, female, by_department, by_position, avg_age, avg_tenure_months, contracts)

- **GET /api/analytics/contracts?months_ahead={months}** - уведомления об истечении контрактов
  - Query параметры: `months_ahead` (по умолчанию 3)
  - Ответ: `List[ContractAlert]` (tab_number, name, position, department, contract_end, days_remaining, priority, month_group)

- **GET /api/analytics/birthdays?days_ahead={days}** - предстоящие дни рождения
  - Query параметры: `days_ahead` (по умолчанию 30)
  - Ответ: `List[BirthdayAlert]` (tab_number, name, birth_date, days_until, age)

- **GET /api/analytics/vacations** - статистика по отпускам
  - Ответ: `List[VacationStats]` (tab_number, name, used_days, available_days, remaining_days)

**Важно:** Поле `personal_file_path` в модели Employee хранит путь к ПАПКЕ с личным делом сотрудника (например, `/app/data/personal/123/`). В этой папке хранятся ВСЕ прикрепленные документы сотрудника: договоры, паспорта, дипломы, справки и т.д.

## Генерация документов приказов

Система генерирует приказы в формате .docx на основе шаблонов.

### Генерация номера приказа

**КРИТИЧЕСКИ ВАЖНО:** Номер приказа генерируется с защитой от race condition.

**Формат номера:** Число с ведущими нулями (минимум 2 цифры): "01", "02", "03", "10", "123"
- С ведущими нулями для чисел меньше 10 (01, 02, 03)
- БЕЗ префикса года
- Обнуляется каждый год (1 января начинается с 01)
- Пользователь может вручную изменить номер при создании приказа через поле ввода order_number в форме

**Реализация через PostgreSQL sequence:**

```python
# repositories/order_repository.py
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

class OrderRepository:
    @staticmethod
    async def get_next_order_number(db: AsyncSession, year: int) -> str:
        """
        Получить следующий номер приказа для указанного года.
        Использует SELECT FOR UPDATE для защиты от race condition.
        
        Возвращает число с ведущими нулями (2 цифры): "01", "02", "03", "10", "123"
        """
        # Попытаться получить запись для года с блокировкой
        stmt = select(OrderSequence).where(OrderSequence.year == year).with_for_update()
        result = await db.execute(stmt)
        sequence = result.scalar_one_or_none()
        
        if sequence is None:
            # Создать новую запись для года
            sequence = OrderSequence(year=year, last_number=0)
            db.add(sequence)
            await db.flush()
        
        # Инкрементировать номер
        sequence.last_number += 1
        next_number = sequence.last_number
        
        # Сформировать номер приказа с ведущими нулями (минимум 2 цифры)
        order_number = f"{next_number:02d}"
        
        return order_number

# services/order_service.py
async def create_order(
    self, 
    db: AsyncSession, 
    order_data: OrderCreate
) -> Order:
    """
    Создать приказ с автоматической генерацией номера или ручным вводом.
    
    Если order_data.order_number указан - использовать его (ручной ввод).
    Если order_data.order_number не указан - сгенерировать автоматически.
    """
    async with db.begin():  # Транзакция для атомарности
        # Получить номер приказа
        if order_data.order_number:
            # Ручной ввод номера пользователем (форматировать с ведущими нулями)
            order_number = f"{int(order_data.order_number):02d}"
        else:
            # Автоматическая генерация номера
            year = order_data.order_date.year
            order_number = await self.order_repo.get_next_order_number(db, year)
        
        # Получить данные сотрудника
        employee = await self.employee_repo.get_by_tab_number(db, order_data.tab_number)
        if not employee:
            raise ValueError("Сотрудник не найден")
        
        # Создать папку для года если не существует
        year_dir = Path(settings.ORDERS_PATH) / str(order_data.order_date.year)
        year_dir.mkdir(parents=True, exist_ok=True)
        
        # Сгенерировать документ
        file_path = await self.generate_and_save_document(order_number, order_data, employee, year_dir)
        
        # Создать запись в БД
        order = Order(
            order_number=order_number,
            order_type=order_data.order_type,
            tab_number=order_data.tab_number,
            order_date=order_data.order_date,
            file_path=file_path,
            notes=order_data.notes
        )
        
        db.add(order)
        await db.flush()
        
        return order

async def generate_and_save_document(
    self, 
    order_number: str,
    order_data: OrderCreate,
    employee: Employee,
    year_dir: Path
) -> str:
    """Генерация документа и сохранение в папку года"""
    doc = Document(template_path)
    
    # Замена плейсхолдеров
    replacements = self._prepare_replacements(order_number, order_data, employee)
    self._replace_placeholders(doc, replacements)
    
    # Извлечь фамилию и инициалы из ФИО
    name_parts = employee.name.split()
    last_name = name_parts[0] if len(name_parts) > 0 else "Unknown"
    initials = "_".join([part[0] for part in name_parts[1:]]) if len(name_parts) > 1 else ""
    
    # Сократить тип приказа для имени файла
    order_type_map = {
        "Прием на работу": "прием",
        "Увольнение": "увольнение",
        "Отпуск трудовой": "отпуск",
        "Отпуск за свой счет": "отпуск_бс",
        "Больничный": "больничный",
        "Перевод": "перевод",
        "Продление контракта": "продление"
    }
    order_type_short = order_type_map.get(order_data.order_type, "приказ")
    
    # Формирование имени файла
    day = order_data.order_date.strftime("%d")
    month = order_data.order_date.strftime("%m")
    filename = f"Приказ_№{order_number}_к_{day}_{month}_{order_type_short}_{last_name}_{initials}.docx"
    file_path = year_dir / filename
    
    # Сохранение на диск
    doc.save(str(file_path))
    
    return str(file_path)
```

### Механизм генерации

**Хранение шаблонов:**
- Шаблоны .docx хранятся в директории `TEMPLATES_PATH` (настраивается через API)
- Каждый тип приказа имеет свой шаблон

**Хранение сгенерированных приказов:**
- Сгенерированные приказы сохраняются в директории `ORDERS_PATH/{year}/` (настраивается через API)
- Структура: `ORDERS_PATH/2026/`, `ORDERS_PATH/2025/`, и т.д.
- Формат имени файла: `"Приказ_№{order_number}_к_{day}_{month}_{order_type_short}_{last_name}_{initials}.docx"`
- Примеры: 
  - `"Приказ_№01_к_15_01_прием_Иванов_И_В.docx"`
  - `"Приказ_№02_к_08_01_продление_Юрочка_И_В.docx"`
  - `"Приказ_№05_к_20_03_отпуск_Петров_П_П.docx"`
  - `"Приказ_№123_к_15_04_перевод_Сидоров_С_С.docx"` (если пользователь вручную ввел номер 123)
- ВАЖНО: Каждый год хранится в отдельной папке для удобства навигации и архивирования
- ВАЖНО: Формат даты в имени файла: день_месяц (без года, так как год определяется папкой)

**Плейсхолдеры в шаблонах:**

Номер и дата приказа:
- `{order_number}` - Номер приказа (например: 1, 2, 3)
- `{order_date}` - Дата приказа в формате ДД.ММ.ГГГГ

Тип приказа:
- `{order_type_lower}` - Тип приказа в нижнем регистре

ФИО сотрудника (полные варианты):
- `{full_name}` - Полное ФИО как в БД (оригинальное)
- `{full_name_upper}` - Полное ФИО полностью капсом
- `{full_name_title}` - Полное ФИО с большой буквы каждое слово (Иван Петрович Сидоров)
- `{full_name_last_caps}` - Полное ФИО фамилия капсом остальное с большой буквы (СИДОРОВ Иван Петрович)

ФИО сотрудника (сокращённые варианты):
- `{last_name_upper}` - Только фамилия капсом (СИДОРОВ)
- `{short_name}` - Фамилия И. О. с пробелами (Сидоров И. П.)
- `{initials_before}` - И. О. потом фамилия (И. П. Сидоров)
- `{last_name_then_initials}` - Фамилия И.О. без пробела (Сидоров И.П.)

Должность и подразделение:
- `{position}` - Должность сотрудника
- `{department}` - Подразделение сотрудника

Табельный номер:
- `{tab_number}` - Табельный номер сотрудника

Даты контракта:
- `{contract_end}` - Дата окончания контракта (автоматически +1 год от даты приказа)
- `{trial_end}` - Дата окончания пробного периода (автоматически +2 месяца от даты приказа)
- `{contract_number}` - Номер контракта (по умолчанию 332/1)

Даты из БД:
- `{hire_date}` - Дата приёма на работу
- `{contract_start}` - Дата начала контракта

**Библиотека генерации:**
- Используется `python-docx` для работы с документами Word
- Генерация происходит путём замены плейсхолдеров в шаблонах
- Поддержка замены в параграфах и таблицах

**Соответствие типов приказов и шаблонов:**
```python
template_map = {
    "Прием на работу": "prikaz_priem.docx",
    "Увольнение": "prikaz_uvolnenie.docx",
    "Отпуск трудовой": "prikaz_otpusk_trudovoy.docx",
    "Отпуск за свой счет": "prikaz_otpusk_svoy_schet.docx",
    "Больничный": "prikaz_bolnichnyy.docx",
    "Перевод": "prikaz_perevod.docx",
    "Продление контракта": "prikaz_prodlenie_kontrakta.docx",
}
```

**Управление шаблонами:**

```python
# api/templates.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from datetime import datetime
from pathlib import Path

router = APIRouter(prefix="/api/templates", tags=["templates"])

@router.get("")
async def list_templates(
    current_user: User = Depends(get_current_user)
):
    """Получить список всех шаблонов"""
    templates = []
    
    for order_type, filename in template_map.items():
        file_path = Path(settings.TEMPLATES_PATH) / filename
        
        template_info = {
            "name": filename,
            "order_type": order_type,
            "exists": file_path.exists()
        }
        
        if file_path.exists():
            template_info["file_size"] = file_path.stat().st_size
            template_info["last_modified"] = datetime.fromtimestamp(
                file_path.stat().st_mtime
            ).isoformat()
        
        templates.append(template_info)
    
    return {"templates": templates}

@router.get("/{order_type}")
async def download_template(
    order_type: str,
    current_user: User = Depends(get_current_user)
):
    """Скачать шаблон"""
    if order_type not in template_map:
        raise HTTPException(400, "Неверный тип приказа")
    
    filename = template_map[order_type]
    file_path = Path(settings.TEMPLATES_PATH) / filename
    
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")
    
    return FileResponse(
        file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

@router.post("/{order_type}")
async def upload_template(
    order_type: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Загрузить новый шаблон (только admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Недостаточно прав")
    
    if order_type not in template_map:
        raise HTTPException(400, "Неверный тип приказа")
    
    if not file.filename.endswith('.docx'):
        raise HTTPException(400, "Только файлы .docx")
    
    filename = template_map[order_type]
    file_path = Path(settings.TEMPLATES_PATH) / filename
    
    # Сохранить файл
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    logger.info(
        "template_uploaded",
        order_type=order_type,
        filename=filename,
        file_size=len(content),
        user_id=current_user.id
    )
    
    return {
        "status": "uploaded",
        "template": filename,
        "file_size": len(content)
    }

@router.put("/{order_type}")
async def update_template(
    order_type: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Обновить существующий шаблон (только admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Недостаточно прав")
    
    if order_type not in template_map:
        raise HTTPException(400, "Неверный тип приказа")
    
    if not file.filename.endswith('.docx'):
        raise HTTPException(400, "Только файлы .docx")
    
    filename = template_map[order_type]
    file_path = Path(settings.TEMPLATES_PATH) / filename
    
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не существует. Используйте POST для создания.")
    
    # Заменить файл
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    logger.info(
        "template_updated",
        order_type=order_type,
        filename=filename,
        file_size=len(content),
        user_id=current_user.id
    )
    
    return {
        "status": "updated",
        "template": filename,
        "file_size": len(content)
    }

@router.delete("/{order_type}")
async def delete_template(
    order_type: str,
    current_user: User = Depends(get_current_user)
):
    """Удалить шаблон (только admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Недостаточно прав")
    
    if order_type not in template_map:
        raise HTTPException(400, "Неверный тип приказа")
    
    filename = template_map[order_type]
    file_path = Path(settings.TEMPLATES_PATH) / filename
    
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")
    
    # Удалить файл
    file_path.unlink()
    
    logger.warning(
        "template_deleted",
        order_type=order_type,
        filename=filename,
        user_id=current_user.id
    )
    
    return {
        "status": "deleted",
        "template": filename
    }
```

## Типы приказов

Система поддерживает 7 типов приказов:

1. **Прием на работу** - оформление нового сотрудника
2. **Увольнение** - увольнение сотрудника
3. **Отпуск трудовой** - ежегодный оплачиваемый отпуск
4. **Отпуск за свой счет** - отпуск без сохранения заработной платы
5. **Больничный** - оформление больничного листа
6. **Перевод** - перевод на другую должность или в другое подразделение
7. **Продление контракта** - продление срока действия контракта

Каждый тип приказа имеет свой шаблон документа и специфические поля для заполнения.

## Управление файлами

Система работает с несколькими типами файлов, которые хранятся на диске сервера через Docker volumes.

### Типы файлов

**1. Шаблоны приказов (Templates)**
- Формат: .docx
- Путь: `TEMPLATES_PATH` (по умолчанию `/app/data/templates`)
- Назначение: Шаблоны для генерации приказов с плейсхолдерами
- Управление: Можно редактировать напрямую на сервере или загружать через API

**2. Сгенерированные приказы (Orders)**
- Формат: .docx
- Путь: `ORDERS_PATH` (по умолчанию `/app/data/orders`)
- Имя файла: `"{order_type} {employee_name} {order_date}.docx"`
- Назначение: Архив всех сгенерированных приказов
- Связь с БД: Поле `file_path` в таблице `orders`

**3. Личные дела сотрудников (Personal Files)**
- Формат: PDF, DOCX, JPG, PNG (любые документы и фотографии)
- Путь: `PERSONAL_FILES_PATH/{tab_number}/` (по умолчанию `/app/data/personal/{tab_number}/`)
- Структура: Отдельная папка для каждого сотрудника
- Примеры файлов:
  - `photo.jpg` - фотография сотрудника
  - `contract.pdf` - трудовой договор
  - `passport.pdf` - скан паспорта
  - `diploma.pdf` - диплом об образовании
  - `medical.pdf` - медицинская справка
- ВАЖНО: Путь детерминирован через helper-функцию `get_personal_files_dir(tab_number)`, не хранится в БД
- ВАЖНО: При удалении сотрудника все файлы из его папки удаляются (если keep_files=false)

### API для работы с файлами

**Загрузка файлов:**

```python
# api/files.py

@router.post("/employees/{tab_number}/photo")
async def upload_employee_photo(
    tab_number: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Загрузить фотографию сотрудника"""
    # Проверка существования сотрудника
    employee = await EmployeeService.get_by_tab_number(db, tab_number)
    if not employee:
        raise HTTPException(404, "Сотрудник не найден")
    
    # Проверка формата
    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(400, "Только JPG или PNG")
    
    # Создать папку для сотрудника
    personal_dir = PERSONAL_FILES_PATH / str(tab_number)
    personal_dir.mkdir(parents=True, exist_ok=True)
    
    # Сохранение файла как photo.jpg в папке личного дела
    file_path = personal_dir / "photo.jpg"
    with open(file_path, "wb") as f:
        f.write(await file.read())
    
    return {"status": "uploaded", "path": str(file_path)}

@router.post("/employees/{tab_number}/files")
async def upload_personal_file(
    tab_number: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Загрузить файл в личное дело сотрудника"""
    employee = await EmployeeService.get_by_tab_number(db, tab_number)
    if not employee:
        raise HTTPException(404, "Сотрудник не найден")
    
    # Получить путь через helper-функцию
    personal_dir = get_personal_files_dir(tab_number)
    personal_dir.mkdir(parents=True, exist_ok=True)
    
    # Проверка целостности пути
    if not personal_dir.exists():
        raise HTTPException(500, "Не удалось создать директорию для личного дела")
    
    # Сохранение файла
    file_path = personal_dir / file.filename
    with open(file_path, "wb") as f:
        f.write(await file.read())
    
    return {"status": "uploaded", "filename": file.filename}

@router.get("/employees/{tab_number}/photo")
async def get_employee_photo(tab_number: int):
    """Получить фотографию сотрудника"""
    file_path = PHOTOS_PATH / f"{tab_number}.jpg"
    if not file_path.exists():
        file_path = PHOTOS_PATH / f"{tab_number}.png"
    
    if not file_path.exists():
        raise HTTPException(404, "Фотография не найдена")
    
    return FileResponse(file_path)

@router.get("/employees/{tab_number}/files")
async def list_personal_files(tab_number: int):
    """Получить список файлов в личном деле"""
    personal_dir = get_personal_files_dir(tab_number)
    if not personal_dir.exists():
        return {"files": []}
    
    files = [f.name for f in personal_dir.iterdir() if f.is_file()]
    return {"files": files}

@router.get("/employees/{tab_number}/files/{filename}")
async def download_personal_file(tab_number: int, filename: str):
    """Скачать файл из личного дела"""
    file_path = get_personal_files_dir(tab_number) / filename
    if not file_path.exists():
        raise HTTPException(404, "Файл не найден")
    
    return FileResponse(file_path, filename=filename)

@router.delete("/employees/{tab_number}")
async def delete_employee(
    tab_number: int, 
    keep_files: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Удалить сотрудника и его файлы"""
    employee = await EmployeeService.get_by_tab_number(db, tab_number)
    if not employee:
        raise HTTPException(404, "Сотрудник не найден")
    
    # Удалить сотрудника из БД
    await EmployeeService.delete(db, tab_number)
    
    # Удалить файлы личного дела (если keep_files=false)
    files_deleted = False
    if not keep_files:
        personal_dir = get_personal_files_dir(tab_number)
        if personal_dir.exists():
            import shutil
            shutil.rmtree(personal_dir)
            files_deleted = True
            # Логировать удаление файлов
            logger.info(f"Deleted personal files for employee {tab_number}")
    
    return {"message": "Employee deleted", "files_deleted": files_deleted}
```

**Скачивание приказов:**

```python
@router.get("/orders/{order_id}/download")
async def download_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """Скачать сгенерированный приказ"""
    order = await OrderService.get_by_id(db, order_id)
    if not order or not order.file_path:
        raise HTTPException(404, "Приказ не найден")
    
    file_path = Path(order.file_path)
    if not file_path.exists():
        raise HTTPException(404, "Файл приказа не найден на диске")
    
    return FileResponse(
        file_path, 
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
```

### Резервное копирование

**Backup всех файлов:**
```bash
# На сервере
tar -czf backup_$(date +%Y%m%d).tar.gz ./data/
```

**Восстановление:**
```bash
tar -xzf backup_20260402.tar.gz
```

### Ограничения и валидация

**Размер файлов:**
- Фотографии: максимум 5 МБ
- Личные дела: максимум 10 МБ на файл
- Общий размер личного дела: максимум 50 МБ на сотрудника

**Форматы файлов:**
- Фотографии: JPG, PNG
- Документы: PDF, DOCX, DOC
- Приказы: только DOCX

```python
# core/config.py
class Settings(BaseSettings):
    # File storage paths
    ORDERS_PATH: str = "/app/data/orders"
    TEMPLATES_PATH: str = "/app/data/templates"
    PERSONAL_FILES_PATH: str = "/app/data/personal"  # Включает фотографии
    
    # File size limits (in bytes)
    MAX_PHOTO_SIZE: int = 5 * 1024 * 1024  # 5 MB
    MAX_DOCUMENT_SIZE: int = 10 * 1024 * 1024  # 10 MB
    MAX_PERSONAL_FILES_TOTAL: int = 50 * 1024 * 1024  # 50 MB
```

## Аналитика и уведомления

Система предоставляет комплексную аналитику и систему уведомлений.

### Статистика по сотрудникам

**Общая статистика:**
- Общее количество сотрудников
- Распределение по полу (мужчины/женщины)
- Распределение по подразделениям
- Распределение по должностям
- Средний возраст сотрудников
- Средний стаж работы (в месяцах)

**Статистика по контрактам:**
- Активные контракты
- Контракты, истекающие в ближайшее время
- Просроченные контракты

### Уведомления об истечении контрактов

Система отслеживает сроки действия контрактов и предоставляет уведомления с приоритетами:

**Приоритеты:**
- **EXPIRED** - контракт уже истёк (просроченные)
- **HIGH** - контракт истекает в ближайшие 3 месяца
- **MEDIUM** - контракт истекает в течение заданного периода

**Группировка:**
- Уведомления группируются по месяцам истечения
- Отдельная группа "Просроченные" для истёкших контрактов
- Отдельная группа "Без даты" для сотрудников без указанной даты окончания контракта

### Предстоящие дни рождения

Система отслеживает дни рождения сотрудников:
- Показывает дни рождения в заданном периоде (по умолчанию 30 дней)
- Рассчитывает количество дней до дня рождения
- Рассчитывает возраст сотрудника
- Сортирует по близости даты

### Статистика по отпускам

Для каждого сотрудника рассчитывается:
- **used_days** - использованные дни отпуска
- **available_days** - доступные дни отпуска (28 дней в год)
- **remaining_days** - оставшиеся дни отпуска

## Настройки приложения

Система позволяет настраивать пути хранения файлов через API.

### Конфигурируемые пути

**ORDERS_PATH** - путь для сохранения сгенерированных приказов
- По умолчанию: настраивается в `backend/app/settings.py`
- Можно изменить через: `PUT /api/orders/settings`

**TEMPLATES_PATH** - путь к шаблонам приказов
- По умолчанию: настраивается в `backend/app/settings.py`
- Можно изменить через: `PUT /api/orders/settings`

### Синхронизация приказов

Функция синхронизации (`POST /api/orders/sync`) позволяет:
- Удалить записи из БД для файлов, которые были удалены с диска
- Добавить записи в БД для новых файлов, найденных на диске
- Автоматически парсить имена файлов для извлечения информации о приказе

## Аутентификация и Доступ (Окружения)

Разработчик должен реализовать систему так, чтобы она меняла поведение в зависимости от переменной ENV в файле конфигурации.

### Модель пользователя и роли

```python
# models/user.py
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)  # admin, hr_manager, hr_specialist
    full_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# schemas/user.py
class UserRole(str, Enum):
    ADMIN = "admin"  # Полный доступ ко всем функциям
    HR_MANAGER = "hr_manager"  # Управление сотрудниками, приказами, отпусками
    HR_SPECIALIST = "hr_specialist"  # Просмотр и создание приказов, отпусков
```

### Права доступа по ролям

**admin:**
- Полный доступ ко всем функциям
- Управление пользователями (создание, редактирование, удаление)
- Управление настройками системы

**hr_manager:**
- Управление сотрудниками (создание, редактирование, удаление)
- Управление приказами (создание, редактирование, удаление)
- Управление отпусками (создание, редактирование, удаление)
- Просмотр аналитики

**hr_specialist:**
- Просмотр сотрудников
- Создание приказов
- Создание отпусков
- Просмотр аналитики

### Окружение: dev

```python
# Если ENV=dev:
# - API не требует JWT-токена
# - Зависимость get_current_user автоматически возвращает фейкового админа
# - JWT работает, но проверка упрощена (для удобства разработки)

if settings.ENV == "dev":
    async def get_current_user(token: str = Depends(oauth2_scheme_optional)):
        # Если токен не передан - возвращаем фейкового админа
        if not token:
            return User(id=1, username="admin", role="admin", full_name="Dev Admin")
        
        # Если токен передан - проверяем его (для тестирования аутентификации)
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return get_user_from_payload(payload)
        except JWTError:
            # В dev режиме даже при ошибке токена возвращаем админа
            return User(id=1, username="admin", role="admin", full_name="Dev Admin")
```спользуется база данных hrms_dev

if settings.ENV == "dev":
    async def get_current_user():
        return User(id=1, username="admin", role="admin")
```

### Окружение: test

```python
# Если ENV=test:
# - Включена проверка JWT
# - Используется база данных hrms_test
# - JWT работает во всех окружениях (dev/test/prod)

if settings.ENV == "test":
    async def get_current_user(token: str = Depends(oauth2_scheme)):
        # Проверка JWT токена
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user = await get_user_from_payload(payload)
            if not user:
                raise HTTPException(401, "Пользователь не найден")
            return user
        except JWTError:
            raise HTTPException(401, "Неверный токен")
```

### Окружение: prod

```python
# Если ENV=prod:
# - Включена полная проверка JWT с обязательной аутентификацией
# - Используется база данных hrms_prod
# - Включено логирование всех операций
# - Отключен режим отладки
# - JWT работает во всех окружениях (dev/test/prod)

if settings.ENV == "prod":
    async def get_current_user(token: str = Depends(oauth2_scheme)):
        # Строгая проверка JWT токена
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user = await get_user_from_payload(payload)
            if not user:
                raise HTTPException(401, "Пользователь не найден")
            return user
        except JWTError:
            raise HTTPException(401, "Неверный токен")
```

### Генерация JWT токена

```python
# core/security.py
from datetime import datetime, timedelta
from jose import jwt

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# api/auth.py
@router.post("/login")
async def login(
    credentials: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Аутентификация пользователя"""
    user = await UserService.authenticate(db, credentials.username, credentials.password)
    if not user:
        raise HTTPException(401, "Неверные учетные данные")
    
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name
        }
    }
```

## Валидация данных

### Валидация дат

**КРИТИЧЕСКИ ВАЖНО:** Все даты должны проходить валидацию на уровне Pydantic схем.

```python
# schemas/employee.py
from datetime import date, datetime
from pydantic import BaseModel, Field, validator

class EmployeeCreate(BaseModel):
    tab_number: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    birth_date: date
    hire_date: date
    contract_start: date
    contract_end: date
    # ... другие поля
    
    @validator('birth_date')
    def validate_birth_date(cls, v):
        """birth_date: не может быть в будущем, не может быть раньше 1900 года"""
        if v > date.today():
            raise ValueError('Дата рождения не может быть в будущем')
        if v.year < 1900:
            raise ValueError('Дата рождения не может быть раньше 1900 года')
        return v
    
    @validator('hire_date')
    def validate_hire_date(cls, v, values):
        """hire_date: не может быть раньше birth_date + 16 лет"""
        if 'birth_date' in values:
            birth_date = values['birth_date']
            min_hire_date = date(birth_date.year + 16, birth_date.month, birth_date.day)
            if v < min_hire_date:
                raise ValueError('Дата приёма на работу не может быть раньше 16 лет от даты рождения')
        return v
    
    @validator('contract_end')
    def validate_contract_end(cls, v, values):
        """contract_end: не может быть раньше contract_start"""
        if 'contract_start' in values:
            if v < values['contract_start']:
                raise ValueError('Дата окончания контракта не может быть раньше даты начала')
        return v
```

### Валидация отпусков

```python
# services/vacation_service.py
async def create_vacation(self, db: AsyncSession, vacation_data: VacationCreate) -> Vacation:
    # Проверка дат
    if vacation_data.end_date < vacation_data.start_date:
        raise ValueError("Дата окончания должна быть после даты начала")
    
    # Проверка существования сотрудника
    employee = await self.employee_repo.get_by_tab_number(db, vacation_data.tab_number)
    if not employee:
        raise ValueError("Сотрудник не найден")
    
    # Проверка пересечения отпусков
    has_overlap = await self.check_overlap(
        db, 
        vacation_data.tab_number, 
        vacation_data.start_date, 
        vacation_data.end_date
    )
    if has_overlap:
        raise ValueError("Отпуск пересекается с существующим отпуском")
    
    # Определить отпускной год
    vacation_year = vacation_data.start_date.year
    
    # Проверка лимита дней с учетом пропорционального расчета
    available_days = await self.calculate_available_days(db, vacation_data.tab_number, vacation_year)
    used_days = await self.get_used_days(db, vacation_data.tab_number, vacation_year)
    remaining_days = available_days - used_days
    
    if remaining_days < vacation_data.days_count:
        raise ValueError(f"Недостаточно дней отпуска. Доступно: {remaining_days}")
    
    # Добавить vacation_year к данным
    vacation_data_dict = vacation_data.dict()
    vacation_data_dict['vacation_year'] = vacation_year
    
    return await self.vacation_repo.create(db, vacation_data_dict)

async def calculate_available_days(self, db: AsyncSession, tab_number: int, year: int) -> int:
    """
    Рассчитать доступные дни отпуска с учетом пропорционального расчета.
    
    Правила:
    - Отпускной год = календарный год (с 1 января по 31 декабря)
    - Остаток отпуска НЕ переносится на следующий год (сгорает)
    - Для сотрудников принятых в середине года - пропорциональный расчет:
      28 дней / 12 месяцев * количество отработанных месяцев
    """
    employee = await self.employee_repo.get_by_tab_number(db, tab_number)
    if not employee:
        return 0
    
    # Если сотрудник принят в текущем году
    if employee.hire_date.year == year:
        # Рассчитать количество отработанных месяцев
        months_worked = 12 - employee.hire_date.month + 1
        # Пропорциональный расчет
        available_days = (28 / 12) * months_worked
        return int(available_days)
    
    # Если сотрудник работает полный год
    return 28
```

## Логирование

**КРИТИЧЕСКИ ВАЖНО:** Система должна использовать структурированное логирование через structlog.

```python
# core/logging.py
import structlog
from structlog.processors import JSONRenderer, TimeStamper, add_log_level

def configure_logging(env: str):
    """Настроить логирование в зависимости от окружения"""
    
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    
    if env == "prod":
        # В продакшене - JSON формат для парсинга
        processors.append(JSONRenderer())
    else:
        # В dev/test - читаемый формат
        processors.append(structlog.dev.ConsoleRenderer())
    
    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

# Использование в коде
logger = structlog.get_logger()

# Логирование API запросов
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    duration_ms = (time.time() - start_time) * 1000
    
    logger.info(
        "api_request",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=round(duration_ms, 2),
        user_id=getattr(request.state, "user_id", None)
    )
    
    return response

# Логирование операций с файлами
logger.info(
    "file_uploaded",
    tab_number=tab_number,
    filename=file.filename,
    size_bytes=file.size,
    user_id=current_user.id
)

# Логирование изменений в БД
logger.info(
    "employee_created",
    tab_number=employee.tab_number,
    name=employee.name,
    user_id=current_user.id
)

# Логирование ошибок
logger.error(
    "database_error",
    error=str(e),
    query=query,
    user_id=current_user.id
)
```

**Формат лога:**
```json
{
  "timestamp": "2026-04-02T10:30:45.123456Z",
  "level": "info",
  "event": "api_request",
  "method": "POST",
  "path": "/api/employees",
  "status_code": 201,
  "duration_ms": 45.67,
  "user_id": 1
}
```

**Настройка логирования в продакшене:**
```python
# core/config.py
class Settings(BaseSettings):
    # ... другие настройки
    
    # Logging (для prod)
    LOG_LEVEL: str = "INFO"  # DEBUG, INFO, WARNING, ERROR
    LOG_FILE: str = "/app/logs/hrms.log"
    LOG_MAX_BYTES: int = 10 * 1024 * 1024  # 10 MB
    LOG_BACKUP_COUNT: int = 5  # Количество файлов ротации
```

**Ротация логов:**
```python
# core/logging.py
from logging.handlers import RotatingFileHandler

if settings.ENV == "prod":
    handler = RotatingFileHandler(
        settings.LOG_FILE,
        maxBytes=settings.LOG_MAX_BYTES,
        backupCount=settings.LOG_BACKUP_COUNT
    )
```

## Таймауты и лимиты

**КРИТИЧЕСКИ ВАЖНО:** Система должна иметь таймауты для всех операций.

```python
# core/config.py
class Settings(BaseSettings):
    # ... другие настройки
    
    # Database timeouts
    DB_QUERY_TIMEOUT: int = 30  # секунд
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    
    # Document generation timeout
    DOCUMENT_GENERATION_TIMEOUT: int = 60  # секунд
```

**Настройка connection pool:**
```python
# core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENV == "dev",
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    connect_args={
        "timeout": settings.DB_QUERY_TIMEOUT,
        "command_timeout": settings.DB_QUERY_TIMEOUT,
    }
)
```

**Таймаут для генерации документов:**
```python
# services/order_service.py
import asyncio

async def generate_and_save_document(
    self, 
    order: Order, 
    employee: Employee
) -> str:
    """Генерация документа с таймаутом"""
    try:
        # Обернуть синхронную генерацию в asyncio.to_thread с таймаутом
        file_path = await asyncio.wait_for(
            asyncio.to_thread(self._generate_document_sync, order, employee),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT
        )
        return file_path
    except asyncio.TimeoutError:
        logger.error(
            "document_generation_timeout",
            order_number=order.order_number,
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT
        )
        raise ValueError(f"Генерация документа превысила таймаут {settings.DOCUMENT_GENERATION_TIMEOUT} секунд")
```

## Отказоустойчивость и мониторинг

**ОСОЗНАННОЕ ОГРАНИЧЕНИЕ:** Система работает на одном сервере (single point of failure).

### Рекомендации по мониторингу

**1. Мониторинг состояния сервисов:**
```bash
# Проверка состояния контейнеров
docker ps
docker stats

# Проверка логов
docker logs hrms-backend
docker logs hrms-postgres
```

**2. Мониторинг базы данных:**
```sql
-- Проверка активных соединений
SELECT count(*) FROM pg_stat_activity;

-- Проверка размера базы данных
SELECT pg_size_pretty(pg_database_size('hrms_prod'));

-- Проверка медленных запросов
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

**3. Мониторинг дискового пространства:**
```bash
# Проверка свободного места
df -h

# Проверка размера папок с файлами
du -sh ./data/orders
du -sh ./data/personal_files
du -sh ./data/postgres
```

### Резервное копирование

**Автоматический backup (ежедневный):**
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Создать директорию для backup
mkdir -p $BACKUP_DIR

# Backup всех файлов
echo "Backing up files..."
tar -czf $BACKUP_DIR/hrms_files_$DATE.tar.gz ./data/

# Backup базы данных
echo "Backing up database..."
docker exec hrms-postgres pg_dump -U hrms_user hrms_prod > $BACKUP_DIR/hrms_db_$DATE.sql

# Сжать SQL дамп
gzip $BACKUP_DIR/hrms_db_$DATE.sql

# Удалить старые backup (старше 30 дней)
find $BACKUP_DIR -name "hrms_*" -mtime +30 -delete

echo "Backup completed: $DATE"
```

**Настройка cron для автоматического backup:**
```bash
# Добавить в crontab
crontab -e

# Запускать каждый день в 2:00 ночи
0 2 * * * /path/to/backup.sh >> /var/log/hrms_backup.log 2>&1
```

### Процедура восстановления после сбоя

**1. Восстановление файлов:**
```bash
# Остановить контейнеры
docker-compose down

# Восстановить файлы из backup
tar -xzf /backups/hrms_files_20260402_020000.tar.gz

# Запустить контейнеры
docker-compose up -d
```

**2. Восстановление базы данных:**
```bash
# Распаковать SQL дамп
gunzip /backups/hrms_db_20260402_020000.sql.gz

# Восстановить базу данных
docker exec -i hrms-postgres psql -U hrms_user hrms_prod < /backups/hrms_db_20260402_020000.sql
```

**3. Проверка целостности:**
```bash
# Проверить состояние контейнеров
docker ps

# Проверить health check
curl http://localhost:8000/api/health

# Проверить логи
docker logs hrms-backend --tail 100
```

### Проверка целостности файлов при старте

**КРИТИЧЕСКИ ВАЖНО:** При старте приложения проверять целостность путей.

```python
# core/startup.py
from pathlib import Path
import structlog

logger = structlog.get_logger()

async def check_file_paths():
    """Проверить целостность путей при старте приложения"""
    paths_to_check = [
        (settings.ORDERS_PATH, "Orders path"),
        (settings.TEMPLATES_PATH, "Templates path"),
        (settings.PERSONAL_FILES_PATH, "Personal files path"),
    ]
    
    for path_str, name in paths_to_check:
        path = Path(path_str)
        
        # Создать директорию если не существует
        if not path.exists():
            logger.warning(f"{name} does not exist, creating", path=str(path))
            path.mkdir(parents=True, exist_ok=True)
        
        # Проверить права на запись
        if not os.access(path, os.W_OK):
            logger.error(f"{name} is not writable", path=str(path))
            raise RuntimeError(f"{name} is not writable: {path}")
        
        logger.info(f"{name} is OK", path=str(path))

async def check_broken_file_links():
    """Проверить битые ссылки в БД (file_path не существует на диске)"""
    async with async_session() as db:
        # Проверить приказы
        orders = await db.execute(select(Order))
        broken_orders = []
        
        for order in orders.scalars():
            if order.file_path and not Path(order.file_path).exists():
                broken_orders.append(order.order_number)
                logger.warning(
                    "broken_file_link",
                    order_number=order.order_number,
                    file_path=order.file_path
                )
        
        if broken_orders:
            logger.warning(
                "found_broken_file_links",
                count=len(broken_orders),
                orders=broken_orders
            )

# В main.py
@app.on_event("startup")
async def startup_event():
    """Выполнить проверки при старте приложения"""
    logger.info("Starting HRMS application", env=settings.ENV)
    
    # Проверить пути
    await check_file_paths()
    
    # Проверить битые ссылки
    await check_broken_file_links()
    
    logger.info("Startup checks completed")
```

### Механизм восстановления битых ссылок

```python
# api/maintenance.py
@router.post("/maintenance/fix-broken-links")
async def fix_broken_file_links(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Исправить битые ссылки в БД (только admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Недостаточно прав")
    
    # Найти приказы с битыми ссылками
    orders = await db.execute(select(Order))
    fixed_count = 0
    deleted_count = 0
    
    for order in orders.scalars():
        if order.file_path and not Path(order.file_path).exists():
            # Попытаться найти файл по новому формату имени
            expected_filename = f"{order.order_number}_{order.order_type}_{order.tab_number}_{order.order_date}.docx"
            expected_path = Path(settings.ORDERS_PATH) / expected_filename
            
            if expected_path.exists():
                # Обновить путь в БД
                order.file_path = str(expected_path)
                fixed_count += 1
                logger.info(
                    "fixed_broken_link",
                    order_number=order.order_number,
                    new_path=str(expected_path)
                )
            else:
                # Удалить запись из БД
                await db.delete(order)
                deleted_count += 1
                logger.warning(
                    "deleted_order_with_missing_file",
                    order_number=order.order_number
                )
    
    await db.commit()
    
    return {
        "message": "Broken links fixed",
        "fixed": fixed_count,
        "deleted": deleted_count
    }
```

## База данных и Миграции

### Правила миграций (КРИТИЧЕСКИ ВАЖНО)

- **ЗАПРЕЩЕНО** изменять структуру таблиц без создания миграции
- При добавлении нового поля разработчик ОБЯЗАН сделать:
  1. `alembic revision --autogenerate -m "added_field_X"`
  2. `alembic upgrade head`

### Конфигурация базы данных

- Базы `hrms_dev`, `hrms_test` и `hrms_prod` работают в одном Docker-контейнере, но логически разделены
- Образ PostgreSQL 15 Alpine
- Порт 5432 проброшен на localhost только для инструментов администратора

```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:15-alpine
    container_name: hrms-postgres
    environment:
      POSTGRES_USER: hrms_user
      POSTGRES_PASSWORD: hrms_pass
      POSTGRES_DB: hrms_dev
    ports:
      - "5432:5432"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hrms_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    container_name: hrms-backend
    volumes:
      - ./data/orders:/app/data/orders              # Приказы
      - ./data/templates:/app/data/templates        # Шаблоны
      - ./data/personal_files:/app/data/personal    # Личные дела (включая фотографии)
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://hrms_user:hrms_pass@postgres:5432/hrms_dev
      ENV: dev
      ORDERS_PATH: /app/data/orders
      TEMPLATES_PATH: /app/data/templates
      PERSONAL_FILES_PATH: /app/data/personal
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build: ./frontend
    container_name: hrms-frontend
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://192.168.1.100:8000
    depends_on:
      - backend
```

```yaml
# docker-compose.prod.yml
services:
  postgres:
    image: postgres:15-alpine
    container_name: hrms-postgres-prod
    environment:
      POSTGRES_USER: hrms_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # Из .env.prod
      POSTGRES_DB: hrms_prod
    ports:
      - "127.0.0.1:5432:5432"  # Только localhost
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hrms_user"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

  backend:
    build: ./backend
    container_name: hrms-backend-prod
    volumes:
      - ./data/orders:/app/data/orders
      - ./data/templates:/app/data/templates
      - ./data/personal_files:/app/data/personal    # Личные дела (включая фотографии)
      - ./logs:/app/logs  # Логи для продакшена
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://hrms_user:${POSTGRES_PASSWORD}@postgres:5432/hrms_prod
      ENV: prod
      SECRET_KEY: ${SECRET_KEY}
      ORDERS_PATH: /app/data/orders
      TEMPLATES_PATH: /app/data/templates
      PERSONAL_FILES_PATH: /app/data/personal
    depends_on:
      postgres:
        condition: service_healthy
    restart: always

  frontend:
    build: 
      context: ./frontend
      args:
        VITE_API_URL: http://192.168.1.100:8000
    container_name: hrms-frontend-prod
    ports:
      - "5173:5173"
    depends_on:
      - backend
    restart: always
```

## Обработка ошибок

### Ответы об ошибках Backend

```python
# Стандартный формат ответа об ошибке
{
  "detail": "Сообщение об ошибке",
  "error_code": "EMPLOYEE_NOT_FOUND",
  "status_code": 404
}
```

### Обработка ошибок Frontend

```typescript
// Обработка ошибок React Query
const { data, error, isError } = useEmployees();

if (isError) {
  return <ErrorMessage message={error.message} />;
}
```

## Стратегия тестирования

### Тестирование Backend

- Юнит-тесты для слоя Services (бизнес-логика)
- Интеграционные тесты для API эндпоинтов
- Тесты Repository с тестовой базой данных

### Тестирование Frontend

- Тесты компонентов с React Testing Library
- Интеграционные тесты для пользовательских сценариев
- E2E тесты с Playwright (опционально)

## Соображения производительности

- Пулинг соединений с базой данных через асинхронный движок SQLAlchemy
- Кэширование ответов API в React Query
- Ленивая загрузка для маршрутов фронтенда
- Генерация документов в памяти (без операций ввода-вывода на диск)

## Соображения безопасности

- Аутентификация на основе JWT в тестовом/продакшн окружениях
- Обход безопасности на основе окружения для разработки
- Предотвращение SQL-инъекций через SQLAlchemy ORM
- Конфигурация CORS для доступа в локальной сети
- Никаких чувствительных данных в Git (файлы .env в .gitignore)
- Управление пользователями и ролями (admin, hr_manager, hr_specialist)
- Хэширование паролей через passlib[bcrypt]

## Отказоустойчивость

**ОСОЗНАННОЕ ОГРАНИЧЕНИЕ:** Система работает на одном сервере (single point of failure).

### Ограничения архитектуры

- Система развернута на одном физическом сервере
- Нет репликации базы данных
- Нет балансировки нагрузки
- Нет автоматического failover

### Рекомендации по минимизации рисков

**1. Мониторинг:**
- Регулярная проверка состояния контейнеров (docker ps, docker stats)
- Мониторинг дискового пространства (df -h)
- Мониторинг базы данных (активные соединения, размер БД, медленные запросы)
- Проверка логов приложения

**2. Резервное копирование:**
- Ежедневный автоматический backup через cron (в 2:00 ночи)
- Backup файлов (tar.gz архив директории data/)
- Backup базы данных (pg_dump с gzip)
- Хранение backup за последние 30 дней
- Регулярная проверка возможности восстановления

**3. Процедура восстановления:**
- Документированная процедура восстановления из backup
- Проверка целостности файлов при старте приложения
- Механизм восстановления битых ссылок (file_path в БД не существует на диске)

**4. Стратегия миграции файлов:**
- При переносе сервера: скопировать всю директорию data/
- Обновить пути в конфигурации (.env файлы)
- Запустить проверку целостности путей
- Запустить механизм восстановления битых ссылок

**5. Валидация путей:**
- Проверка существования путей при старте приложения
- Автоматическое создание отсутствующих директорий
- Проверка прав на запись
- Логирование всех проблем с файловой системой

## Зависимости

### Зависимости Backend

```
fastapi
uvicorn[standard]
sqlalchemy[asyncio]
asyncpg
alembic
pydantic
pydantic-settings
python-jose[cryptography]
passlib[bcrypt]
python-multipart
python-docx
structlog  # Структурированное логирование
```

### Зависимости Frontend

```
react
react-dom
react-router-dom
@tanstack/react-query
axios
tailwindcss
typescript
vite
shadcn-ui components
```

## КРИТИЧЕСКИЕ ТРЕБОВАНИЯ ПРИ МИГРАЦИИ

При переписывании приложения с Electron/Remix на веб-архитектуру необходимо ОБЯЗАТЕЛЬНО учесть следующие моменты:

### 1. Асинхронная работа с базой данных

**ОБЯЗАТЕЛЬНО использовать:**
- `AsyncSession` из `sqlalchemy.ext.asyncio`
- `asyncpg` драйвер для PostgreSQL
- `create_async_engine()` для создания движка
- Все методы Repository и Service должны быть `async def`
- Все запросы к БД через `await db.execute(select(...))`

```python
# Правильная конфигурация
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost:5432/hrms_dev",
    echo=True,
    pool_pre_ping=True
)

async_session = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

async def get_db():
    async with async_session() as session:
        yield session
```

### 2. Строгое соблюдение слоистой архитектуры

**ОБЯЗАТЕЛЬНО создать Repository слой:**

```python
# repositories/employee_repository.py
class EmployeeRepository:
    @staticmethod
    async def get_by_tab_number(db: AsyncSession, tab_number: int) -> Optional[Employee]:
        result = await db.execute(
            select(Employee).where(Employee.tab_number == tab_number)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_all(db: AsyncSession, department: Optional[str] = None) -> List[Employee]:
        stmt = select(Employee)
        if department:
            stmt = stmt.where(Employee.department == department)
        result = await db.execute(stmt)
        return result.scalars().all()
```

**ЗАПРЕЩЕНО:**
- Прямые вызовы `db.query()` или `db.execute()` в API слое
- Прямые вызовы `db.query()` или `db.execute()` в Service слое
- Только Repository имеет право работать с SQLAlchemy

### 3. Хранение файлов через Docker Volumes

**ОБЯЗАТЕЛЬНО использовать Docker volumes для всех файлов:**

```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:15-alpine
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: hrms_user
      POSTGRES_PASSWORD: hrms_pass
      POSTGRES_DB: hrms_dev
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    volumes:
      - ./data/orders:/app/data/orders              # Сгенерированные приказы
      - ./data/templates:/app/data/templates        # Шаблоны приказов
      - ./data/personal_files:/app/data/personal    # Личные дела (включая фотографии)
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://hrms_user:hrms_pass@postgres:5432/hrms_dev
      ORDERS_PATH: /app/data/orders
      TEMPLATES_PATH: /app/data/templates
      PERSONAL_FILES_PATH: /app/data/personal
    depends_on:
      - postgres
```

**Структура хранения файлов на сервере:**
```
./data/
├── postgres/           # База данных PostgreSQL
├── orders/             # Сгенерированные приказы (.docx)
│   ├── 2026/          # Приказы за 2026 год
│   │   ├── Приказ_№01_к_15_01_прием_Иванов_И_В.docx
│   │   ├── Приказ_№02_к_08_01_продление_Юрочка_И_В.docx
│   │   └── ...
│   ├── 2025/          # Приказы за 2025 год
│   │   └── ...
│   └── 2024/          # Приказы за 2024 год
│       └── ...
├── templates/          # Шаблоны приказов (.docx)
│   ├── prikaz_priem.docx
│   ├── prikaz_uvolnenie.docx
│   ├── prikaz_otpusk_trudovoy.docx
│   ├── prikaz_otpusk_svoy_schet.docx
│   ├── prikaz_bolnichnyy.docx
│   ├── prikaz_perevod.docx
│   └── prikaz_prodlenie_kontrakta.docx
└── personal_files/     # Личные дела сотрудников
    └── {tab_number}/   # Папка для каждого сотрудника
        ├── photo.jpg           # Фотография сотрудника
        ├── contract.pdf        # Трудовой договор
        ├── passport.pdf        # Скан паспорта
        ├── diploma.pdf         # Диплом
        └── ...                 # Другие документы
```

**Преимущества такого подхода:**
- Файлы сохраняются при перезапуске контейнера
- Файлы доступны напрямую на сервере (можно открыть в проводнике)
- Легко делать резервное копирование (просто копируешь папку ./data/)
- Шаблоны можно редактировать без перезапуска приложения
- Личные дела и фотографии хранятся организованно

### 4. PostgreSQL с самого начала

**ОБЯЗАТЕЛЬНО:**
- Использовать PostgreSQL 15 Alpine в Docker
- Настроить две базы данных: `hrms_dev` и `hrms_test`
- Использовать `asyncpg` драйвер
- Настроить connection pooling

```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:15-alpine
    container_name: hrms-postgres
    environment:
      POSTGRES_USER: hrms_user
      POSTGRES_PASSWORD: hrms_pass
      POSTGRES_DB: hrms_dev
    ports:
      - "5432:5432"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hrms_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    container_name: hrms-backend
    volumes:
      - ./data/orders:/app/data/orders              # Приказы
      - ./data/templates:/app/data/templates        # Шаблоны
      - ./data/personal_files:/app/data/personal    # Личные дела (включая фотографии)
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://hrms_user:hrms_pass@postgres:5432/hrms_dev
      ENV: dev
      ORDERS_PATH: /app/data/orders
      TEMPLATES_PATH: /app/data/templates
      PERSONAL_FILES_PATH: /app/data/personal
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build: ./frontend
    container_name: hrms-frontend
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://192.168.1.100:8000
    depends_on:
      - backend
```

### 5. Настройки через переменные окружения

**ОБЯЗАТЕЛЬНО использовать pydantic-settings:**

```python
# core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    
    # Environment
    ENV: str = "dev"  # dev, test, prod
    
    # Logging (для prod)
    LOG_LEVEL: str = "INFO"  # DEBUG, INFO, WARNING, ERROR
    LOG_FILE: str = "/app/logs/hrms.log"
    LOG_MAX_BYTES: int = 10 * 1024 * 1024  # 10 MB
    LOG_BACKUP_COUNT: int = 5  # Количество файлов ротации
    
    # File storage paths
    ORDERS_PATH: str = "/app/data/orders"
    TEMPLATES_PATH: str = "/app/data/templates"
    PERSONAL_FILES_PATH: str = "/app/data/personal"  # Включает фотографии
    
    # File size limits (in bytes)
    MAX_PHOTO_SIZE: int = 5 * 1024 * 1024  # 5 MB
    MAX_DOCUMENT_SIZE: int = 10 * 1024 * 1024  # 10 MB
    MAX_PERSONAL_FILES_TOTAL: int = 50 * 1024 * 1024  # 50 MB per employee
    
    # Database timeouts and connection pool
    DB_QUERY_TIMEOUT: int = 30  # секунд
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    
    # Document generation timeout
    DOCUMENT_GENERATION_TIMEOUT: int = 60  # секунд
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
```

**ЗАПРЕЩЕНО:**
- Перезаписывать файлы с исходным кодом через API
- Использовать глобальные переменные для настроек
- Хранить настройки в Python файлах

### 6. Использование транзакций

**ОБЯЗАТЕЛЬНО оборачивать сложные операции в транзакции:**

```python
# services/order_service.py
async def create_order_with_validation(
    self, 
    db: AsyncSession, 
    order_data: OrderCreate
) -> Order:
    async with db.begin():  # Автоматический rollback при ошибке
        # Проверка существования сотрудника
        employee = await self.employee_repo.get_by_tab_number(db, order_data.tab_number)
        if not employee:
            raise ValueError("Employee not found")
        
        # Генерация номера приказа
        order_number = await self.get_next_order_number(db, order_data.order_type)
        
        # Создание приказа
        order = await self.order_repo.create(db, order_data, order_number)
        
        # Если что-то упадёт - автоматический rollback
        return order
```

### 7. Валидация бизнес-правил

**ОБЯЗАТЕЛЬНО добавить проверки в Service слой:**

```python
# services/vacation_service.py
async def create_vacation(self, db: AsyncSession, vacation_data: VacationCreate) -> Vacation:
    # Проверка дат
    if vacation_data.end_date < vacation_data.start_date:
        raise ValueError("Дата окончания должна быть после даты начала")
    
    # Проверка существования сотрудника
    employee = await self.employee_repo.get_by_tab_number(db, vacation_data.tab_number)
    if not employee:
        raise ValueError("Сотрудник не найден")
    
    # Проверка пересечения отпусков
    has_overlap = await self.check_overlap(
        db, 
        vacation_data.tab_number, 
        vacation_data.start_date, 
        vacation_data.end_date
    )
    if has_overlap:
        raise ValueError("Отпуск пересекается с существующим отпуском")
    
    # Проверка лимита дней
    stats = await self.get_vacation_stats(db, vacation_data.tab_number)
    if stats.remaining_days < vacation_data.days_count:
        raise ValueError(f"Недостаточно дней отпуска. Доступно: {stats.remaining_days}")
    
    return await self.vacation_repo.create(db, vacation_data)
```

### 8. Dependency Injection для сервисов

**ОБЯЗАТЕЛЬНО использовать DI вместо статических методов:**

```python
# services/employee_service.py
class EmployeeService:
    def __init__(self, repo: EmployeeRepository):
        self.repo = repo
    
    async def get_all_employees(
        self, 
        db: AsyncSession, 
        department: Optional[str] = None
    ) -> List[Employee]:
        return await self.repo.get_all(db, department)

# api/employees.py
def get_employee_service(
    repo: EmployeeRepository = Depends(get_employee_repository)
) -> EmployeeService:
    return EmployeeService(repo)

@router.get("")
async def get_employees(
    department: Optional[str] = None,
    service: EmployeeService = Depends(get_employee_service),
    db: AsyncSession = Depends(get_db)
):
    return await service.get_all_employees(db, department)
```

### 9. Типизация и валидация данных

**ОБЯЗАТЕЛЬНО использовать строгую типизацию:**

```python
# Использовать Enum для типов приказов
from enum import Enum

class OrderType(str, Enum):
    HIRE = "Прием на работу"
    FIRE = "Увольнение"
    VACATION = "Отпуск трудовой"
    UNPAID_VACATION = "Отпуск за свой счет"
    SICK_LEAVE = "Больничный"
    TRANSFER = "Перевод"
    CONTRACT_EXTENSION = "Продление контракта"

# Использовать в схемах
class OrderCreate(BaseModel):
    order_type: OrderType  # ← Строгая типизация
    tab_number: int = Field(gt=0)
    order_date: date
    notes: Optional[str] = Field(None, max_length=1000)
```

### 10. Обработка ошибок

**ОБЯЗАТЕЛЬНО создать единую систему обработки ошибок:**

```python
# core/exceptions.py
class HRMSException(Exception):
    """Base exception for HRMS"""
    def __init__(self, message: str, error_code: str):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)

class EmployeeNotFoundError(HRMSException):
    def __init__(self, tab_number: int):
        super().__init__(
            f"Сотрудник с табельным номером {tab_number} не найден",
            "EMPLOYEE_NOT_FOUND"
        )

# api/exception_handlers.py
@app.exception_handler(HRMSException)
async def hrms_exception_handler(request: Request, exc: HRMSException):
    return JSONResponse(
        status_code=400,
        content={
            "detail": exc.message,
            "error_code": exc.error_code
        }
    )
```

### 11. Миграции Alembic с async

**ОБЯЗАТЕЛЬНО настроить Alembic для асинхронной работы:**

```python
# alembic/env.py
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import pool

async def run_migrations_online():
    connectable = create_async_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
```

### 12. Полная структура данных Employee

**ОБЯЗАТЕЛЬНО использовать все поля из существующей БД:**

Модель Employee должна содержать ВСЕ поля:
- tab_number (PK)
- name, department, position
- hire_date, birth_date
- gender, citizenship, residency, pensioner
- payment_form, rate
- contract_start, contract_end
- personal_number, insurance_number, passport_number
- created_at, updated_at

**КРИТИЧЕСКИ ВАЖНО:**
- УДАЛЕНО поле `personal_file_path` - путь детерминирован через helper-функцию `get_personal_files_dir(tab_number)`
- ФИО - первичный способ идентификации, табельный номер - запасной вариант
- Все поля используются в аналитике и генерации документов

НЕ упрощать модель! Все поля используются в аналитике и генерации документов.

### 13. Валидация дат через Pydantic

**ОБЯЗАТЕЛЬНО добавить валидаторы для дат:**

```python
# schemas/employee.py
@validator('birth_date')
def validate_birth_date(cls, v):
    """birth_date: не может быть в будущем, не может быть раньше 1900 года"""
    if v > date.today():
        raise ValueError('Дата рождения не может быть в будущем')
    if v.year < 1900:
        raise ValueError('Дата рождения не может быть раньше 1900 года')
    return v

@validator('hire_date')
def validate_hire_date(cls, v, values):
    """hire_date: не может быть раньше birth_date + 16 лет"""
    if 'birth_date' in values:
        birth_date = values['birth_date']
        min_hire_date = date(birth_date.year + 16, birth_date.month, birth_date.day)
        if v < min_hire_date:
            raise ValueError('Дата приёма на работу не может быть раньше 16 лет от даты рождения')
    return v

@validator('contract_end')
def validate_contract_end(cls, v, values):
    """contract_end: не может быть раньше contract_start"""
    if 'contract_start' in values:
        if v < values['contract_start']:
            raise ValueError('Дата окончания контракта не может быть раньше даты начала')
    return v
```

### 14. Структурированное логирование

**ОБЯЗАТЕЛЬНО использовать structlog:**

```python
import structlog

logger = structlog.get_logger()

# Логировать все API запросы, ошибки, операции с файлами, изменения в БД
logger.info(
    "api_request",
    method=request.method,
    path=request.url.path,
    status_code=response.status_code,
    duration_ms=round(duration_ms, 2),
    user_id=current_user.id
)
```

Формат лога: timestamp, level, message, user_id, endpoint, duration_ms
В prod: логи в файл /app/logs/hrms.log с ротацией

### 15. Таймауты и connection pool

**ОБЯЗАТЕЛЬНО настроить:**

```python
# Таймаут для запросов к БД: 30 секунд
# Connection pool settings: pool_size=20, max_overflow=10
# Таймаут для генерации документов: 60 секунд

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    connect_args={
        "timeout": settings.DB_QUERY_TIMEOUT,
        "command_timeout": settings.DB_QUERY_TIMEOUT,
    }
)
```

### 16. Генерация номера приказа через sequence

**ОБЯЗАТЕЛЬНО использовать PostgreSQL sequence:**

Формат: Просто число без префиксов (например: 1, 2, 3, 4, 5)
- БЕЗ ведущих нулей
- БЕЗ префикса года
- Обнуляется каждый год (1 января начинается с 1)
- Пользователь может вручную изменить номер при создании приказа через поле ввода
Создать таблицу order_sequences с полями: year, last_number
Использовать SELECT FOR UPDATE для защиты от race condition

### 17. Формат имени файла приказа

**ОБЯЗАТЕЛЬНО использовать новый формат:**

Формат: "{order_number}_{order_type}_{tab_number}_{order_date}.docx"
Пример: "5_Прием на работу_12345_2026-04-02.docx"
tab_number в имени файла используется для связи с сотрудником при синхронизации

### 18. Пагинация и сортировка

**ОБЯЗАТЕЛЬНО добавить:**

```python
# GET /api/employees: параметры page, per_page (по умолчанию 50)
# GET /api/orders/all: параметры page, per_page
# Параметры sort_by, sort_order (asc/desc)
# Формат ответа: {items: [], total: int, page: int, per_page: int, total_pages: int}
```

### 19. Удаление сотрудника с файлами

**ОБЯЗАТЕЛЬНО реализовать:**

При удалении сотрудника: удалить все файлы из PERSONAL_FILES_PATH/{tab_number}/
Параметр keep_files (по умолчанию false) для сохранения файлов
Логировать удаление файлов

### 20. Проверка целостности путей при старте

**ОБЯЗАТЕЛЬНО добавить:**

```python
@app.on_event("startup")
async def startup_event():
    # Проверить существование путей ORDERS_PATH, TEMPLATES_PATH, PERSONAL_FILES_PATH
    # Создать директории если не существуют
    # Проверить битые ссылки (file_path в БД не существует на диске)
    # Логировать результаты проверки
```

## Задачи Sprint 1 (Первоначальная реализация)

### Задача 1: Инициализация репозитория и инфраструктуры

- Создать папки backend, frontend, infra
- Написать docker-compose.dev.yml, который поднимает образ postgres:15-alpine с портом 5432
- Настроить .env.dev и .env.test

### Задача 2: Базовый Backend (Core & Database)

- Инициализировать проект FastAPI с Poetry или requirements.txt
- Настроить pydantic-settings для чтения конфигов из .env
- Настроить асинхронное подключение к Postgres (SQLAlchemy + asyncpg)
- Инициализировать Alembic, настроить его на асинхронную работу
- Написать health-check эндпоинт (GET /api/health), возвращающий `{"status": "ok", "db": "connected"}`

### Задача 3: Перенос БД (Модели)

- Перенести старые модели SQLAlchemy (Сотрудники, Приказы, Отпуска) в новую структуру backend/app/models/
- Сгенерировать первую миграцию Alembic (Initial commit) и применить её к hrms_dev

### Задача 4: Базовый Frontend

- Инициализировать React + TS + Vite проект
- Установить Tailwind и проинициализировать Shadcn UI
- Настроить React Router (создать пустые страницы Dashboard, Employees, Orders) с боковой навигацией (Sidebar)
- Настроить Axios и React Query Provider

### Задача 5: Первая интеграция (Сотрудники)

- Backend: Написать Repository, Service и API эндпоинт GET /api/employees
- Frontend: Написать сущность entities/employee/useEmployees.ts и вывести список в сыром виде на странице Employees
