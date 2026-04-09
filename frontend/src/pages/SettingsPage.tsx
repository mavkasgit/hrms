import { useNavigate } from "react-router-dom"
import { FileText, Calendar, ArrowRight } from "lucide-react"
import { Button } from "@/shared/ui/button"

export function SettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Настройки</h1>

      <div className="grid gap-4 max-w-2xl">
        <div 
          className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
          onClick={() => navigate("/settings/holidays")}
        >
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-md bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1 flex items-center gap-2">
                Праздники
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Управление праздничными днями. Добавление, удаление и автозаполнение праздников РБ.
              </p>
            </div>
          </div>
        </div>

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
