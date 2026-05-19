interface OpenPrintPlaceholderWindowOptions {
  windowName: string
  savedEntityLabel: string
  logPrefix: string
}

export function openPrintPlaceholderWindow({ windowName, savedEntityLabel, logPrefix }: OpenPrintPlaceholderWindowOptions): string | undefined {
  const printWindow = window.open("about:blank", windowName)
  if (!printWindow) return undefined

  try {
    printWindow.document.title = "Подготовка печати"
    printWindow.document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
        <div style="text-align:center;">
          <div style="width:28px;height:28px;border:3px solid #cbd5e1;border-top-color:#0ea5e9;border-radius:50%;margin:0 auto 12px;animation:spin 0.9s linear infinite;"></div>
          <div style="font-size:16px;font-weight:600;">Подготавливаем страницу печати...</div>
          <div style="font-size:13px;color:#475569;margin-top:6px;">Окно автоматически обновится после сохранения ${savedEntityLabel}</div>
        </div>
      </div>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        html, body { margin: 0; }
      </style>
    `
  } catch (error) {
    console.warn(`${logPrefix} failed to render print placeholder`, error)
  }

  return windowName
}

export function openPrintWindow(url: string, windowName?: string) {
  if (windowName) {
    window.open(url, windowName)
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}
