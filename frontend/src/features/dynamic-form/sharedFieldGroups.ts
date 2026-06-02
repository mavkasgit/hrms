import type { FieldSchema } from "@/features/dynamic-form/components/FieldRenderer"

/** Quick option для date-полей */
export type QuickOption = {
  label: string
  years?: number
  months?: number
  unit?: "years" | "months"
}

/**
 * Переиспользуемые группы полей для layout конфигов.
 * Используются во всех трёх типах документов: приказы, уведомления, заявления.
 */

// ── Contract fields ──────────────────────────────────────────────

/**
 * Поля предыдущего контракта: начало, конец, номер.
 */
export function oldContractFields(overrides: { required?: boolean } = {}): FieldSchema[] {
  const req = overrides.required ?? false
  return [
    { key: "old_contract_start", label: "Начало", type: "date", required: req, enabled: true },
    { key: "old_contract_end", label: "Конец", type: "date", required: req, enabled: true },
    { key: "old_contract_number", label: "Номер", type: "text", required: false, enabled: true },
  ]
}

/**
 * Поля нового контракта: начало, конец, номер, срок (лет).
 */
export function newContractFields(overrides: { required?: boolean } = {}): (FieldSchema & { quickOptions?: QuickOption[] })[] {
  const req = overrides.required ?? false
  return [
    { key: "new_contract_start", label: "Начало", type: "date", required: req, enabled: true },
    { key: "new_contract_end", label: "Конец", type: "date", required: req, enabled: true },
    { key: "new_contract_number", label: "Номер", type: "text", required: false, enabled: true },
    { key: "new_contract_years", label: "Срок (лет)", type: "number", required: false, enabled: true, quickOptions: newContractYearsQuickOptions },
  ]
}

/**
 * Поля старого контракта с полными лейблами (для уведомлений).
 */
export function oldContractFieldsFull(overrides: { required?: boolean } = {}): FieldSchema[] {
  const req = overrides.required ?? false
  return [
    { key: "old_contract_start", label: "Дата начала предыдущего контракта", type: "date", required: req },
    { key: "old_contract_end", label: "Дата окончания предыдущего контракта", type: "date", required: req },
    { key: "old_contract_number", label: "Номер предыдущего контракта", type: "text", required: false },
  ]
}

/**
 * Поля нового контракта с полными лейблами (для уведомлений).
 */
export function newContractFieldsFull(overrides: { required?: boolean } = {}): FieldSchema[] {
  const req = overrides.required ?? false
  return [
    { key: "new_contract_start", label: "Дата начала нового контракта", type: "date", required: req },
    { key: "new_contract_end", label: "Новая дата конца контракта", type: "date", required: req },
    { key: "new_contract_number", label: "Номер нового контракта", type: "text", required: false },
    { key: "new_contract_years", label: "Срок продления (лет)", type: "number", required: false },
  ]
}

// ── Vacation fields ──────────────────────────────────────────────

/**
 * Поля периода отпуска: начало, конец, дни.
 */
export function vacationPeriodFields(overrides: { required?: boolean } = {}): FieldSchema[] {
  const req = overrides.required ?? true
  return [
    { key: "vacation_start", label: "Дата начала", type: "date", required: req, enabled: true },
    { key: "vacation_end", label: "Дата окончания", type: "date", required: req, enabled: true },
    { key: "vacation_days", label: "Количество дней", type: "number", required: req, enabled: true },
  ]
}

/**
 * Поля старого отпуска (для отзыва/переноса).
 */
export function oldVacationFields(overrides: { required?: boolean } = {}): FieldSchema[] {
  const req = overrides.required ?? true
  return [
    { key: "old_vacation_start", label: "Дата начала отпуска", type: "date", required: req, enabled: true },
    { key: "old_vacation_end", label: "Дата окончания отпуска", type: "date", required: req, enabled: true },
    { key: "old_vacation_days", label: "Количество дней отпуска", type: "number", required: req, enabled: true },
  ]
}

// ── Date range fields ────────────────────────────────────────────

/**
 * Пара дат: начало и конец с кастомными лейблами.
 */
export function dateRangeFields(startLabel: string, endLabel: string, overrides: { required?: boolean } = {}): FieldSchema[] {
  const req = overrides.required ?? true
  return [
    { key: "start_date", label: startLabel, type: "date", required: req, enabled: true },
    { key: "end_date", label: endLabel, type: "date", required: req, enabled: true },
  ]
}

// ── Quick options ────────────────────────────────────────────────

export const contractEndQuickOptions: QuickOption[] = [
  { label: "1 год", years: 1, unit: "years" },
  { label: "2 года", years: 2, unit: "years" },
  { label: "3 года", years: 3, unit: "years" },
]

export const trialEndQuickOptions: QuickOption[] = [
  { label: "2 мес", months: 2, unit: "months" },
  { label: "3 мес", months: 3, unit: "months" },
]

export const newContractYearsQuickOptions: QuickOption[] = [
  { label: "1 год", years: 1, unit: "years" },
  { label: "2 года", years: 2, unit: "years" },
  { label: "3 года", years: 3, unit: "years" },
]
