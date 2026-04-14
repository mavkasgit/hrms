import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { useQuery } from "@tanstack/react-query"
import apiInstance from "@/shared/api/axios"

interface AuditLogItem {
  timestamp: string
  level: string
  action: string
  employee_id: number | null
  employee_name: string | null
  message: string
}

const actionLabels: Record<string, string> = {
  created: "Создан",
  updated: "Обновлён",
  archived: "Архивирован",
  restored: "Восстановлен",
  deleted: "Удалён",
  hard_deleted: "Удалён навсегда",
  vacation_created: "Отпуск создан",
  vacation_updated: "Отпуск обновлён",
  vacation_deleted: "Отпуск удалён",
  order_created: "Приказ создан",
  order_deleted: "Приказ удалён",
  import: "Импорт сотрудников",
  department_created: "Подразделение создано",
  department_updated: "Подразделение обновлено",
  department_deleted: "Подразделение удалено",
  position_created: "Должность создана",
  position_updated: "Должность обновлена",
  position_deleted: "Должность удалена",
}

const actionColors: Record<string, string> = {
  created: "bg-green-100 text-green-800",
  updated: "bg-blue-100 text-blue-800",
  archived: "bg-yellow-100 text-yellow-800",
  restored: "bg-purple-100 text-purple-800",
  deleted: "bg-red-100 text-red-800",
  hard_deleted: "bg-red-200 text-red-900",
  vacation_created: "bg-cyan-100 text-cyan-800",
  vacation_updated: "bg-cyan-100 text-cyan-800",
  vacation_deleted: "bg-red-100 text-red-800",
  order_created: "bg-indigo-100 text-indigo-800",
  order_deleted: "bg-red-100 text-red-800",
  import: "bg-orange-100 text-orange-800",
  department_created: "bg-emerald-100 text-emerald-800",
  department_updated: "bg-emerald-100 text-emerald-800",
  department_deleted: "bg-red-100 text-red-800",
  position_created: "bg-teal-100 text-teal-800",
  position_updated: "bg-teal-100 text-teal-800",
  position_deleted: "bg-red-100 text-red-800",
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Извлекает ключевые данные из сообщения лога */
function extractSummary(message: string): string {
  // employee_id=X, name=YYY → YYY
  const nameMatch = message.match(/name=([^,\s]+)/)
  // tab_number=X
  const tabMatch = message.match(/tab_number=(\d+)/)
  // start=X, end=Y
  const startMatch = message.match(/start=([^,\s]+)/)
  const endMatch = message.match(/end=([^,\s]+)/)
  // number=X
  const numMatch = message.match(/number=([^,\s]+)/)
  // file=X
  const fileMatch = message.match(/file=([^,\s]+)/)
  // created=X, updated=X
  const createdMatch = message.match(/created=(\d+)/)
  const updatedMatch = message.match(/updated=(\d+)/)

  const parts: string[] = []
  if (nameMatch) parts.push(nameMatch[1])
  if (tabMatch) parts.push(`таб. ${tabMatch[1]}`)
  if (startMatch && endMatch) parts.push(`${startMatch[1]} → ${endMatch[1]}`)
  if (numMatch) parts.push(`№${numMatch[1]}`)
  if (fileMatch) parts.push(fileMatch[1])
  if (createdMatch) parts.push(`+${createdMatch[1]}`)
  if (updatedMatch) parts.push(`~${updatedMatch[1]}`)

  return parts.length > 0 ? parts.join(", ") : message.slice(0, 80)
}

interface DetailDialogProps {
  log: AuditLogItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DetailDialog({ log, open, onOpenChange }: DetailDialogProps) {
  if (!log) return null

  const parseMessage = (msg: string) => {
    const fields: Record<string, string> = {}
    const pairs = msg.split(", ")
    for (const pair of pairs) {
      const eqIdx = pair.indexOf("=")
      if (eqIdx > 0) {
        const key = pair.slice(0, eqIdx).trim()
        const val = pair.slice(eqIdx + 1).trim()
        fields[key] = val
      }
    }
    return fields
  }

  const details = parseMessage(log.message)
  const skipKeys = new Set(["action", "user_id", "employee_id", "employee_name"])
  const displayFields = Object.entries(details).filter(([k]) => !skipKeys.has(k))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className={actionColors[log.action] || "bg-gray-100 text-gray-800"}>
              {actionLabels[log.action] || log.action}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</span>
          </div>
          <DialogTitle className="mt-2">
            {log.employee_name || log.message.slice(0, 60)}
          </DialogTitle>
          <DialogDescription>
            ID: {log.employee_id ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto max-h-[50vh]">
          {displayFields.length === 0 && (
            <p className="text-sm text-muted-foreground">{log.message}</p>
          )}
          {displayFields.map(([key, value]) => (
            <div key={key} className="flex gap-2 items-start text-sm">
              <span className="font-medium text-muted-foreground min-w-[140px] capitalize">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="text-foreground break-all">{value}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface GlobalAuditLogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialActionFilter?: string
}

export function GlobalAuditLog({ open, onOpenChange, initialActionFilter }: GlobalAuditLogProps) {
  const [searchName, setSearchName] = useState("")
  const [filterAction, setFilterAction] = useState<string | undefined>(undefined)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(0)
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const limit = 50

  // При открытии применяем начальный фильтр
  useEffect(() => {
    if (open) {
      setFilterAction(initialActionFilter)
      setPage(0)
      setSearchName("")
      setDateFrom("")
      setDateTo("")
    }
  }, [open, initialActionFilter])

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log-all", page, filterAction, searchName, dateFrom, dateTo],
    queryFn: () => {
      // Конвертируем DD.MM.YYYY → YYYY-MM-DD для API
      const toApiDate = (d: string) => {
        if (!d) return undefined
        const parts = d.split(".")
        if (parts.length !== 3) return undefined
        return `${parts[2]}-${parts[1]}-${parts[0]}`
      }
      return apiInstance.get(`/employees/audit-log/all`, {
        params: {
          limit,
          offset: page * limit,
          action: filterAction || undefined,
          employee_name: searchName || undefined,
          date_from: toApiDate(dateFrom),
          date_to: toApiDate(dateTo),
        },
      }).then((res) => res.data)
    },
  })

  const total = data?.total ?? 0
  const items: AuditLogItem[] = data?.items ?? []
  const totalPages = Math.ceil(total / limit)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Журнал действий</DialogTitle>
            <DialogDescription>
              {filterAction ? actionLabels[filterAction] || filterAction : "Все действия"}
            </DialogDescription>
          </DialogHeader>

          {/* Фильтры */}
          <div className="flex gap-3 items-center flex-wrap">
            <Input
              placeholder="Поиск по имени..."
              value={searchName}
              onChange={(e) => {
                setSearchName(e.target.value)
                setPage(0)
              }}
              className="w-[180px]"
            />
            <Select
              value={filterAction ?? "all"}
              onValueChange={(v) => {
                setFilterAction(v === "all" ? undefined : v)
                setPage(0)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Все действия" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все действия</SelectItem>
                {Object.entries(actionLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <div className="w-[130px]">
                <DatePicker
                  placeholder="С"
                  value={dateFrom}
                  onChange={(v) => {
                    setDateFrom(v)
                    setPage(0)
                  }}
                />
              </div>
              <div className="w-[130px]">
                <DatePicker
                  placeholder="По"
                  value={dateTo}
                  onChange={(v) => {
                    setDateTo(v)
                    setPage(0)
                  }}
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchName("")
                setFilterAction(undefined)
                setDateFrom("")
                setDateTo("")
                setPage(0)
              }}
            >
              Очистить
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Всего: {total}
            </span>
          </div>

          {/* Таблица */}
          <div className="overflow-y-auto max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Время</TableHead>
                  <TableHead className="w-[140px]">Действие</TableHead>
                  <TableHead>Сотрудник / Объект</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Нет записей
                    </TableCell>
                  </TableRow>
                )}
                {items.map((log, idx) => (
                  <TableRow
                    key={idx}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedLog(log)
                      setDetailOpen(true)
                    }}
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge className={actionColors[log.action] || "bg-gray-100 text-gray-800"}>
                        {actionLabels[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {log.employee_name || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {extractSummary(log.message)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Пагинация */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Назад
            </Button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {Math.max(1, totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперёд
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Детали */}
      <DetailDialog log={selectedLog} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  )
}
