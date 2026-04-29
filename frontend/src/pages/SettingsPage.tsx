import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Calendar, ArrowRight, ScrollText, Database } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { GlobalAuditLog } from "@/features/global-audit-log"

export function SettingsPage() {
  const navigate = useNavigate()
  const [auditLogOpen, setAuditLogOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Настройки</h1>
        <Button variant="outline" onClick={() => setAuditLogOpen(true)}>
          <ScrollText className="mr-2 h-4 w-4" />
          Общий журнал
        </Button>
      </div>

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

        <div
          className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
          onClick={() => navigate("/settings/backups")}
        >
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-md bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1 flex items-center gap-2">
                Бэкапы БД
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Ручное создание бэкапов базы данных, их скачивание, просмотр содержимого и восстановление.
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

      <GlobalAuditLog open={auditLogOpen} onOpenChange={setAuditLogOpen} />
    </div>
  )
}
