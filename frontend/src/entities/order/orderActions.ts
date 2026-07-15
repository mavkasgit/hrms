import { navigatePrintPlaceholder } from "@/shared/utils/print-window"

/** Keep opener so editor can postMessage success back to the list page. */
function openEditorWindow(url: string): Window | null {
  const editorWindow = window.open("about:blank", "_blank")
  if (editorWindow && !editorWindow.closed) {
    editorWindow.location.href = url
    return editorWindow
  }
  return window.open(url, "_blank")
}

export function openOrderView(orderId: number) {
  return openEditorWindow(`/orders/${orderId}/view-docx`)
}

export function openOrderEdit(orderId: number) {
  return openEditorWindow(`/orders/${orderId}/edit-docx`)
}

export function openOrderPrint(orderId: number, target = "_blank") {
  const url = `/orders/${orderId}/print`
  if (target === "_blank") {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  // Named target = print placeholder from editor (BroadcastChannel + window.open fallback)
  navigatePrintPlaceholder(target, url)
}

export function downloadOrderDocx(orderId: number) {
  window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/download`, "_blank")
}
