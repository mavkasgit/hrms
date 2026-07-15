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
 * Listen for draft save from editor window.
 * Prefer matching expectedDraftId when provided.
 * Dedupes identical draftId events (postMessage+BC, HMR double handlers, double-click).
 */
export function subscribeDraftOrderSave(
  expectedDraftId: string | null | undefined,
  handler: (message: DraftOrderSaveMessage) => void
): () => void {
  if (!expectedDraftId) return () => {}

  let lastHandledAt = 0
  let handling = false

  const handlePayload = (data: unknown) => {
    if (!isDraftOrderSaveMessage(data)) return
    if (data.draftId !== expectedDraftId) return

    const now = Date.now()
    if (handling || now - lastHandledAt < DEDUPE_WINDOW_MS) {
      console.warn(
        "[draftOrderSaveChannel] ignored duplicate draft save signal",
        data.draftId,
      )
      return
    }
    handling = true
    lastHandledAt = now
    try {
      handler(data)
    } finally {
      // Keep dedupe window; allow next real save only after DEDUPE_WINDOW_MS
      window.setTimeout(() => {
        handling = false
      }, DEDUPE_WINDOW_MS)
    }
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
