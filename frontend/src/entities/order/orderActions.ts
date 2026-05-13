export function openOrderView(orderId: number) {
  window.open(`/orders/${orderId}/view-docx`, "_blank", "noopener,noreferrer")
}

export function openOrderEdit(orderId: number) {
  window.open(`/orders/${orderId}/edit-docx`, "_blank", "noopener,noreferrer")
}

export function openOrderPrint(orderId: number, target = "_blank") {
  const url = `/orders/${orderId}/print`
  if (target === "_blank") {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  window.open(url, target)
}

export function downloadOrderDocx(orderId: number) {
  window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/download`, "_blank")
}
