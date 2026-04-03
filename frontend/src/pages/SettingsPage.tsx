import { useNavigate } from "react-router-dom"
import { FileText } from "lucide-react"
import { Button } from "@/shared/ui/button"

export function SettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Настройки</h1>

      <div className="grid gap-4 max-w-2xl">
        <div className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-md bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Шаблоны приказов</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Управление шаблонами документов для создания приказов. Загрузка, редактирование и удаление шаблонов.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/templates")}
              >
                Открыть
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
