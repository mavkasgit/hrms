import { Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"
import { ToastProvider } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"

export function Layout() {
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
