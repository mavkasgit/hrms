import { useEffect, useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import type { OnlyOfficeConfig } from "@/shared/api/onlyoffice-types"

const ONLYOFFICE_SCRIPT_ID = "onlyoffice-api-script"
/** Мягкий хинт «Загрузка редактора…» показывается только после этого таймаута. */
const EDITOR_HINT_TIMEOUT_MS = 20_000
/** Если редактор не готов и за это время — считаем загрузку проваленной (жёсткая ошибка). */
const EDITOR_READY_TIMEOUT_MS = 60_000
/** Длительность fade-in/fade-out анимации хинта. */
const HINT_FADE_MS = 300

const LOAD_HINT =
  "Частая причина — блокировщик рекламы (uBlock, AdBlock и т.п.): отключите его для этого сайта или добавьте в исключения, затем обновите страницу. Также проверьте, что Document Server (OnlyOffice) запущен и доступен."

function loadOnlyOfficeScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(ONLYOFFICE_SCRIPT_ID) as HTMLScriptElement | null
    if (existing?.src === url) {
      if ((window as any).DocsAPI) resolve()
      else existing.addEventListener("load", () => resolve(), { once: true })
      return
    }
    existing?.remove()

    const script = document.createElement("script")
    script.id = ONLYOFFICE_SCRIPT_ID
    script.src = url
    script.async = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(
        new Error(
          "Не удалось загрузить OnlyOffice API (скрипт api.js). " + LOAD_HINT,
        ),
      )
    document.body.appendChild(script)
  })
}

interface OrderEditorProps {
  config: OnlyOfficeConfig | undefined
  isLoading: boolean
  error: Error | null
  title?: string
  /** true после onDocumentReady, false при ошибке/ожидании */
  onReadyChange?: (ready: boolean) => void
}

function extractUiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null
  const errorObj = error as {
    message?: string
    response?: { data?: { detail?: string; message?: string } }
  }
  return errorObj.response?.data?.detail || errorObj.response?.data?.message || errorObj.message || null
}

type DocsApiEvents = {
  onDocumentReady?: () => void
  onError?: (event: { data?: string | number }) => void
  [key: string]: unknown
}

export function OrderEditor({ config, isLoading, error, title, onReadyChange }: OrderEditorProps) {
  const editorInstanceRef = useRef<{ destroyEditor?: () => void } | null>(null)
  const editorIdRef = useRef(`onlyoffice-editor-${Math.random().toString(36).slice(2)}`)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [showLoadHint, setShowLoadHint] = useState(false)
  const [hintLeaving, setHintLeaving] = useState(false)
  const onReadyChangeRef = useRef(onReadyChange)
  onReadyChangeRef.current = onReadyChange

  useEffect(() => {
    if (!config) return
    let cancelled = false
    let hintTimer: ReturnType<typeof setTimeout> | undefined
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    setScriptError(null)
    setShowLoadHint(false)
    setHintLeaving(false)
    onReadyChangeRef.current?.(false)

    // Мягкий хинт — показываем через 20с с начала загрузки, если редактор ещё грузится.
    hintTimer = setTimeout(() => {
      if (!cancelled) setShowLoadHint(true)
    }, EDITOR_HINT_TIMEOUT_MS)

    // Жёсткая ошибка — если редактор не открылся за 60с с начала загрузки.
    readyTimer = setTimeout(() => {
      markFailed(
        `Редактор не открылся за ${EDITOR_READY_TIMEOUT_MS / 1000} секунд. ` + LOAD_HINT,
      )
    }, EDITOR_READY_TIMEOUT_MS)

    const clearTimers = () => {
      if (hintTimer) clearTimeout(hintTimer)
      if (readyTimer) clearTimeout(readyTimer)
      if (fadeTimer) clearTimeout(fadeTimer)
      hintTimer = undefined
      readyTimer = undefined
      fadeTimer = undefined
    }

    const hideHint = () => {
      if (fadeTimer) return
      setHintLeaving(true)
      fadeTimer = setTimeout(() => {
        if (cancelled) return
        setShowLoadHint(false)
        setHintLeaving(false)
        fadeTimer = undefined
      }, HINT_FADE_MS)
    }

    const markReady = () => {
      if (cancelled) return
      clearTimers()
      hideHint()
      setScriptError(null)
      onReadyChangeRef.current?.(true)
    }

    const markFailed = (message: string) => {
      if (cancelled) return
      clearTimers()
      hideHint()
      setScriptError(message)
      onReadyChangeRef.current?.(false)
      try {
        editorInstanceRef.current?.destroyEditor?.()
      } catch {
        /* ignore */
      }
      editorInstanceRef.current = null
    }

    const serverBase = config.documentServerUrl
    const scriptUrl = `${serverBase.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`
    loadOnlyOfficeScript(scriptUrl)
      .then(() => {
        if (cancelled) return
        const DocsAPI = (window as any).DocsAPI
        if (!DocsAPI) {
          markFailed("OnlyOffice API не найден после загрузки скрипта. " + LOAD_HINT)
          return
        }

        const prevEvents = ((config as OnlyOfficeConfig & { events?: DocsApiEvents }).events ??
          {}) as DocsApiEvents

        const editorConfig = {
          ...config,
          events: {
            ...prevEvents,
            onDocumentReady: () => {
              prevEvents.onDocumentReady?.()
              markReady()
            },
            onError: (event: { data?: string | number }) => {
              prevEvents.onError?.(event)
              const code = event?.data != null ? String(event.data) : "unknown"
              markFailed(
                `Ошибка OnlyOffice (код ${code}). Редактор не открылся. ${LOAD_HINT}`,
              )
            },
          },
        }

        editorInstanceRef.current?.destroyEditor?.()
        editorInstanceRef.current = new DocsAPI.DocEditor(editorIdRef.current, editorConfig)
      })
      .catch((err) => {
        markFailed(err instanceof Error ? err.message : "Ошибка загрузки OnlyOffice. " + LOAD_HINT)
      })

    return () => {
      cancelled = true
      clearTimers()
      onReadyChangeRef.current?.(false)
      try {
        editorInstanceRef.current?.destroyEditor?.()
      } catch {
        /* ignore */
      }
      editorInstanceRef.current = null
    }
  }, [config])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-[72vh] w-full" />
      </div>
    )
  }

  const apiMessage = extractUiErrorMessage(error)
  if (apiMessage && !config) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Не удалось получить конфиг редактора</AlertTitle>
        <AlertDescription>{apiMessage}</AlertDescription>
      </Alert>
    )
  }

  if (scriptError) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Редактор документа не загрузился</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{scriptError}</p>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {title && <h1 className="mb-2 text-xl font-bold">{title}</h1>}
      {showLoadHint && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-10 z-10 mx-auto max-w-xl px-4 duration-300 ${
            hintLeaving
              ? "animate-out fade-out zoom-out-95"
              : "animate-in fade-in zoom-in-95"
          }`}
        >
          <Alert>
            <AlertTitle>Загрузка редактора…</AlertTitle>
            <AlertDescription>
              Редактор загружается дольше обычного. Если экран остаётся пустым, отключите
              блокировщик рекламы для этого сайта и обновите страницу, либо проверьте, что
              Document Server доступен.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <div
        id={editorIdRef.current}
        className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background"
      />
    </div>
  )
}
