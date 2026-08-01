import { useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"
import { ToastProvider, showGlobalToast } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"
import {
  documentEditorSaveToastCopy,
  subscribeDocumentEditorSave,
} from "@/entities/document/documentEditorSaveChannel"
import {
  getUserAccessLevel,
  isBreakGlassUser,
  AUTH_ERROR_STORAGE_KEY,
} from "@/shared/api/axios"

/** Toast on parent list page when OnlyOffice editor window reports successful save. */
function DocumentEditorSaveListener() {
  useEffect(() => {
    return subscribeDocumentEditorSave((message) => {
      const copy = documentEditorSaveToastCopy(message)
      showGlobalToast({
        title: copy.title,
        description: copy.description,
        variant: "success",
      })
    })
  }, [])
  return null
}

export function Layout() {
  const accessLevel = getUserAccessLevel()
  const isBreakGlass = isBreakGlassUser()

  if (accessLevel === "no_access") {
    // Сохраняем причину, если токен был, но доступ «no_access» (битый JWT / нет claim).
    try {
      const hadToken = Boolean(localStorage.getItem("token"))
      if (hadToken) {
        sessionStorage.setItem(
          AUTH_ERROR_STORAGE_KEY,
          "Нет доступа к системе. Войдите снова или обратитесь к администратору."
        )
      }
    } catch {
      /* ignore */
    }
    localStorage.removeItem("token")
    return <Navigate to="/login" replace />
  }

  return (
    <ToastProvider>
      <DocumentEditorSaveListener />
      <div className="flex flex-col min-h-screen bg-background">
        {isBreakGlass && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 px-4 py-2 text-xs flex items-center justify-between font-medium z-50">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>
                <strong>Аварийный вход (Break Glass):</strong> Вы авторизованы с правами администратора. Связь с Authentik или базой данных PostgreSQL может быть ограничена.
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster />
    </ToastProvider>
  )
}
