import { useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Sidebar } from "@/shared/ui/sidebar"
import { DraftOrdersNavItem } from "@/features/draft-visibility"
import { ToastProvider, showGlobalToast } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"
import {
  documentEditorSaveToastCopy,
  subscribeDocumentEditorSave,
} from "@/entities/document/documentEditorSaveChannel"
import { subscribeAllDraftOrderSaves } from "@/entities/order"
import { invalidateOrderQueries } from "@/entities/order"
import { getUserAccessLevel } from "@/shared/api/authHost"
import { clearAuthTokens, getToken, setAuthErrorForLogin } from "@/shared/api/client"

/**
 * Единая точка обработки сигналов сохранения из окон OnlyOffice-редакторов:
 * тост + инвалидация кэшей по сущности. Редактор коммитит документ в своём окне,
 * поэтому инвалидация обязана жить здесь, а не в мутациях родительской страницы.
 */
function EditorSaveSynchronizer() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribeDocument = subscribeDocumentEditorSave((message) => {
      const copy = documentEditorSaveToastCopy(message)
      showGlobalToast({
        title: copy.title,
        description: copy.description,
        variant: "success",
      })
      if (message.entity === "order") {
        invalidateOrderQueries(queryClient)
      } else if (message.entity === "notification") {
        queryClient.invalidateQueries({ queryKey: ["notifications"], exact: false })
        queryClient.invalidateQueries({ queryKey: ["next-notification-number"] })
      } else if (message.entity === "statement") {
        queryClient.invalidateQueries({ queryKey: ["statements"], exact: false })
        queryClient.invalidateQueries({ queryKey: ["next-statement-number"] })
      }
    })

    const unsubscribeDraft = subscribeAllDraftOrderSaves(() => {
      invalidateOrderQueries(queryClient)
    })

    return () => {
      unsubscribeDocument()
      unsubscribeDraft()
    }
  }, [queryClient])

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
      <EditorSaveSynchronizer />
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
