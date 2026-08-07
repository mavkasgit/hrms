import { useEffect, useRef, useState } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { useAllDrafts, fillFormFromDraft, DRAFTS_ROUTE, isDraftsRoute } from "@/entities/draft"
import type { AllDraftItem } from "@/entities/draft"
import { openDraftEditorWindow } from "@/entities/order/draftOrderSaveChannel"
import { DRAFT_SAVE_STATUS_LABEL, DRAFT_SAVE_STATUS_CLASS } from "@/entities/order/draftSaveStatus"
import { timeAgo } from "@/shared/utils/date"
import { formDraftRecoverUrl, readAllFormDrafts } from "@/entities/form-draft"
import type { FormDraftEntry } from "@/entities/form-draft"
import { Eye, FilePen, Trash2 } from "lucide-react"

function formatSavedAt(savedAt: string): string {
  return new Date(savedAt).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function DraftBadgeButton({
  draft,
  onFill,
}: {
  draft: AllDraftItem
  onFill: () => void
}) {
  const navigate = useNavigate()
  const [filling, setFilling] = useState(false)
  const status = draft.save_status

  const handleFillFields = async () => {
    if (filling) return
    setFilling(true)
    try {
      await fillFormFromDraft(draft.draft_id, navigate)
      onFill()
    } finally {
      setFilling(false)
    }
  }

  const openView = () => openDraftEditorWindow(draft.view_url)
  const openEdit = () => openDraftEditorWindow(draft.edit_url)

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
      <button
        type="button"
        onClick={openView}
        className="min-w-0 flex-1 text-left"
        title={draft.title || undefined}
      >
        <span className="flex items-center gap-2">
          <span className="block truncate font-medium">{draft.title || "—"}</span>
          {draft.kind === "order" && status && (
            <Badge
              variant="outline"
              className={cn("shrink-0 px-1.5", DRAFT_SAVE_STATUS_CLASS[status.state])}
              title={status.state === "error" && status.last_error ? status.last_error : undefined}
            >
              {DRAFT_SAVE_STATUS_LABEL[status.state]}
            </Badge>
          )}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[draft.number ? `№ ${draft.number}` : null, draft.type_name || null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      </button>
      <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
        {timeAgo(draft.created_at)}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          onClick={() => void handleFillFields()}
          disabled={filling}
          title="Заполнить форму создания данными черновика"
        >
          {filling ? "Загрузка..." : "Заполнить"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Открыть документ только для чтения"
          onClick={openView}
          aria-label="Открыть"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Восстановить — открыть в редакторе для доработки и сохранения"
          onClick={openEdit}
          aria-label="Восстановить"
        >
          <FilePen className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function DraftOrdersNavItem() {
  const { data: drafts } = useAllDrafts()
  const [open, setOpen] = useState(false)
  const [formDrafts, setFormDrafts] = useState<FormDraftEntry[]>(() => readAllFormDrafts())
  // Таргеты слотов, по которым пользователь уже принял решение в этой сессии —
  // не показываем повторно (draft мог ещё лежать в localStorage при медленном restore).
  const dismissedRef = useRef(new Set<string>())
  const navigate = useNavigate()
  const location = useLocation()
  const isDraftsActive = isDraftsRoute(location.pathname)

  useEffect(() => {
    const sync = () => {
      setFormDrafts(readAllFormDrafts().filter((e) => !dismissedRef.current.has(e.slot.target)))
    }
    sync()
    window.addEventListener("storage", sync)
    const id = window.setInterval(sync, 30_000)
    return () => {
      window.removeEventListener("storage", sync)
      window.clearInterval(id)
    }
  }, [location.pathname, location.search])

  const serverCount = drafts?.length ?? 0
  const count = serverCount + formDrafts.length
  const recent = drafts?.slice(0, 5) ?? []

  if (count === 0) return null

  const handleFormRestore = (entry: FormDraftEntry) => {
    dismissedRef.current.add(entry.slot.target)
    setOpen(false)
    setFormDrafts((prev) => prev.filter((e) => e.slot.target !== entry.slot.target))
    navigate(formDraftRecoverUrl(entry.slot))
  }

  const handleFormRemove = (entry: FormDraftEntry) => {
    localStorage.removeItem(entry.slot.storageKey)
    dismissedRef.current.add(entry.slot.target)
    setOpen(false)
    setFormDrafts((prev) => prev.filter((e) => e.slot.target !== entry.slot.target))
  }

  return (
    <div className="relative">
      <NavLink
        to={DRAFTS_ROUTE}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )
        }
      >
        <FilePen className="h-4 w-4" />
        Черновики
      </NavLink>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`Черновики: ${count}`}
            aria-label={`Черновики: ${count}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full transition-all duration-200",
              open && "ring-2 ring-ring ring-offset-1"
            )}
          >
            {serverCount > 0 && (
              <span
                title={`Черновики документов: ${serverCount}`}
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none transition-all duration-200",
                  isDraftsActive
                    ? "bg-background text-primary hover:bg-background/80"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                  "hover:scale-110 hover:shadow-md"
                )}
              >
                {serverCount > 99 ? "99+" : serverCount}
              </span>
            )}
            {formDrafts.length > 0 && (
              <span
                title="Несохранённые заполнения форм"
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none transition-all duration-200",
                  isDraftsActive
                    ? "bg-background text-amber-600 hover:bg-background/80"
                    : "bg-amber-500 text-white hover:bg-amber-600",
                  "hover:scale-110 hover:shadow-md"
                )}
              >
                {formDrafts.length > 9 ? "9+" : formDrafts.length}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-[500px]">
          <div className="border-b p-3">
            <p className="text-sm font-semibold">Черновики ({count})</p>
          </div>
          {recent.length === 0 && formDrafts.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Черновиков нет</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {formDrafts.map((entry) => (
                <li key={entry.slot.target} className="border-b border-amber-200 bg-amber-50/60">
                  <div
                    data-testid={
                      entry.slot.target === "orders"
                        ? "order-form-recovery-banner"
                        : `form-draft-recovery-banner-${entry.slot.target}`
                    }
                    className="flex items-center gap-2 px-3 py-2 text-left text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        Несохранённое заполнение {entry.slot.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        ({formatSavedAt(entry.savedAt)})
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleFormRestore(entry)}
                        data-testid="recovery-restore"
                        title="Заполнить форму данными несохранённого заполнения"
                      >
                        Заполнить
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleFormRemove(entry)}
                        data-testid="recovery-remove"
                        title="Удалить черновик формы"
                        aria-label="Удалить черновик формы"
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
              {recent.map((draft) => (
                <li key={draft.draft_id}>
                  <DraftBadgeButton draft={draft} onFill={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
          <div className="border-t p-2">
            <NavLink
              to={DRAFTS_ROUTE}
              className="block rounded px-2 py-1.5 text-sm text-primary hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              Все черновики →
            </NavLink>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
