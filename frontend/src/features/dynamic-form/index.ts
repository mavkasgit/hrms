// Components
export { FieldGroup } from "./components/FieldGroup"
export { QuickOptions } from "./components/QuickOptions"
export { FieldRenderer, type FieldSchema } from "./components/FieldRenderer"

// Hooks
export { useDateCalc } from "./hooks/useDateCalc"
export { useAutoFillFields } from "./hooks/useAutoFill"

// Layouts
export { HireOrderFields } from "./layouts/HireOrderFields"
export { ContractExtensionFields } from "./layouts/ContractExtensionFields"
export { NotificationContractExtensionFields } from "./layouts/NotificationContractExtensionFields"
export { StatementContractExpiryFields } from "./layouts/StatementContractExpiryFields"
export { TransferFields } from "./layouts/TransferFields"

// Shared field groups
export {
  oldContractFields,
  newContractFields,
  oldContractFieldsFull,
  newContractFieldsFull,
  vacationPeriodFields,
  oldVacationFields,
  dateRangeFields,
  contractEndQuickOptions,
  trialEndQuickOptions,
} from "./sharedFieldGroups"
