import { Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"

export function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
