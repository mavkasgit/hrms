import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { cn } from "@/shared/utils/cn"

/** Minimum time the save spinner stays visible so the action feels intentional. */
export const MIN_SAVE_VISIBLE_MS = 900

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Run work and always wait until `minMs` has elapsed (success or failure). */
export async function withMinDuration<T>(work: () => Promise<T>, minMs = MIN_SAVE_VISIBLE_MS): Promise<T> {
  const started = Date.now()
  try {
    return await work()
  } finally {
    const elapsed = Date.now() - started
    if (elapsed < minMs) await sleep(minMs - elapsed)
  }
}

export function formatEditorSaveError(err: unknown, fallback = "Не удалось сохранить документ"): string {
  if (err instanceof Error && err.message.trim()) return err.message
  return fallback
}

export function useEditorSaveFeedback() {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savePhase, setSavePhase] = useState<string | null>(null)

  const clearSaveFeedback = () => {
    setSaveError(null)
    setSavePhase(null)
  }

  const beginSave = (phase = "Сохраняем документ…") => {
    setSaveError(null)
    setSavePhase(phase)
  }

  const failSave = (err: unknown, fallback?: string) => {
    setSavePhase(null)
    setSaveError(formatEditorSaveError(err, fallback))
  }

  const succeedSave = () => {
    setSavePhase(null)
    setSaveError(null)
  }

  return {
    saveError,
    savePhase,
    setSaveError,
    setSavePhase,
    clearSaveFeedback,
    beginSave,
    failSave,
    succeedSave,
  }
}

/** Fixed banner at the top of the editor window (errors / in-progress). */
export function EditorSaveBanner({
  error,
  phase,
  className,
}: {
  error: string | null
  phase?: string | null
  className?: string
}) {
  if (error) {
    return (
      <div className={cn("pointer-events-none fixed inset-x-0 top-0 z-[60] p-3", className)}>
        <Alert variant="destructive" className="pointer-events-auto mx-auto max-w-2xl shadow-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ошибка сохранения</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{error}</p>
            <p className="text-xs opacity-90">
              Окно останется открытым — исправьте проблему и повторите. При необходимости нажмите Ctrl+S в
              OnlyOffice, затем снова «Сохранить».
            </p>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (phase) {
    return (
      <div className={cn("pointer-events-none fixed inset-x-0 top-0 z-[60] p-3", className)}>
        <Alert className="pointer-events-auto mx-auto max-w-xl border-emerald-200 bg-emerald-50 text-emerald-950 shadow-lg">
          <AlertTitle>{phase}</AlertTitle>
          <AlertDescription className="text-xs opacity-90">Не закрывайте окно до завершения.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return null
}
