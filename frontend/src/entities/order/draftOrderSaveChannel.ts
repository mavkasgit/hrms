/** Cross-window signal: draft editor → parent form after successful document save. */

export const DRAFT_ORDER_SAVE_TYPE = "hrms:draft-order-save" as const
export const DRAFT_ORDER_SAVE_CHANNEL = "hrms-order-draft-save"

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

/** Notify parent via postMessage (if opener) and BroadcastChannel (fallback without opener). */
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
    } catch (err) {
      console.warn("[draftOrderSaveChannel] postMessage failed", err)
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
 */
export function subscribeDraftOrderSave(
  expectedDraftId: string | null | undefined,
  handler: (message: DraftOrderSaveMessage) => void
): () => void {
  if (!expectedDraftId) return () => {}

  const handlePayload = (data: unknown) => {
    if (!isDraftOrderSaveMessage(data)) return
    if (data.draftId !== expectedDraftId) return
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
