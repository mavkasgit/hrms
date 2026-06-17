import { Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"
import { ToastProvider } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"
import { getUserAccessLevel } from "@/shared/api/axios"
import { NoAccessPage } from "@/pages/NoAccessPage"

export function Layout() {
  const accessLevel = getUserAccessLevel()

  if (accessLevel === "no_access") {
    return (
      <ToastProvider>
        <NoAccessPage />
        <Toaster />
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
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
