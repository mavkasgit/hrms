/** Cross-window signal: document editor → parent after successful save. */

export const DOCUMENT_EDITOR_SAVE_TYPE = "hrms:document-editor-save" as const
export const DOCUMENT_EDITOR_SAVE_CHANNEL = "hrms-document-editor-save"

export type DocumentEditorEntity =
  | "order"
  | "notification"
  | "statement"
  | "template"
  | "document"

export type DocumentEditorSaveMessage = {
  type: typeof DOCUMENT_EDITOR_SAVE_TYPE
  entity: DocumentEditorEntity
  id: number | string
  title?: string
}

export function isDocumentEditorSaveMessage(data: unknown): data is DocumentEditorSaveMessage {
  if (!data || typeof data !== "object") return false
  const msg = data as DocumentEditorSaveMessage
  return (
    msg.type === DOCUMENT_EDITOR_SAVE_TYPE &&
    typeof msg.entity === "string" &&
    (typeof msg.id === "number" || typeof msg.id === "string")
  )
}

/**
 * Notify parent about document save.
 * Prefer a single transport (opener postMessage, else BroadcastChannel) to avoid double toasts.
 */
export function publishDocumentEditorSave(
  message: Omit<DocumentEditorSaveMessage, "type">,
): void {
  const payload: DocumentEditorSaveMessage = {
    type: DOCUMENT_EDITOR_SAVE_TYPE,
    entity: message.entity,
    id: message.id,
    title: message.title,
  }

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(payload, window.location.origin)
      return
    } catch (err) {
      console.warn("[documentEditorSaveChannel] postMessage failed, falling back to BroadcastChannel", err)
    }
  }

  try {
    const channel = new BroadcastChannel(DOCUMENT_EDITOR_SAVE_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch (err) {
    console.warn("[documentEditorSaveChannel] BroadcastChannel failed", err)
  }
}

const TOAST_DEDUPE_MS = 3_000
const recentToastKeys = new Map<string, number>()

export function subscribeDocumentEditorSave(
  handler: (message: DocumentEditorSaveMessage) => void,
): () => void {
  const handlePayload = (data: unknown) => {
    if (!isDocumentEditorSaveMessage(data)) return
    const key = `${data.entity}:${data.id}`
    const now = Date.now()
    const last = recentToastKeys.get(key) ?? 0
    if (now - last < TOAST_DEDUPE_MS) return
    recentToastKeys.set(key, now)
    handler(data)
  }

  const onWindowMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    handlePayload(event.data)
  }

  window.addEventListener("message", onWindowMessage)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(DOCUMENT_EDITOR_SAVE_CHANNEL)
    channel.onmessage = (event) => handlePayload(event.data)
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener("message", onWindowMessage)
    channel?.close()
  }
}

const ENTITY_TOAST_TITLE: Record<DocumentEditorEntity, string> = {
  order: "Документ приказа сохранён",
  notification: "Документ уведомления сохранён",
  statement: "Документ заявления сохранён",
  template: "Шаблон сохранён",
  document: "Документ сохранён",
}

export function documentEditorSaveToastCopy(message: DocumentEditorSaveMessage): {
  title: string
  description?: string
} {
  return {
    title: ENTITY_TOAST_TITLE[message.entity] ?? "Документ сохранён",
    description: message.title ?? (message.id != null ? `ID: ${message.id}` : undefined),
  }
}
