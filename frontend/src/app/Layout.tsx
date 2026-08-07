import { useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"
import { DraftOrdersNavItem } from "@/features/draft-visibility/DraftOrdersNavItem"
import { ToastProvider, showGlobalToast } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"
import {
  documentEditorSaveToastCopy,
  subscribeDocumentEditorSave,
} from "@/entities/document/documentEditorSaveChannel"
import { getUserAccessLevel } from "@/shared/api/authHost"
import { clearAuthTokens, getToken, setAuthErrorForLogin } from "@/shared/api/client"

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
      if (Boolean(getToken())) {
        setAuthErrorForLogin(
          "Нет доступа к системе. Войдите снова или обратитесь к администратору."
        )
      }
    } catch {
      /* ignore */
    }
    clearAuthTokens()
    return <Navigate to="/login" replace />
  }

  return (
    <ToastProvider>
      <DocumentEditorSaveListener />
      <div className="flex flex-col min-h-screen bg-background">
        <div className="flex flex-1 min-h-0">
          <Sidebar afterNav={<DraftOrdersNavItem />} />
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster />
    </ToastProvider>
  )
}
