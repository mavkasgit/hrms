import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

interface PdfPrintPageProps {
  pdfUrl: string | null
  title: string
  invalidIdMessage: string
}

export function PdfPrintPage({ pdfUrl, title, invalidIdMessage }: PdfPrintPageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoPrintRequested, setAutoPrintRequested] = useState(false)

  useEffect(() => {
    if (!pdfUrl) {
      setError(invalidIdMessage)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    setAutoPrintRequested(false)
  }, [pdfUrl, invalidIdMessage])

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

  const handleFrameError = () => {
    setIsLoading(false)
    setError("Не удалось загрузить PDF")
  }

  useEffect(() => {
    const frame = iframeRef.current
    if (!frame) return
    frame.addEventListener("error", handleFrameError)
    return () => {
      frame.removeEventListener("error", handleFrameError)
    }
  }, [pdfUrl])

  return (
    <div className="h-screen bg-background">
      {isLoading && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded bg-background/90 px-2 py-1 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Подготавливаем PDF...
        </div>
      )}

      {error && <div className="absolute top-3 left-3 z-10 rounded bg-background/90 px-2 py-1 text-sm text-red-600">{error}</div>}

      {!error && pdfUrl && (
        <iframe
          ref={iframeRef}
          title={`Печать: ${title}`}
          src={pdfUrl}
          className="h-full w-full border-0"
          onLoad={handleFrameLoad}
          onError={handleFrameError}
        />
      )}
    </div>
  )
}
