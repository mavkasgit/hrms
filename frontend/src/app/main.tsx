import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "react-router-dom"
import { router } from "./Router"
import { ErrorBoundary } from "./ErrorBoundary"
import { applyTheme, readStoredTheme } from "@/shared/lib/profile-prefs"
import "./index.css"

// Применяем тему до рендера: localStorage — быстрый фолбэк, чтобы не мигала
// светлая тема. Актуальную тему из IdP подтянет Sidebar после /auth/me.
applyTheme(readStoredTheme())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
