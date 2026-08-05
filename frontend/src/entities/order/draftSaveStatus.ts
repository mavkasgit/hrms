import type { DraftSaveStatus } from "./onlyofficeTypes"

export const DRAFT_SAVE_STATUS_LABEL: Record<DraftSaveStatus["state"], string> = {
  saved: "Сохранён",
  error: "Ошибка сохранения",
  never: "Не сохранялся",
}

export const DRAFT_SAVE_STATUS_CLASS: Record<DraftSaveStatus["state"], string> = {
  saved: "bg-green-100 text-green-800 border-green-200",
  error: "bg-red-100 text-red-800 border-red-200",
  never: "bg-muted text-muted-foreground border-border",
}
