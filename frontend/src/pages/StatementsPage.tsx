import { useNavigate } from "react-router-dom"
import { Settings } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { StatementsSection } from "@/features/statements-section/StatementsSection"

export function StatementsPage() {
  const navigate = useNavigate()

  const handleTabsChange = (value: string) => {
    if (value === "all") {
      navigate("/orders")
      return
    }
    if (value === "general") {
      navigate("/orders?tab=general")
      return
    }
    if (value === "notifications") {
      navigate("/orders/notifications")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Заявления</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/templates")}>
            <Settings className="mr-2 h-4 w-4" />
            Типы и шаблоны
          </Button>
        </div>
      </div>

      <div className="border rounded-lg bg-card">
        <div className="px-4 py-3 border-b">
          <Tabs value="statements" onValueChange={handleTabsChange}>
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
              <TabsTrigger className="shrink-0" value="all">Все приказы</TabsTrigger>
              <TabsTrigger className="shrink-0" value="general">По основной деятельности</TabsTrigger>
              <TabsTrigger className="shrink-0" value="notifications">Уведомления</TabsTrigger>
              <TabsTrigger className="shrink-0" value="statements">Заявления</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <StatementsSection />
    </div>
  )
}
