import type { QueryClient } from "@tanstack/react-query"
import type { DraftFormData } from "@/entities/draft"
import type { Employee } from "@/entities/employee/types"
import type { GroupOrderCreate, Order } from "@/entities/order/types"

export type CallMode = "single" | "range"
export type AbsenceKind = "vacation" | "call"
export type GroupRowsType = "unpaid" | "weekend"

export interface AbsenceRange {
  start: string
  end: string
}

export interface AbsenceEntry {
  orderId: number
  employeeName: string
  range: AbsenceRange
  explicitDays: number | null
}

export interface GroupEmployeeRow {
  employee_id: number
  vacation_days: number
  employee: Employee
  vacation_end_calculated?: string
}

/**
 * Значения одиночной формы. Ключи — snake_case: это формат черновика localStorage,
 * сохранённого предыдущими версиями страниц (unpaid / weekend), чтобы старые
 * черновики продолжали восстанавливаться. Активные поля задаёт kind конфига.
 */
export interface SingleFormValues {
  employee_id: number | null
  order_date: string
  order_number: string
  mode: CallMode
  vacation_start: string
  vacation_end: string
  vacation_days: string
  call_date: string
  call_date_start: string
  call_date_end: string
}

export interface SingleFormDraft extends SingleFormValues {
  saved_at: string
}

/** Значения групповой формы (snake_case — формат сохранённых черновиков). */
export interface GroupFormValues {
  order_date: string
  order_number: string
  mode: CallMode
  group_vacation_start: string
  call_date: string
  call_date_start: string
  call_date_end: string
}

export interface GroupFormDraft extends GroupFormValues {
  employees: { employee_id: number; vacation_days: number }[]
  saved_at: string
}

export interface SingleFormConfig {
  kind: AbsenceKind
  /**
   * Сбросить локальный черновик формы сразу после создания серверного черновика.
   * «Отпуск за свой счёт» — да; «Вызовы в выходные» исторически — нет.
   */
  clearLocalDraftOnCreate: boolean
  validate: (values: SingleFormValues, orderTypeExists: boolean) => Record<string, string>
  buildExtraFields: (values: SingleFormValues) => Record<string, string | number | null>
  hasContent: (values: Omit<SingleFormDraft, "saved_at">) => boolean
}

export interface GroupFormConfig {
  kind: AbsenceKind
  /** Текст кнопки «Создать …» в групповой форме. */
  createButtonLabel: string
  /** Требуется ли тип приказа для создания группового приказа. */
  requireOrderType: boolean
  /** Сбрасывать ли groupDraftId при «Очистить» групповой формы. */
  resetClearsDraftId: boolean
  validate: (
    values: GroupFormValues,
    employees: GroupEmployeeRow[],
    orderTypeExists: boolean,
  ) => Record<string, string>
  buildGroupDraft: (values: GroupFormValues, employees: GroupEmployeeRow[]) => GroupOrderCreate
  hasContent: (values: Omit<GroupFormDraft, "saved_at">) => boolean
  hydrateEmployees: (
    queryClient: QueryClient,
    employees: { employee_id: number; vacation_days: number }[],
    values: GroupFormValues,
  ) => Promise<GroupEmployeeRow[]>
  mapFillDraft: (data: DraftFormData) => GroupFormDraft | null
  defaultEmployeeDays: (single: SingleFormValues) => number
}

/** Часть состояния мутации, что реально используется в каркасе (ошибки/загрузка). */
export interface MutationUiState {
  isPending: boolean
  isError: boolean
  error: unknown
}

export interface SummaryDisplayRow {
  name: string
  second: number
  third: number
}

export interface AbsencePageTestids {
  periodFrom: string
  periodTo: string
  totalOrders: string
  totalDays: string
  totalLabel: string
  daysLabel: string
}

export interface AbsencePageConfig {
  kind: AbsenceKind
  title: string
  orderTypeCode: string
  groupOrderTypeCode: string
  emptyStateDescription: string
  emptyTableMessage: string
  emptyTableDescription: string
  emptySummaryText: string
  fillDraftRoute: string
  recoverySlot: string
  groupRecoverySlot: string
  groupRowsType: GroupRowsType
  testids: AbsencePageTestids
  useCreateGroupOrder: () => MutationUiState
  toEntries: (order: Order) => AbsenceEntry[]
  summarySecondLabel: string
  summaryThirdLabel: string
  /** Показывать сводную таблицу даже без данных (unpaid) или только с данными (weekend). */
  summaryAlwaysRender: boolean
  /**
   * Рендерить диалоги перезаписи черновика только для активной вкладки формы
   * (unpaid) или всегда (weekend) — историческое поведение страниц.
   */
  renderOverwriteDialogsByMode: boolean
  single: SingleFormConfig
  group: GroupFormConfig
}
