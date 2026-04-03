import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { useEmployeeAuditLog } from "@/entities/employee/useEmployees"
import type { EmployeeAuditLog } from "@/entities/employee/types"

const actionLabels: Record<string, string> = {
  created: "Создан",
  updated: "Обновлён",
  archived: "Архивирован",
  restored: "Восстановлен",
  deleted: "Удалён (soft)",
  hard_deleted: "Удалён (навсегда)",
}

const actionColors: Record<string, string> = {
  created: "bg-green-100 text-green-800",
  updated: "bg-blue-100 text-blue-800",
  archived: "bg-yellow-100 text-yellow-800",
  restored: "bg-purple-100 text-purple-800",
  deleted: "bg-red-100 text-red-800",
  hard_deleted: "bg-red-200 text-red-900",
}

interface EmployeeAuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: number
  name: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ru-RU")
}

function renderChangedFields(changed_fields: EmployeeAuditLog["changed_fields"]) {
  if (!changed_fields) return null
  return (
    <div className="mt-2 space-y-1 text-xs">
      {Object.entries(changed_fields).map(([field, values]) => (
        <div key={field} className="flex gap-2">
          <span className="font-medium text-muted-foreground">{field}:</span>
          <span className="text-red-600 line-through">{values.old}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-green-600">{values.new}</span>
        </div>
      ))}
    </div>
  )
}

export function EmployeeAuditDialog({ open, onOpenChange, employeeId, name }: EmployeeAuditDialogProps) {
  const { data: logs, isLoading } = useEmployeeAuditLog(employeeId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>История изменений</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh] space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Загрузка...</p>}
          {!isLoading && (!logs || logs.length === 0) && (
            <p className="text-sm text-muted-foreground">Нет записей</p>
          )}
          {logs &&
            logs.map((log) => (
              <div key={log.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionColors[log.action] || "bg-gray-100"}`}>
                    {actionLabels[log.action] || log.action}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(log.performed_at)}</span>
                </div>
                {log.performed_by && (
                  <p className="text-xs text-muted-foreground mt-1">Кем: {log.performed_by}</p>
                )}
                {log.reason && (
                  <p className="text-xs text-muted-foreground mt-1">Причина: {log.reason}</p>
                )}
                {renderChangedFields(log.changed_fields)}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
