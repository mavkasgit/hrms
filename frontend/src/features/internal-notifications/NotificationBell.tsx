import { useEffect } from "react"
import { Bell, Check, X } from "lucide-react"
import {
  useInternalNotifications,
  useMarkNotificationRead,
  useCloseNotification,
} from "@/entities/internal-notifications"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/cn"

/**
 * Колокольчик уведомлений в шапке (#18): список незакрытых уведомлений
 * с состоянием в БД. Прочитанные и закрытые не возвращаются после
 * перезагрузки страницы или входа с другой машины.
 */
export function NotificationBell() {
  const { data, isLoading } = useInternalNotifications()
  const markRead = useMarkNotificationRead()
  const close = useCloseNotification()

  const items = data?.items ?? []
  const unread = data?.unread_count ?? 0

  // Прочитанное уведомление помечаем прочитанным при открытии попапа
  useEffect(() => {
    if (!items.length) return
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id)
    if (unreadIds.length) {
      for (const id of unreadIds) {
        markRead.mutate(id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          data-testid="notification-bell"
          title="Колокольчик уведомлений"
          aria-label="Колокольчик уведомлений"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              data-testid="notification-bell-count"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
            >
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" sideOffset={8}>
        <div className="border-b px-4 py-2.5 text-sm font-medium">Уведомления</div>
        <div className="max-h-[420px] overflow-y-auto">
          {isLoading && items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Загрузка…</div>
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
                  onClick={() => close.mutate(n.id)}
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

export { Check }
