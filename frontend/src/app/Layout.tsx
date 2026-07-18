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
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </ToastProvider>
  )
}
