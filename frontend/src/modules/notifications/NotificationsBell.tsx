import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, X } from "lucide-react"
import type { NotificationsApi } from "./api/adapter"
import type { InternalNotification } from "./types"
import { cn, Button, Popover, PopoverContent, PopoverTrigger } from "./ui"

export interface NotificationsBellProps {
  /** Адаптер данных (хост предоставляет реализацию поверх своего HTTP-клиента). */
  api: NotificationsApi
  /** Интервал поллинга в мс (по умолчанию 30 с). */
  pollIntervalMs?: number
}

/**
 * Колокольчик уведомлений для sidebar-based приложений:
 * бейдж непрочитанных + попап со списком незакрытых уведомлений.
 *
 * Без react-query/axios — собственный поллинг поверх NotificationsApi.
 * Непрочитанные помечаются прочитанными при открытии попапа (или сразу
 * после дозагрузки, если список пришёл позже); закрытые пропадают из
 * списка (состояние в БД хоста). Бэк недоступен — модуль не падает.
 */
export function NotificationsBell({
  api,
  pollIntervalMs = 30_000,
}: NotificationsBellProps) {
  const [items, setItems] = useState<InternalNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Поллинг не должен пересекаться с длинным запросом.
  const inFlightRef = useRef(false)

  const load = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const data = await api.list(50)
      setItems(data.items)
      setUnread(data.unread_count)
    } catch {
      // Бэк недоступен (например, KTM без бэка) — оставляем последнее состояние.
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
    const timer = setInterval(load, pollIntervalMs)
    return () => clearInterval(timer)
  }, [load, pollIntervalMs])

  // Непрочитанные помечаем прочитанными при открытии попапа. Набор
  // попыток в ref'е не даёт зациклиться: дозагрузка новых items после
  // markRead повторно не отмечает уже отмеченные, а при неудачном markRead
  // не провоцирует бесконечную перезагрузку.
  const markedRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!open) {
      markedRef.current = new Set()
      return
    }
    const toMark = items
      .filter((n) => !n.read_at && !markedRef.current.has(n.id))
      .map((n) => n.id)
    if (!toMark.length) return
    for (const id of toMark) markedRef.current.add(id)
    void Promise.allSettled(toMark.map((id) => api.markRead(id))).then(load)
  }, [open, items, api, load])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="relative flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
          data-testid="notification-bell"
          title="Уведомления"
          aria-label="Уведомления"
        >
          <span className="relative">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span
                data-testid="notification-bell-count"
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
              >
                {unread}
              </span>
            )}
          </span>
          <span>Уведомления</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-[360px] p-0"
        sideOffset={8}
        data-testid="notification-popover"
      >
        <div className="border-b px-4 py-2.5 text-sm font-medium">Уведомления</div>
        <div className="max-h-[420px] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Нет новых уведомлений
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                data-testid="notification-item"
                className={cn(
                  "group flex items-start gap-2 border-b px-4 py-3 last:border-b-0",
                  n.read_at ? "opacity-75" : "bg-primary/5"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.text && (
                    <div className="mt-0.5 text-xs text-muted-foreground whitespace-pre-line">
                      {n.text}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`notification-close-${n.id}`}
                  onClick={() => {
                    void api.close(n.id).then(load).catch(() => {
                      /* закрытие — best-effort; ошибка не роняет список */
                    })
                  }}
                  className="flex-none rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity"
                  title="Закрыть уведомление"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
