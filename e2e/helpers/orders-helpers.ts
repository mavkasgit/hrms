import type { OrderTypeName, OrderExtraFields } from '../types'

/**
 * Хелперы для работы с приказами
 * Генерация тестовых данных, заполнение доп. полей
 */

/** Генератор уникального суффикса */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Тестовые данные для разных типов приказов */
export type OrderTestData = {
  employee_name: string
  order_type: OrderTypeName
  order_date: string
  extra_fields: OrderExtraFields
}

/** Создание тестовых данных для приказа "Прием на работу" */
export function makeHireOrderData(employeeName: string): OrderTestData {
  return {
    employee_name,
    order_type: 'Прием на работу',
    order_date: '2024-01-15',
    extra_fields: {
      hire_date: '2024-01-15',
      contract_end: '2025-01-14',
      probation_end: '2024-04-15',
    }
  }
}

/** Создание тестовых данных для приказа "Увольнение" */
export function makeTerminationOrderData(employeeName: string): OrderTestData {
  return {
    employee_name,
    order_type: 'Увольнение',
    order_date: '2024-06-30',
    extra_fields: {
      termination_date: '2024-06-30',
    }
  }
}

/** Создание тестовых данных для приказа "Отпуск трудовой" */
export function makeVacationOrderData(employeeName: string): OrderTestData {
  return {
    employee_name,
    order_type: 'Отпуск трудовой',
    order_date: '2024-06-15',
    extra_fields: {
      vacation_start: '2024-06-20',
      vacation_end: '2024-07-03',
      vacation_days: 14,
    }
  }
}

/** Создание тестовых данных для приказа "Отпуск за свой счет" */
export function makeUnpaidVacationOrderData(employeeName: string): OrderTestData {
  return {
    employee_name,
    order_type: 'Отпуск за свой счет',
    order_date: '2024-05-10',
    extra_fields: {
      vacation_start: '2024-05-15',
      vacation_end: '2024-05-20',
      vacation_days: 6,
    }
  }
}

/** Создание тестовых данных для приказа "Больничный" */
export function makeSickLeaveOrderData(employeeName: string): OrderTestData {
  return {
    employee_name,
    order_type: 'Больничный',
    order_date: '2024-03-01',
    extra_fields: {
      vacation_start: '2024-03-05',
      vacation_end: '2024-03-15',
      vacation_days: 11,
    }
  }
}

/** Создание тестовых данных для приказа "Перевод" */
export function makeTransferOrderData(employeeName: string): OrderTestData {
  return {
    employee_name,
    order_type: 'Перевод',
    order_date: '2024-04-01',
    extra_fields: {
      transfer_date: '2024-04-01',
    }
  }
}

/** Создание тестовых данных для приказа "Продление контракта" */
export function makeContractExtensionOrderData(employeeName: string): OrderTestData {
  return {
    employee_name,
    order_type: 'Продление контракта',
    order_date: '2024-12-01',
    extra_fields: {
      new_contract_end: '2026-01-14',
      new_probation_end: undefined,
    }
  }
}

/** Карта соответствия типа приказа к названиям полей UI */
export const ORDER_FIELD_LABELS: Record<OrderTypeName, Record<string, string>> = {
  'Прием на работу': {
    hire_date: 'Дата приема',
    contract_end: 'Конец контракта',
    probation_end: 'Конец исп. срока',
  },
  'Увольнение': {
    termination_date: 'Дата увольнения',
  },
  'Отпуск трудовой': {
    vacation_start: 'Начало отпуска',
    vacation_end: 'Конец отпуска',
    vacation_days: 'Дней',
  },
  'Отпуск за свой счет': {
    vacation_start: 'Начало отпуска',
    vacation_end: 'Конец отпуска',
    vacation_days: 'Дней',
  },
  'Больничный': {
    vacation_start: 'Начало',
    vacation_end: 'Конец',
    vacation_days: 'Дней',
  },
  'Перевод': {
    transfer_date: 'Дата перевода',
  },
  'Продление контракта': {
    new_contract_end: 'Новая дата конца контракта',
    new_probation_end: 'Конец исп. срока',
  },
}

/** Получение названий полей для типа приказа */
export function getOrderFieldLabels(orderType: OrderTypeName): Record<string, string> {
  return ORDER_FIELD_LABELS[orderType] || {}
}
