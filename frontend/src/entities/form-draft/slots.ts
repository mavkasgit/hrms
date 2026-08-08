/**
 * Реестр слотов черновиков форм (#28).
 *
 * Единая таблица всех форм создания документов (приказ, уведомление, заявление,
 * отпуска, группы). Каждая форма хранит черновик в своём localStorage-ключе.
 * Модуль не знает про форму — только про метаданные слота: storageKey для
 * автсохранения и label для диалогов восстановления.
 */

export interface FormDraftSlot {
  /** Уникальный таргет формы (используется как идентификатор слота). */
  target: string
  /** Ключ localStorage, под которым хранится черновик формы. */
  storageKey: string
  /** Подпись сущности в родительном падеже для диалогов восстановления. */
  label: string
  /** Маршрут страницы формы: сайдбар навигирует сюда при «Восстановить». */
  route: string
  /**
   * Query-параметр автовосстановления (?recover=1 по умолчанию). Разные слоты
   * одной страницы (одиночная/групповая форма) получают разные параметры, чтобы
   * «Восстановить» из сайдбара не восстанавливал обе формы одновременно.
   */
  recoverParam?: string
}

export const FORM_DRAFT_SLOTS: FormDraftSlot[] = [
  { target: "orders", storageKey: "hrms_order_form_draft", label: "формы приказа", route: "/orders" },
  { target: "orders:general", storageKey: "hrms_order_general_form_draft", label: "формы общего приказа", route: "/orders?tab=general" },
  { target: "notifications", storageKey: "hrms_notification_form_draft", label: "формы уведомления", route: "/orders/notifications" },
  { target: "statements", storageKey: "hrms_statement_form_draft", label: "формы заявления", route: "/orders/statements" },
  { target: "vacations", storageKey: "hrms_vacation_form_draft", label: "формы отпуска", route: "/vacations" },
  { target: "vacations:recall", storageKey: "hrms_vacation_recall_form_draft", label: "формы отзыва из отпуска", route: "/vacations/recall" },
  { target: "vacations:postpone", storageKey: "hrms_vacation_postpone_form_draft", label: "формы переноса отпуска", route: "/vacations/postpone" },
  { target: "vacations:extension", storageKey: "hrms_vacation_extension_form_draft", label: "формы продления отпуска", route: "/vacations/extension" },
  { target: "unpaid-leaves", storageKey: "hrms_unpaid_leave_form_draft", label: "формы отпуска за свой счёт", route: "/unpaid-leaves" },
  { target: "unpaid-leaves:group", storageKey: "hrms_unpaid_leave_group_form_draft", label: "групповой формы отпуска за свой счёт", route: "/unpaid-leaves", recoverParam: "recoverGroup" },
  { target: "weekend-calls", storageKey: "hrms_weekend_call_form_draft", label: "формы вызова в выходной", route: "/weekend-calls" },
  { target: "weekend-calls:group", storageKey: "hrms_weekend_call_group_form_draft", label: "групповой формы вызова в выходной", route: "/weekend-calls", recoverParam: "recoverGroup" },
]

/** URL восстановления слота: страница формы + ?recover=1 (#28). */
export function formDraftRecoverUrl(slot: FormDraftSlot): string {
  const param = slot.recoverParam ?? "recover"
  const sep = slot.route.includes("?") ? "&" : "?"
  return `${slot.route}${sep}${param}=1`
}

/**
 * Слот заполнения формы для текущего маршрута (#87). Чистая функция: по
 * pathname и query определяет, какая форма открыта на этой странице, чтобы
 * попап «Черновики» мог раскрыться и подсветить её строку.
 *
 * Приоритет: 1) слот, чей route-query полностью совпал (orders:general при
 * ?tab=general); 2) слот с нестандартным recoverParam (групповые формы на
 * страницах отсутствий) при соответствующем query; 3) базовый слот маршрута.
 * Возвращает null, если маршруту не соответствует ни один слот.
 */
export function formDraftSlotForRoute(pathname: string, search: string): FormDraftSlot | null {
  const params = new URLSearchParams(search)
  const candidates = FORM_DRAFT_SLOTS.filter((slot) => slot.route.split("?")[0] === pathname)
  if (candidates.length === 0) return null

  for (const slot of candidates) {
    const routeQuery = slot.route.split("?")[1]
    if (!routeQuery) continue
    const routeParams = new URLSearchParams(routeQuery)
    let allMatch = true
    for (const [key, value] of routeParams) {
      if (params.get(key) !== value) {
        allMatch = false
        break
      }
    }
    if (allMatch) return slot
  }

  for (const slot of candidates) {
    if (slot.recoverParam && slot.recoverParam !== "recover" && params.get(slot.recoverParam) === "1") {
      return slot
    }
  }

  return candidates.find((slot) => !slot.route.includes("?")) ?? candidates[0]
}

export interface FormDraftEntry {
  slot: FormDraftSlot
  savedAt: string
}

/**
 * Все локальные черновики форм, найденные в localStorage — единый список
 * для сайдбара (#61). Пропускает слоты без сохранённого черновика.
 */
export function readAllFormDrafts(): FormDraftEntry[] {
  const entries: FormDraftEntry[] = []
  for (const slot of FORM_DRAFT_SLOTS) {
    try {
      const raw = localStorage.getItem(slot.storageKey)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { saved_at?: string }
      if (!parsed?.saved_at) continue
      entries.push({ slot, savedAt: parsed.saved_at })
    } catch {
      continue
    }
  }
  return entries
}

const SLOT_BY_TARGET = new Map(FORM_DRAFT_SLOTS.map((slot) => [slot.target, slot]))

export function getFormDraftSlot(target: string): FormDraftSlot {
  const slot = SLOT_BY_TARGET.get(target)
  if (!slot) throw new Error(`Неизвестный таргет черновика формы: ${target}`)
  return slot
}
