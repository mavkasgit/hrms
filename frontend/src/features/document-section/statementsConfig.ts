import type { DocumentSectionConfig } from "./DocumentSection"
import {
  useStatements,
  useCreateStatementDraft,
  useDeleteStatement,
  useDeleteStatementDocument,
  useStatementTypes,
  useNextStatementNumber,
} from "@/entities/statement/hooks"
import { openStatementView, openStatementEdit, openStatementPrint, downloadStatementDocx } from "@/entities/statement/api"
import type { Statement, StatementCreate, StatementType } from "@/entities/statement/types"
import { getStatementTypeLayout } from "@/entities/statement/statementTypeLayouts"
import { getFormDataExtraFields, getFormDataInt, getFormDataValue } from "@/entities/draft"
import type { DraftFormData } from "@/entities/draft"

interface StatementFormDraft {
  employee_id: number | null
  statement_type_id: number | null
  statement_date: string
  statement_number: string
  extra_fields: Record<string, string | number>
  saved_at: string
}

function statementHasContent(state: Omit<StatementFormDraft, "saved_at">): boolean {
  return (
    state.employee_id !== null ||
    state.statement_type_id !== null ||
    Object.values(state.extra_fields).some((v) => v !== "" && v !== null && v !== undefined)
  )
}

/** «Заполнить поля» из попапа черновиков: маппинг form-data серверного черновика. */
function mapStatementFillDraft(data: DraftFormData): StatementFormDraft | null {
  if (data.kind !== "statement") return null
  return {
    employee_id: getFormDataInt(data.data, "employee_id"),
    statement_type_id: getFormDataInt(data.data, "statement_type_id"),
    statement_date: getFormDataValue(data.data, "date") || new Date().toISOString().split("T")[0],
    statement_number: getFormDataValue(data.data, "number") || "",
    extra_fields: getFormDataExtraFields(data.data, ["employee_id", "statement_type_id", "number", "date"]),
    saved_at: new Date().toISOString(),
  }
}

export const statementsConfig: DocumentSectionConfig<
  Statement,
  StatementType,
  StatementCreate,
  { draft_id: string; statement_id: number },
  StatementFormDraft
> = {
  kind: "statement",
  slot: "statements",
  fillDraftRoute: "/orders/statements",
  editorWindowPrefix: "hrms-statement-editor-",

  labels: {
    createHeading: "Создать заявление",
    createButton: "Создать заявление",
    dateLabel: "Дата заявления",
    numberLabel: "Номер заявления",
    typeLabel: "Тип заявления",
    emptyListMessage: "Заявления не найдены",
    emptyListDescription: "Создайте первое заявление или измените фильтры",
    emptyListLabel: "Заявлений пока нет",
    popoverTitle: "Последние заявления",
    deleteTitle: "Удалить заявление?",
    editorNote: "заявления",
    titlePrefix: "Заявление",
  },

  useList: (filters) =>
    useStatements({
      page: filters.page,
      per_page: filters.per_page,
      number: filters.number,
      date_from: filters.date_from,
      date_to: filters.date_to,
      employee_id: filters.employee_id,
      statement_type_id: filters.typeId,
    }),
  useTypes: (activeOnly) => useStatementTypes(activeOnly),
  useCreateDraft: () => useCreateStatementDraft(),
  useDelete: () => useDeleteStatement(),
  useDeleteDocument: () => useDeleteStatementDocument(),
  useNextNumber: () => useNextStatementNumber(),
  useRecentItems: () => useStatements({ page: 1, per_page: 100 }),

  openView: openStatementView,
  openEdit: openStatementEdit,
  openPrint: openStatementPrint,
  downloadDocx: downloadStatementDocx,
  getTypeLayout: getStatementTypeLayout,
  typeNameOf: (item) => item.statement_type_name,
  editDraftUrl: (draft) => `/statements/${draft.statement_id}/edit-docx`,
  buildCreatePayload: ({ title, number, date, employeeId, typeId, extraFields }) => ({
    title,
    number,
    date,
    employee_id: employeeId,
    statement_type_id: typeId,
    extra_fields: extraFields,
  }),

  mapFillDraft: mapStatementFillDraft,
  draft: {
    hasContent: statementHasContent,
    fromValues: (values) => ({
      employee_id: values.employee_id,
      statement_type_id: values.type_id,
      statement_date: values.date,
      statement_number: values.number,
      extra_fields: values.extra_fields,
    }),
    toValues: (draft) => ({
      employee_id: draft.employee_id,
      type_id: draft.statement_type_id,
      date: draft.statement_date,
      number: draft.statement_number,
      extra_fields: draft.extra_fields,
    }),
  },
}
