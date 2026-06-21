import { Navigate, Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"
import { ToastProvider } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"
import { getUserAccessLevel } from "@/shared/api/axios"

export function Layout() {
  const accessLevel = getUserAccessLevel()

  if (accessLevel === "no_access") {
    localStorage.removeItem("token")
    localStorage.removeItem("ktm2000_token")
    document.cookie = "ktm2000_token=; path=/; max-age=0"
    return <Navigate to="/login" replace />
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
