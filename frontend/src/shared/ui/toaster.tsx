import { X, CheckCircle, AlertCircle } from "lucide-react"
import { useToast } from "./use-toast"

export function Toaster() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.variant === "success"
        const isDestructive = toast.variant === "destructive"
        return (
          <div
            key={toast.id}
            className={`
              pointer-events-auto
              min-w-[300px] max-w-[400px]
              rounded-lg border shadow-lg p-4
              flex items-start gap-3
              animate-in slide-in-from-right fade-in duration-300
              ${isSuccess ? "bg-green-50 border-green-200 text-green-900" : ""}
              ${isDestructive ? "bg-red-50 border-red-200 text-red-900" : ""}
              ${!isSuccess && !isDestructive ? "bg-background border-border text-foreground" : ""}
            `}
          >
            {isSuccess && <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />}
            {isDestructive && <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && (
                <p className="text-xs mt-1 opacity-90">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
