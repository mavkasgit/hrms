/** Cross-window signal: draft editor → parent form after successful document save. */

export const DRAFT_ORDER_SAVE_TYPE = "hrms:draft-order-save" as const
export const DRAFT_ORDER_SAVE_CHANNEL = "hrms-order-draft-save"

/** Ignore duplicate deliveries of the same draft save within this window (ms). */
const DEDUPE_WINDOW_MS = 5_000

export type DraftOrderSaveMessage = {
  type: typeof DRAFT_ORDER_SAVE_TYPE
  draftId: string
  openPrint?: boolean
  printWindowName?: string
}

export function isDraftOrderSaveMessage(data: unknown): data is DraftOrderSaveMessage {
  if (!data || typeof data !== "object") return false
  const msg = data as DraftOrderSaveMessage
  return msg.type === DRAFT_ORDER_SAVE_TYPE && typeof msg.draftId === "string" && msg.draftId.length > 0
}

/**
 * Notify parent about draft save.
 *
 * Prefer a single transport to avoid double commit:
 * - opener postMessage when available
 * - BroadcastChannel only as fallback (no opener / noopener)
 */
export function publishDraftOrderSave(message: Omit<DraftOrderSaveMessage, "type"> & { type?: string }) {
  const payload: DraftOrderSaveMessage = {
    type: DRAFT_ORDER_SAVE_TYPE,
    draftId: message.draftId,
    openPrint: message.openPrint,
    printWindowName: message.printWindowName,
  }

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(payload, window.location.origin)
      return
    } catch (err) {
      console.warn("[draftOrderSaveChannel] postMessage failed, falling back to BroadcastChannel", err)
    }
  }

  try {
    const channel = new BroadcastChannel(DRAFT_ORDER_SAVE_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch (err) {
    console.warn("[draftOrderSaveChannel] BroadcastChannel failed", err)
  }
}

/**
 * Общая реализация подписки на сохранение черновика приказа (транспорт
 * postMessage→BroadcastChannel + дедупликация по draftId).
 *
 * `matches` фильтрует сообщения; `null` означает «слушать все». Дедуп ключуется
 * по `draftId`, поэтому разные черновики, сохранённые подряд, не теряются.
 */
function subscribeDraftOrderSaves(
  matches: ((message: DraftOrderSaveMessage) => boolean) | null,
  handler: (message: DraftOrderSaveMessage) => void
): () => void {
  // Время последней обработки по каждому draftId (postMessage+BC, HMR, double-click).
  const lastHandledByDraft = new Map<string, number>()

  const handlePayload = (data: unknown) => {
    if (!isDraftOrderSaveMessage(data)) return
    if (matches && !matches(data)) return

    const now = Date.now()
    const last = lastHandledByDraft.get(data.draftId) ?? 0
    if (now - last < DEDUPE_WINDOW_MS) {
      console.warn(
        "[draftOrderSaveChannel] ignored duplicate draft save signal",
        data.draftId,
      )
      return
    }
    lastHandledByDraft.set(data.draftId, now)
    handler(data)
  }

  const onWindowMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    handlePayload(event.data)
  }

  window.addEventListener("message", onWindowMessage)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(DRAFT_ORDER_SAVE_CHANNEL)
    channel.onmessage = (event) => handlePayload(event.data)
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener("message", onWindowMessage)
    channel?.close()
  }
}

/**
 * Listen for draft save from editor window, filtered by expectedDraftId.
 * `null`/`undefined` — noop (контракт страниц: без активного черновика не слушаем).
 * Dedupes identical draftId events (postMessage+BC, HMR double handlers, double-click).
 */
export function subscribeDraftOrderSave(
  expectedDraftId: string | null | undefined,
  handler: (message: DraftOrderSaveMessage) => void
): () => void {
  if (!expectedDraftId) return () => {}
  return subscribeDraftOrderSaves(
    (message) => message.draftId === expectedDraftId,
    handler
  )
}

/**
 * Listen for ALL draft saves from any editor window (глобальный слушатель в Layout).
 * Та же реализация транспорта и дедупа, что и `subscribeDraftOrderSave`.
 */
export function subscribeAllDraftOrderSaves(
  handler: (message: DraftOrderSaveMessage) => void
): () => void {
  return subscribeDraftOrderSaves(null, handler)
}

/** Open draft OnlyOffice editor; keep opener when possible (no noopener on fallback). */
export function openDraftEditorWindow(url: string): Window | null {
  const editorWindow = window.open("about:blank", "_blank")
  if (editorWindow && !editorWindow.closed) {
    editorWindow.location.href = url
    return editorWindow
  }
  // Without noopener so draft editor can postMessage to opener if browser allows.
  return window.open(url, "_blank")
}
