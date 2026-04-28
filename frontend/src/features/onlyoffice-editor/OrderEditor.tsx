import { useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import type { OnlyOfficeConfig } from "@/entities/order/onlyofficeTypes"

const ONLYOFFICE_SCRIPT_ID = "onlyoffice-api-script"

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
    script.onerror = () => reject(new Error("Не удалось загрузить OnlyOffice API"))
    document.body.appendChild(script)
  })
}

interface OrderEditorProps {
  config: OnlyOfficeConfig | undefined
  isLoading: boolean
  error: Error | null
  title?: string
}

export function OrderEditor({ config, isLoading, error, title }: OrderEditorProps) {
  const editorInstanceRef = useRef<any>(null)
  const editorIdRef = useRef(`onlyoffice-editor-${Math.random().toString(36).slice(2)}`)
  const [scriptError, setScriptError] = useState<string | null>(null)

  useEffect(() => {
    if (!config) return
    let cancelled = false
    setScriptError(null)

    const scriptUrl = `${config.documentServerUrl.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`
    loadOnlyOfficeScript(scriptUrl)
      .then(() => {
        if (cancelled) return
        const DocsAPI = (window as any).DocsAPI
        if (!DocsAPI) {
          setScriptError("OnlyOffice API не найден после загрузки скрипта")
          return
        }
        editorInstanceRef.current?.destroyEditor?.()
        editorInstanceRef.current = new DocsAPI.DocEditor(editorIdRef.current, config)
      })
      .catch((err) => {
        if (!cancelled) setScriptError(err instanceof Error ? err.message : "Ошибка загрузки OnlyOffice")
      })

    return () => {
      cancelled = true
      editorInstanceRef.current?.destroyEditor?.()
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

  const message = scriptError || error?.message
  if (message) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {title && <h1 className="mb-2 text-xl font-bold">{title}</h1>}
      <div id={editorIdRef.current} className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background" />
    </div>
  )
}
