import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"

export function OrderPrintPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = id ? Number.parseInt(id, 10) : NaN
  const pdfUrl = Number.isFinite(orderId)
    ? `${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/print-pdf`
    : null
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoPrintRequested, setAutoPrintRequested] = useState(false)

  useEffect(() => {
    if (!pdfUrl) {
      setError("Некорректный ID приказа")
      setIsLoading(false)
    } else {
      setIsLoading(true)
      setError(null)
    }
  }, [pdfUrl])

  const triggerPrint = () => {
    const frameWindow = iframeRef.current?.contentWindow
    if (frameWindow) {
      frameWindow.focus()
      frameWindow.print()
      return
    }
    window.print()
  }

  const handleFrameLoad = () => {
    setIsLoading(false)
    if (autoPrintRequested) return
    setAutoPrintRequested(true)
    setTimeout(() => {
      triggerPrint()
    }, 150)
  }

  return (
    <div className="h-screen bg-background">
      {isLoading && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 text-sm text-muted-foreground bg-background/90 px-2 py-1 rounded">
          <Loader2 className="h-4 w-4 animate-spin" />
          Подготавливаем PDF...
        </div>
      )}

      {error && <div className="absolute top-3 left-3 z-10 text-sm text-red-600 bg-background/90 px-2 py-1 rounded">{error}</div>}

      {!error && pdfUrl && (
        <iframe
          ref={iframeRef}
          title={`Печать приказа ${orderId}`}
          src={pdfUrl}
          className="w-full h-full border-0"
          onLoad={handleFrameLoad}
          onError={() => {
            setIsLoading(false)
            setError("Не удалось загрузить PDF")
          }}
        />
      )}
    </div>
  )
}
