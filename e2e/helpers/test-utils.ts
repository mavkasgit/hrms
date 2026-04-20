/**
 * Общие утилиты для e2e тестов
 * Централизованные функции, используемые across all test files
 */

/**
 * Генератор уникального идентификатора
 * Использует timestamp + random suffix для уникальности в рамках тестового прогона
 */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/**
 * Генератор уникальных тестовых данных сотрудника
 * Создает полный набор данных для создания сотрудника через UI
 */
export function makeEmployeeData() {
  const u = uid()
  return {
    name: `Тест-Сотрудник-${u}`,
    position: `Тест-Должность-${u}`,
    department: `Тест-Отдел-${u}`,
    gender: 'М' as const,
    birth_date: '15.05.1990',
    hire_date: '15.01.2024',
    contract_start: '15.01.2024',
    contract_end: '14.01.2025',
    tab_number: Math.floor(100000 + Math.random() * 900000),
    rate: 25.5,
    personal_number: `ЛН-${u.toUpperCase()}`,
    insurance_number: `СН-${u.toUpperCase()}`,
    passport_number: `AB${Math.floor(1000000 + Math.random() * 9000000)}`,
    citizenship: true,
    residency: true,
    pensioner: false,
    payment_form: 'Повременная' as const,
  }
}

/**
 * Генератор данных для отпуска
 */
export function makeVacationData(overrides: {
  employee_id?: number
  start_date?: string
  end_date?: string
  vacation_type?: 'Трудовой' | 'За свой счет'
  order_date?: string
} = {}) {
  return {
    employee_id: overrides.employee_id || 0,
    start_date: overrides.start_date || '2024-06-01',
    end_date: overrides.end_date || '2024-06-14',
    vacation_type: overrides.vacation_type || 'Трудовой',
    order_date: overrides.order_date || '2024-05-25',
  }
}

/**
 * Генератор данных для приказа
 */
export function makeOrderData(overrides: {
  employee_id?: number
  order_type_code?: string
  order_date?: string
  order_number?: string
} = {}) {
  return {
    employee_id: overrides.employee_id || 0,
    order_type_code: overrides.order_type_code || 'transfer',
    order_date: overrides.order_date || '2024-06-15',
    order_number: overrides.order_number || `ORD-${uid().slice(0, 8).toUpperCase()}`,
  }
}

/**
 * Форматирование даты для API (DD.MM.YYYY -> YYYY-MM-DD)
 */
export function formatDateForApi(dateStr: string): string {
  const [day, month, year] = dateStr.split('.')
  return `${year}-${month}-${day}`
}

/**
 * Форматирование даты для UI (YYYY-MM-DD -> DD.MM.YYYY)
 */
export function formatDateForUi(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}.${month}.${year}`
}

/**
 * Ожидание с проверкой условия (polling)
 * Предпочтительнее использовать встроенные механизмы Playwright,
 * но полезно для специфических случаев
 */
export async function waitForCondition<T>(
  condition: () => Promise<T>,
  options: {
    timeout?: number
    interval?: number
    message?: string
  } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100, message = 'Condition not met' } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition()
      if (result) return result
    } catch {
      // Игнорируем ошибки во время polling
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(`${message} (timeout: ${timeout}ms)`)
}
