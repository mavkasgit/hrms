/**
 * Хелперы для работы с приказами
 * Генерация тестовых данных, заполнение доп. полей
 */
/** Генератор уникального суффикса */
export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
/** Создание тестовых данных для приказа "Прием на работу" */
export function makeHireOrderData(employeeName) {
    return {
        employee_name,
        order_type: 'Прием на работу',
        order_date: '2024-01-15',
        extra_fields: {
            hire_date: '2024-01-15',
            contract_end: '2025-01-14',
            trial_end: '2024-04-15',
        }
    };
}
/** Создание тестовых данных для приказа "Увольнение" */
export function makeTerminationOrderData(employeeName) {
    return {
        employee_name,
        order_type: 'Увольнение',
        order_date: '2024-06-30',
        extra_fields: {
            termination_date: '2024-06-30',
        }
    };
}
/** Создание тестовых данных для приказа "Отпуск трудовой" */
export function makeVacationOrderData(employeeName) {
    return {
        employee_name,
        order_type: 'Отпуск трудовой',
        order_date: '2024-06-15',
        extra_fields: {
            vacation_start: '2024-06-20',
            vacation_end: '2024-07-03',
            vacation_days: 14,
        }
    };
}
/** Создание тестовых данных для приказа "Отпуск за свой счет" */
export function makeUnpaidVacationOrderData(employeeName) {
    return {
        employee_name,
        order_type: 'Отпуск за свой счет',
        order_date: '2024-05-10',
        extra_fields: {
            vacation_start: '2024-05-15',
            vacation_end: '2024-05-20',
            vacation_days: 6,
        }
    };
}
/** Создание тестовых данных для приказа "Больничный" */
export function makeSickLeaveOrderData(employeeName) {
    return {
        employee_name,
        order_type: 'Больничный',
        order_date: '2024-03-01',
        extra_fields: {
            vacation_start: '2024-03-05',
            vacation_end: '2024-03-15',
            vacation_days: 11,
        }
    };
}
/** Создание тестовых данных для приказа "Перевод" */
export function makeTransferOrderData(employeeName) {
    return {
        employee_name,
        order_type: 'Перевод',
        order_date: '2024-04-01',
        extra_fields: {
            transfer_date: '2024-04-01',
        }
    };
}
/** Создание тестовых данных для приказа "Продление контракта" */
export function makeContractExtensionOrderData(employeeName) {
    return {
        employee_name,
        order_type: 'Продление контракта',
        order_date: '2024-12-01',
        extra_fields: {
            contract_new_end: '2026-01-14',
            trial_end: undefined,
        }
    };
}
/** Карта соответствия типа приказа к названиям полей UI */
export const ORDER_FIELD_LABELS = {
    'Прием на работу': {
        hire_date: 'Дата приема',
        contract_end: 'Конец контракта',
        trial_end: 'Конец испытательного срока',
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
        contract_new_end: 'Новая дата конца контракта',
        trial_end: 'Конец испытательного срока',
    },
};
/** Получение названий полей для типа приказа */
export function getOrderFieldLabels(orderType) {
    return ORDER_FIELD_LABELS[orderType] || {};
}
