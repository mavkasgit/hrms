import type { QueryClient } from "@tanstack/react-query"
import { getFormDataValue } from "@/entities/draft"
import type { DraftFormData } from "@/entities/draft"
import { hydrateDraftEmployees, toDraftEmployeeRefs } from "@/entities/form-draft"
import {
  useCreateVacationUnpaidGroupOrder,
  useCreateWeekendCallGroupOrder,
} from "@/entities/order/useOrders"
import type { GroupOrderCreate } from "@/entities/order/types"
import {
  calculateVacationEnd,
  daysInclusive,
  toUnpaidLeaveEntries,
  toWeekendCallEntries,
} from "./lib"
import type {
  AbsencePageConfig,
  GroupEmployeeRow,
  GroupFormDraft,
  GroupFormValues,
  SingleFormDraft,
  SingleFormValues,
} from "./types"

// ===== «Отпуск за свой счёт» =====

function unpaidSingleHasContent(state: Omit<SingleFormDraft, "saved_at">): boolean {
  return (
    state.employee_id !== null ||
    state.vacation_start !== "" ||
    state.vacation_end !== "" ||
    state.vacation_days.trim() !== ""
  )
}

function unpaidGroupHasContent(state: Omit<GroupFormDraft, "saved_at">): boolean {
  return state.group_vacation_start !== "" || state.employees.length > 0
}

/**
 * «Заполнить поля» из попапа черновиков: маппинг form-data серверного черновика
 * в черновик групповой формы. Только групповой черновик — иначе null.
 */
function mapUnpaidGroupFillDraft(data: DraftFormData): GroupFormDraft | null {
  if (!data.is_group) return null
  const get = (key: string) => getFormDataValue(data.data, key)
  return {
    order_date: get("date") ?? "",
    order_number: get("number") ?? "",
    mode: "single",
    group_vacation_start: get("vacation_start") ?? "",
    call_date: "",
    call_date_start: "",
    call_date_end: "",
    employees: data.employees ?? [],
    saved_at: new Date().toISOString(),
  }
}

function unpaidSingleValidate(
  values: SingleFormValues,
  orderTypeExists: boolean,
): Record<string, string> {
  const nextErrors: Record<string, string> = {}
  if (!orderTypeExists) nextErrors.orderType = "Тип приказа не найден"
  if (values.employee_id === null) nextErrors.employee = "Выберите сотрудника"
  if (!values.order_date) nextErrors.orderDate = "Укажите дату приказа"
  if (!values.order_number) nextErrors.orderNumber = "Укажите номер приказа"
  if (!values.vacation_start) nextErrors.vacationStart = "Укажите дату начала"
  if (!values.vacation_end) nextErrors.vacationEnd = "Укажите дату окончания"
  if (values.vacation_start && values.vacation_end && values.vacation_end < values.vacation_start) {
    nextErrors.vacationEnd = "Дата окончания раньше даты начала"
  }
  if (!values.vacation_days || Number(values.vacation_days) <= 0) {
    nextErrors.vacationDays = "Укажите количество дней"
  }
  return nextErrors
}

function unpaidSingleExtraFields(values: SingleFormValues): Record<string, string | number | null> {
  return {
    vacation_start: values.vacation_start,
    vacation_end: values.vacation_end,
    vacation_days: Number(values.vacation_days),
  }
}

function unpaidGroupValidate(
  values: GroupFormValues,
  employees: GroupEmployeeRow[],
  orderTypeExists: boolean,
): Record<string, string> {
  const nextErrors: Record<string, string> = {}
  if (!orderTypeExists) nextErrors.orderType = "Тип приказа не найден"
  if (!values.order_date) nextErrors.orderDate = "Укажите дату приказа"
  if (!values.order_number) nextErrors.orderNumber = "Укажите номер приказа"
  if (!values.group_vacation_start) nextErrors.vacationStart = "Укажите дату начала отпуска"
  if (employees.length === 0) nextErrors.employees = "Добавьте хотя бы двух сотрудников"
  if (employees.length === 1) nextErrors.employees = "Для приказа на одного сотрудника используйте одиночную форму"
  for (const emp of employees) {
    if (emp.vacation_days <= 0) {
      nextErrors[`employee_${emp.employee_id}`] = "Количество дней должно быть больше 0"
    }
  }
  return nextErrors
}

function unpaidGroupDraft(values: GroupFormValues, employees: GroupEmployeeRow[]): GroupOrderCreate {
  return {
    order_type_code: "vacation_unpaid_group",
    order_date: values.order_date,
    order_number: values.order_number,
    vacation_start: values.group_vacation_start,
    employees: toDraftEmployeeRefs(employees),
  }
}

async function unpaidHydrateEmployees(
  queryClient: QueryClient,
  employees: { employee_id: number; vacation_days: number }[],
  values: GroupFormValues,
): Promise<GroupEmployeeRow[]> {
  const rows = await hydrateDraftEmployees(queryClient, employees)
  return rows.map((row) => ({
    ...row,
    vacation_end_calculated: values.group_vacation_start
      ? calculateVacationEnd(values.group_vacation_start, row.vacation_days)
      : "",
  }))
}

function unpaidDefaultEmployeeDays(single: SingleFormValues): number {
  return single.vacation_days ? Number(single.vacation_days) : 1
}

// ===== «Вызовы в выходные дни» =====

function weekendCallSingleHasContent(state: Omit<SingleFormDraft, "saved_at">): boolean {
  return (
    state.employee_id !== null ||
    state.call_date !== "" ||
    state.call_date_start !== "" ||
    state.call_date_end !== ""
  )
}

function weekendCallGroupHasContent(state: Omit<GroupFormDraft, "saved_at">): boolean {
  return (
    state.call_date !== "" ||
    state.call_date_start !== "" ||
    state.call_date_end !== "" ||
    state.employees.length > 0
  )
}

function mapWeekendCallGroupFillDraft(data: DraftFormData): GroupFormDraft | null {
  if (!data.is_group) return null
  const get = (key: string) => getFormDataValue(data.data, key)
  const mode = get("mode")
  return {
    order_date: get("date") ?? "",
    order_number: get("number") ?? "",
    mode: mode === "range" || mode === "single" ? mode : "single",
    group_vacation_start: "",
    call_date: get("call_date") ?? "",
    call_date_start: get("call_date_start") ?? "",
    call_date_end: get("call_date_end") ?? "",
    employees: data.employees ?? [],
    saved_at: new Date().toISOString(),
  }
}

function weekendCallSingleValidate(
  values: SingleFormValues,
  orderTypeExists: boolean,
): Record<string, string> {
  const nextErrors: Record<string, string> = {}
  if (!orderTypeExists) nextErrors.orderType = "Тип приказа не найден"
  if (values.employee_id === null) nextErrors.employee = "Выберите сотрудника"
  if (!values.order_date) nextErrors.orderDate = "Укажите дату приказа"
  if (!values.order_number) nextErrors.orderNumber = "Укажите номер приказа"

  if (values.mode === "single") {
    if (!values.call_date) nextErrors.callDate = "Укажите дату вызова"
  } else {
    if (!values.call_date_start) nextErrors.callDateStart = "Укажите дату начала"
    if (!values.call_date_end) nextErrors.callDateEnd = "Укажите дату окончания"
    if (values.call_date_start && values.call_date_end && values.call_date_end < values.call_date_start) {
      nextErrors.callDateEnd = "Дата окончания раньше даты начала"
    }
  }

  return nextErrors
}

function weekendCallSingleExtraFields(
  values: SingleFormValues,
): Record<string, string | number | null> {
  if (values.mode === "single") {
    return { call_date: values.call_date }
  }
  return { call_date_start: values.call_date_start, call_date_end: values.call_date_end }
}

function weekendCallGroupValidate(
  values: GroupFormValues,
  employees: GroupEmployeeRow[],
): Record<string, string> {
  const nextErrors: Record<string, string> = {}
  if (!values.order_date) nextErrors.orderDate = "Укажите дату приказа"
  if (!values.order_number) nextErrors.orderNumber = "Укажите номер приказа"
  if (values.mode === "single" && !values.call_date) nextErrors.callDate = "Укажите дату вызова"
  if (values.mode === "range") {
    if (!values.call_date_start) nextErrors.callDateStart = "Укажите дату начала"
    if (!values.call_date_end) nextErrors.callDateEnd = "Укажите дату окончания"
    if (values.call_date_start && values.call_date_end && values.call_date_end < values.call_date_start) {
      nextErrors.callDateEnd = "Дата окончания раньше даты начала"
    }
  }
  if (employees.length === 0) nextErrors.employees = "Добавьте хотя бы двух сотрудников"
  if (employees.length === 1) nextErrors.employees = "Для приказа на одного сотрудника используйте одиночную форму"
  return nextErrors
}

function weekendCallGroupDraft(
  values: GroupFormValues,
  employees: GroupEmployeeRow[],
): GroupOrderCreate {
  const callDays = values.mode === "single"
    ? 1
    : values.call_date_start && values.call_date_end
      ? daysInclusive(values.call_date_start, values.call_date_end)
      : 1

  return {
    order_type_code: "weekend_call_group",
    order_date: values.order_date,
    order_number: values.order_number,
    mode: values.mode,
    call_date: values.mode === "single" ? values.call_date : undefined,
    call_date_start: values.mode === "range" ? values.call_date_start : undefined,
    call_date_end: values.mode === "range" ? values.call_date_end : undefined,
    employees: employees.map((e) => ({ employee_id: e.employee_id, vacation_days: callDays })),
  }
}

async function weekendHydrateEmployees(
  queryClient: QueryClient,
  employees: { employee_id: number; vacation_days: number }[],
): Promise<GroupEmployeeRow[]> {
  return hydrateDraftEmployees(queryClient, employees)
}

// ===== Конфиги страниц =====

export const unpaidLeavesConfig: AbsencePageConfig = {
  kind: "vacation",
  title: "Отпуск за свой счет",
  orderTypeCode: "vacation_unpaid",
  groupOrderTypeCode: "vacation_unpaid_group",
  emptyStateDescription: "Создайте первый приказ на отпуск за свой счет",
  emptyTableMessage: "Нет отпусков за выбранный период",
  emptyTableDescription: "Измените фильтры периода или сотрудника",
  emptySummaryText: "Нет сотрудников с отпусками за выбранный период",
  fillDraftRoute: "/unpaid-leaves",
  recoverySlot: "unpaid-leaves",
  groupRecoverySlot: "unpaid-leaves:group",
  groupRowsType: "unpaid",
  testids: {
    periodFrom: "unpaid-period-from",
    periodTo: "unpaid-period-to",
    totalOrders: "unpaid-total-orders",
    totalDays: "unpaid-total-days",
    totalLabel: "Всего отпусков за период",
    daysLabel: "Всего дней отпуска",
  },
  useCreateGroupOrder: useCreateVacationUnpaidGroupOrder,
  toEntries: toUnpaidLeaveEntries,
  summarySecondLabel: "Дней отпуска",
  summaryThirdLabel: "Отпусков",
  summaryAlwaysRender: true,
  single: {
    kind: "vacation",
    clearLocalDraftOnCreate: true,
    validate: unpaidSingleValidate,
    buildExtraFields: unpaidSingleExtraFields,
    hasContent: unpaidSingleHasContent,
  },
  group: {
    kind: "vacation",
    createButtonLabel: "Создать приказ",
    requireOrderType: true,
    resetClearsDraftId: false,
    validate: unpaidGroupValidate,
    buildGroupDraft: unpaidGroupDraft,
    hasContent: unpaidGroupHasContent,
    hydrateEmployees: unpaidHydrateEmployees,
    mapFillDraft: mapUnpaidGroupFillDraft,
    defaultEmployeeDays: unpaidDefaultEmployeeDays,
  },
}

export const weekendCallsConfig: AbsencePageConfig = {
  kind: "call",
  title: "Вызовы в выходные дни",
  orderTypeCode: "weekend_call",
  groupOrderTypeCode: "weekend_call_group",
  emptyStateDescription: "Создайте первый приказ на вызов в выходной",
  emptyTableMessage: "Нет вызовов за выбранный период",
  emptyTableDescription: "Измените период или создайте новый приказ",
  emptySummaryText: "Нет сотрудников с вызовами за выбранный период",
  fillDraftRoute: "/weekend-calls",
  recoverySlot: "weekend-calls",
  groupRecoverySlot: "weekend-calls:group",
  groupRowsType: "weekend",
  testids: {
    periodFrom: "weekend-period-from",
    periodTo: "weekend-period-to",
    totalOrders: "weekend-total-calls",
    totalDays: "weekend-total-days",
    totalLabel: "Всего вызовов за период",
    daysLabel: "Всего дней вызова",
  },
  useCreateGroupOrder: useCreateWeekendCallGroupOrder,
  toEntries: toWeekendCallEntries,
  summarySecondLabel: "Вызовов",
  summaryThirdLabel: "Дней вызова",
  summaryAlwaysRender: false,
  single: {
    kind: "call",
    clearLocalDraftOnCreate: false,
    validate: weekendCallSingleValidate,
    buildExtraFields: weekendCallSingleExtraFields,
    hasContent: weekendCallSingleHasContent,
  },
  group: {
    kind: "call",
    createButtonLabel: "Создать групповой приказ",
    requireOrderType: false,
    resetClearsDraftId: true,
    validate: weekendCallGroupValidate,
    buildGroupDraft: weekendCallGroupDraft,
    hasContent: weekendCallGroupHasContent,
    hydrateEmployees: weekendHydrateEmployees,
    mapFillDraft: mapWeekendCallGroupFillDraft,
    defaultEmployeeDays: () => 1,
  },
}
