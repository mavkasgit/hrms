/** Cross-window navigation for print placeholder (survives opener/COOP quirks). */

export const PRINT_NAV_CHANNEL = "hrms-print-navigate"
export const PRINT_NAV_TYPE = "hrms:print-navigate" as const

const DEFAULT_PLACEHOLDER_TIMEOUT_MS = 60_000

export type PrintNavigateMessage = {
  type: typeof PRINT_NAV_TYPE
  windowName: string
  url?: string
  error?: string
}

export function isPrintNavigateMessage(data: unknown): data is PrintNavigateMessage {
  if (!data || typeof data !== "object") return false
  const msg = data as PrintNavigateMessage
  return msg.type === PRINT_NAV_TYPE && typeof msg.windowName === "string" && msg.windowName.length > 0
}

/** Tell a named print placeholder to go to URL or show an error. */
export function publishPrintNavigate(message: Omit<PrintNavigateMessage, "type">): void {
  const payload: PrintNavigateMessage = {
    type: PRINT_NAV_TYPE,
    windowName: message.windowName,
    url: message.url,
    error: message.error,
  }

  try {
    const channel = new BroadcastChannel(PRINT_NAV_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch (err) {
    console.warn("[print-window] BroadcastChannel failed", err)
  }

  // Fallback: classic named-window navigation (same browser profile)
  if (payload.url) {
    try {
      window.open(payload.url, payload.windowName)
    } catch (err) {
      console.warn("[print-window] window.open navigate failed", err)
    }
  }
}

export function failPrintPlaceholder(windowName: string | undefined, error: string): void {
  if (!windowName) return
  publishPrintNavigate({ windowName, error })
}

export function navigatePrintPlaceholder(windowName: string | undefined, url: string): void {
  if (!windowName) {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  publishPrintNavigate({ windowName, url })
}

interface OpenPrintPlaceholderWindowOptions {
  windowName: string
  savedEntityLabel: string
  logPrefix: string
  /** Max wait for save/commit before showing error in placeholder (ms). */
  timeoutMs?: number
}

/**
 * Open a spinner placeholder that waits for BroadcastChannel (or named window.open)
 * to navigate to the real print page.
 */
export function openPrintPlaceholderWindow({
  windowName,
  savedEntityLabel,
  logPrefix,
  timeoutMs = DEFAULT_PLACEHOLDER_TIMEOUT_MS,
}: OpenPrintPlaceholderWindowOptions): string | undefined {
  const printWindow = window.open("about:blank", windowName)
  if (!printWindow) return undefined

  try {
    const safeLabel = JSON.stringify(savedEntityLabel)
    const safeName = JSON.stringify(windowName)
    const channelName = JSON.stringify(PRINT_NAV_CHANNEL)
    const msgType = JSON.stringify(PRINT_NAV_TYPE)

    printWindow.document.open()
    printWindow.document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Подготовка печати</title>
  <style>
    @keyframes spin { to { transform: rotate(360deg); } }
    html, body { margin: 0; height: 100%; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
    }
    .box { text-align: center; max-width: 28rem; padding: 1.5rem; }
    .spin {
      width: 28px; height: 28px;
      border: 3px solid #cbd5e1; border-top-color: #0ea5e9;
      border-radius: 50%; margin: 0 auto 12px;
      animation: spin 0.9s linear infinite;
    }
    .title { font-size: 16px; font-weight: 600; }
    .sub { font-size: 13px; color: #475569; margin-top: 6px; line-height: 1.4; }
    .err .title { color: #b91c1c; }
    .err .spin { display: none; }
  </style>
</head>
<body>
  <div class="box" id="root">
    <div class="spin" id="spin"></div>
    <div class="title" id="title">Подготавливаем страницу печати...</div>
    <div class="sub" id="sub">Окно автоматически обновится после сохранения ${savedEntityLabel.replace(/[<>&]/g, "")}</div>
  </div>
  <script>
    (function () {
      var windowName = ${safeName};
      var label = ${safeLabel};
      var channelName = ${channelName};
      var msgType = ${msgType};
      var timeoutMs = ${Number(timeoutMs) || DEFAULT_PLACEHOLDER_TIMEOUT_MS};
      var done = false;

      function showError(message) {
        if (done) return;
        done = true;
        var root = document.getElementById("root");
        if (root) root.className = "box err";
        var title = document.getElementById("title");
        var sub = document.getElementById("sub");
        if (title) title.textContent = "Не удалось открыть печать";
        if (sub) sub.textContent = message || ("Сохранение " + label + " не завершилось. Закройте окно и повторите.");
      }

      function go(url) {
        if (done || !url) return;
        done = true;
        window.location.replace(url);
      }

      function onPayload(data) {
        if (!data || data.type !== msgType || data.windowName !== windowName) return;
        if (data.error) {
          showError(String(data.error));
          return;
        }
        if (data.url) go(String(data.url));
      }

      try {
        var ch = new BroadcastChannel(channelName);
        ch.onmessage = function (event) { onPayload(event.data); };
      } catch (e) {
        console.warn("BroadcastChannel unavailable", e);
      }

      window.addEventListener("message", function (event) {
        if (event.origin !== window.location.origin) return;
        onPayload(event.data);
      });

      window.setTimeout(function () {
        showError(
          "Истекло время ожидания сохранения " + label +
          ". Закройте окно, сохраните документ ещё раз или откройте печать из списка."
        );
      }, timeoutMs);
    })();
  </script>
</body>
</html>`)
    printWindow.document.close()
  } catch (error) {
    console.warn(`${logPrefix} failed to render print placeholder`, error)
  }

  return windowName
}

export function openPrintWindow(url: string, windowName?: string) {
  if (windowName) {
    navigatePrintPlaceholder(windowName, url)
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}
