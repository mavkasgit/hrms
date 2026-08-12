/**
 * Публичный API entities/order (#112). Потребители импортируют только через этот barrel.
 * Общие OnlyOffice-типы (OnlyOfficeConfig, DraftSaveStatus, …) — из @/shared/api/onlyoffice-types.
 */

// api.ts
export {
  fetchOrders,
  fetchRecentOrders,
  fetchOrderYears,
  fetchOrderTypes,
  fetchAllOrderTypes,
  createOrderType,
  updateOrderType,
  deleteOrderType,
  fetchTemplateVariables,
  fetchNextOrderNumber,
  updateOrder,
  createOrder,
  createVacationUnpaidGroupOrder,
  createWeekendCallGroupOrder,
  downloadTemplate,
  uploadTemplate,
  bulkUploadTemplates,
  deleteTemplate,
  fetchOrderSettings,
  updateOrderSettings,
  syncOrders,
  deleteOrder,
  getOrderDeletionPreview,
} from "./api"
// draftCommit.ts
export { selectDraftCommit } from "./draftCommit"
export type { CommitDraftResult } from "./draftCommit"
// draftOrderSaveChannel.ts
export {
  DRAFT_ORDER_SAVE_TYPE,
  DRAFT_ORDER_SAVE_CHANNEL,
  isDraftOrderSaveMessage,
  publishDraftOrderSave,
  subscribeDraftOrderSave,
  subscribeAllDraftOrderSaves,
  openDraftEditorWindow,
} from "./draftOrderSaveChannel"
export type { DraftOrderSaveMessage } from "./draftOrderSaveChannel"
// draftSaveStatus.ts
export { DRAFT_SAVE_STATUS_LABEL, DRAFT_SAVE_STATUS_CLASS } from "./draftSaveStatus"
// formDraft.ts
export { ORDER_FORM_DRAFT_KEY, orderFormHasContent } from "./formDraft"
export type { OrderFormDraft } from "./formDraft"
// invalidateOrderQueries.ts
export { invalidateOrderQueries } from "./invalidateOrderQueries"
// onlyofficeApi.ts
export {
  fetchOrderOnlyOfficeConfig,
  forceSaveOrder,
  fetchOrderSaveStatus,
  createOrderDraft,
  fetchDraftOnlyOfficeConfig,
  forceSaveDraft,
  fetchDraftSaveStatus,
  reportDraftSaveError,
  commitOrderDraft,
  fetchTemplateOnlyOfficeConfig,
  forceSaveTemplate,
  deleteOrderDraft,
  createGroupDraft,
  commitGroupDraft,
  fetchOrderDrafts,
} from "./onlyofficeApi"
// onlyofficeTypes.ts (order-специфичные типы; общие — из @/shared/api/onlyoffice-types)
export type {
  OrderDraftResponse,
  CommitOrderDraftResponse,
  GroupDraftResponse,
  DraftListItem,
} from "./onlyofficeTypes"
// orderActions.ts
export { openOrderView, openOrderEdit, openOrderPrint, downloadOrderDocx } from "./orderActions"
// orderTypeBadge.ts
export { ORDER_TYPE_BADGE_COLORS } from "./orderTypeBadge"
// orderTypeLayouts.ts
export { ORDER_TYPE_LAYOUTS, getOrderTypeLayout } from "./orderTypeLayouts"
export type { FieldGroupLayout, OrderTypeLayout } from "./orderTypeLayouts"
// types.ts
export type {
  QuickOption,
  OrderTypeFieldSchema,
  OrderType,
  OrderTypeListResponse,
  Order,
  GroupEmployeeInfo,
  VacationUnpaidGroupEmployeeCreate,
  VacationUnpaidGroupOrderCreate,
  WeekendCallGroupEmployeeCreate,
  WeekendCallGroupOrderCreate,
  GroupOrderCreate,
  OrderListResponse,
  OrdersQueryParams,
  OrderCreate,
  OrderTypeCreate,
  OrderTypeUpdate,
  TemplateVariable,
  TemplateVariablesResponse,
  OrderSettings,
  OrderSyncResponse,
  OrderUpdate,
  OrderDeletionPreview,
} from "./types"
// useDraftCommit.ts
export { useDraftCommit } from "./useDraftCommit"
// useOnlyOffice.ts
export {
  useOrderOnlyOfficeConfig,
  useCreateOrderDraft,
  useDraftOnlyOfficeConfig,
  useCommitOrderDraft,
  useOrderDrafts,
  useDeleteOrderDraft,
  useTemplateOnlyOfficeConfig,
  useCreateGroupDraft,
  useCommitGroupDraft,
} from "./useOnlyOffice"
// useOrders.ts
export {
  useOrders,
  useRecentOrders,
  useOrderYears,
  useOrderTypes,
  useAllOrderTypes,
  useTemplateVariables,
  useNextOrderNumber,
  useUpdateOrder,
  useCreateOrder,
  useCreateOrderType,
  useUpdateOrderType,
  useDeleteOrderType,
  useUploadTemplate,
  useBulkUploadTemplates,
  useDeleteTemplate,
  useSyncOrders,
  useDeleteOrder,
  useOrderDeletionPreview,
  useCreateVacationUnpaidGroupOrder,
  useCreateWeekendCallGroupOrder,
} from "./useOrders"
// waitForOnlyOfficeSave.ts
export { requestAndWaitOnlyOfficeSave } from "./waitForOnlyOfficeSave"
export type { WaitOnlyOfficeSaveResult } from "./waitForOnlyOfficeSave"
// ui/GroupOrderEmployeesRows.tsx
export { GroupOrderEmployeesRows } from "./ui/GroupOrderEmployeesRows"
