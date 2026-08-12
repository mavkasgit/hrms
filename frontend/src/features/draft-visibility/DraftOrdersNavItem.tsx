import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import {
  useAllDrafts,
  useDeleteAllDraft,
  fillFormFromDraft,
  ServerDraftActions,
  DRAFTS_ROUTE,
  isDraftsRoute,
} from "@/entities/draft"
import type { AllDraftItem } from "@/entities/draft"
import { openDraftEditorWindow } from "@/entities/order/draftOrderSaveChannel"
import { DRAFT_SAVE_STATUS_LABEL, DRAFT_SAVE_STATUS_CLASS } from "@/entities/order/draftSaveStatus"
import { timeAgo } from "@/shared/utils/date"
import {
  formDraftRecoverUrl,
  formDraftSlotForRoute,
  readAllFormDrafts,
  FORM_DRAFT_CHANGED_EVENT,
} from "@/entities/form-draft"
import type { FormDraftEntry } from "@/entities/form-draft"
import { ClipboardPaste, FilePen } from "lucide-react"
import { DeleteCancelButton } from "@/shared/ui/delete-cancel-button"

interface DraftStatus {
  label: string
  className: string
}

// Статусы строк попапа: у незавершённых заполнений форм и серверных черновиков
// общий визуальный компонент Badge, набор статусов у каждого типа свой (#87).
const FORM_DRAFT_STATUS: DraftStatus = {
  label: "Не сохранён",
  className: "bg-amber-100 text-amber-800 border-amber-200",
}
const DRAFT_STATUS_FALLBACK: DraftStatus = {
  label: "Черновик",
  className: "bg-muted text-muted-foreground border-border",
}

// Короткое название типа формы для второй строки строки (номер документа ещё
// не создан — показываем тип со стадией «форма»).
const SLOT_TYPE_LABEL: Record<string, string> = {
  orders: "Приказ",
  "orders:general": "Общий приказ",
  notifications: "Уведомление",
  statements: "Заявление",
  vacations: "Отпуск",
  "vacations:recall": "Отзыв из отпуска",
  "vacations:postpone": "Перенос отпуска",
  "vacations:extension": "Продление отпуска",
  "unpaid-leaves": "Отпуск за свой счёт",
  "unpaid-leaves:group": "Групповой отпуск за свой счёт",
  "weekend-calls": "Вызов в выходной",
  "weekend-calls:group": "Групповой вызов в выходной",
}

function formDraftSubtitle(entry: FormDraftEntry): string {
  const typeLabel = SLOT_TYPE_LABEL[entry.slot.target] ?? entry.slot.label
  return `${typeLabel} · форма`
}

function serverDraftSubtitle(draft: AllDraftItem): string {
  return (
    [draft.number ? `№ ${draft.number}` : null, draft.type_name || null]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

function serverDraftStatus(draft: AllDraftItem): DraftStatus {
  if (draft.save_status) {
    return {
      label: DRAFT_SAVE_STATUS_LABEL[draft.save_status.state],
      className: DRAFT_SAVE_STATUS_CLASS[draft.save_status.state],
    }
  }
  return DRAFT_STATUS_FALLBACK
}

/**
 * Единая строка списка попапа «Черновики»:
 * [Название · Статус] / [Подпись] / [Дата] / [Действия].
 * Одинаковая для незавершённых заполнений форм и созданных документов (#87).
 */
function DraftRow({
  rowRef,
  highlighted,
  testId,
  title,
  status,
  subtitle,
  date,
  actions,
}: {
  rowRef?: (el: HTMLLIElement | null) => void
  highlighted?: boolean
  testId?: string
  title: string
  status: DraftStatus | null
  subtitle: string
  date: string
  actions: ReactNode
}) {
  return (
    <li
      ref={rowRef}
      data-testid={testId}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn("border-b", highlighted && "ring-2 ring-inset ring-amber-400")}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block truncate font-medium">{title}</span>
            {status && (
              <Badge variant="outline" className={cn("shrink-0 px-1.5", status.className)}>
                {status.label}
              </Badge>
            )}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">{date}</span>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
    </li>
  )
}

function DraftBadgeButton({
  draft,
  rowRef,
}: {
  draft: AllDraftItem
  rowRef?: (el: HTMLLIElement | null) => void
}) {
  const navigate = useNavigate()
  const [filling, setFilling] = useState(false)
  const [armed, setArmed] = useState(false)
  const deleteMutation = useDeleteAllDraft()

  const handleFillFields = async () => {
    if (filling) return
    setFilling(true)
    try {
      await fillFormFromDraft(draft.draft_id, navigate)
    } finally {
      setFilling(false)
    }
  }

  return (
    <DraftRow
      rowRef={rowRef}
      title={draft.title || "—"}
      status={serverDraftStatus(draft)}
      subtitle={serverDraftSubtitle(draft)}
      date={timeAgo(draft.created_at)}
      actions={
        <ServerDraftActions
          filling={filling}
          armed={armed}
          onArmedChange={setArmed}
          onFill={() => void handleFillFields()}
          onOpenView={() => openDraftEditorWindow(draft.view_url)}
          onOpenEdit={() => openDraftEditorWindow(draft.edit_url)}
          onDelete={() => deleteMutation.mutate(draft.draft_id)}
          deletePending={deleteMutation.isPending}
        />
      }
    />
  )
}

export function DraftOrdersNavItem() {
  const { data: drafts } = useAllDrafts()
  const [open, setOpen] = useState(false)
  const [formDrafts, setFormDrafts] = useState<FormDraftEntry[]>(() => readAllFormDrafts())
  // Слоты форм, чьи кнопки удаления вооружены (окно отмены активно). Формы
  // в отличие от серверных черновиков рендерятся прямо здесь, поэтому Set.
  const [armedFormTargets, setArmedFormTargets] = useState<ReadonlySet<string>>(new Set())
  // Слот заполнения текущей страницы: раскрываем попап и подсвечиваем его строку (#87).
  const [highlightedTarget, setHighlightedTarget] = useState<string | null>(null)
  // Попап был раскрыт автоматически (а не пользователем) — закрываем его при
  // переходе на страницу без заполнения, чтобы не оставлять «пустой» попап (#87).
  const autoOpenedRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const isDraftsActive = isDraftsRoute(location.pathname)

  // Сопоставление «маршрут → слот» вынесено в реестр слотов чистой функцией (#87).
  const currentSlot = useMemo(
    () => formDraftSlotForRoute(location.pathname, location.search),
    [location.pathname, location.search],
  )

  // При монтировании страницы и при навигации: определяем слот текущей страницы.
  // Если у слота есть заполнение формы — раскрываем попап и подсвечиваем строку;
  // если заполнения нет — снимаем подсветку и закрываем автораскрытый попап,
  // чтобы не оставалась подсветка чужого слота и «пустой» попап (#87, US2/US3).
  useEffect(() => {
    const closeAutoOpened = () => {
      if (autoOpenedRef.current) {
        autoOpenedRef.current = false
        setOpen(false)
      }
      setHighlightedTarget(null)
    }

    if (!currentSlot) {
      closeAutoOpened()
      return
    }
    try {
      if (!localStorage.getItem(currentSlot.storageKey)) {
        closeAutoOpened()
        return
      }
    } catch {
      closeAutoOpened()
      return
    }
    autoOpenedRef.current = true
    setHighlightedTarget(currentSlot.target)
    setOpen(true)
  }, [currentSlot])

  // Подсвеченная строка прокручивается в видимую область: callback-ref срабатывает
  // при первом рендере строки и после ре-синка списка при навигации.
  const highlightRowRef = useCallback(
    (el: HTMLLIElement | null) => {
      if (el) el.scrollIntoView({ block: "nearest" })
    },
    [],
  )

  useEffect(() => {
    const sync = () => {
      setFormDrafts(readAllFormDrafts())
    }
    sync()
    window.addEventListener("storage", sync)
    // Мгновенная синхронизация в той же вкладке: запись/очистка черновика формы
    // шлёт FORM_DRAFT_CHANGED_EVENT — строка исчезает сразу после создания документа (#87).
    window.addEventListener(FORM_DRAFT_CHANGED_EVENT, sync)
    const id = window.setInterval(sync, 30_000)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(FORM_DRAFT_CHANGED_EVENT, sync)
      window.clearInterval(id)
    }
  }, [location.pathname, location.search])

  // Единый список попапа: строки форм (localStorage) + серверные черновики,
  // отсортированные по времени создания — свежие сверху (#87).
  const combinedItems = useMemo(() => {
    const items: Array<
      | { type: "form"; ts: number; entry: FormDraftEntry }
      | { type: "server"; ts: number; draft: AllDraftItem }
    > = [
      ...formDrafts.map((entry) => ({
        type: "form" as const,
        ts: new Date(entry.savedAt).getTime(),
        entry,
      })),
      ...(drafts ?? []).map((draft) => ({
        type: "server" as const,
        ts: draft.created_at ? new Date(draft.created_at).getTime() : Number.MIN_SAFE_INTEGER,
        draft,
      })),
    ]
    items.sort((a, b) => b.ts - a.ts)
    return items
  }, [formDrafts, drafts])

  const count = combinedItems.length
  const serverCount = drafts?.length ?? 0

  if (count === 0) return null

  // «Заполнить»: попап остаётся открытым, строка остаётся видимой — черновик
  // живёт в localStorage до создания документа и исчезнет сам по событию
  // FORM_DRAFT_CHANGED_EVENT (после коммита форма вызовет clear()) (#87).
  const handleFormRestore = (entry: FormDraftEntry) => {
    setArmedFormTargets((prev) => new Set([...prev].filter((t) => t !== entry.slot.target)))
    setHighlightedTarget(null)
    navigate(formDraftRecoverUrl(entry.slot))
  }

  // «Удалить»: попап остаётся открытым, строка исчезает сразу — черновик
  // удалён из localStorage (auto-save формы может воссоздать его только при
  // новом реальном вводе, и тогда строка появится снова честно) (#87).
  const handleFormRemove = (entry: FormDraftEntry) => {
    localStorage.removeItem(entry.slot.storageKey)
    setArmedFormTargets((prev) => new Set([...prev].filter((t) => t !== entry.slot.target)))
    setHighlightedTarget(null)
    setFormDrafts((prev) => prev.filter((e) => e.slot.target !== entry.slot.target))
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // Пользователь открыл попап вручную — больше не закрываем его автоматически.
    if (next) autoOpenedRef.current = false
    // Закрытие попапа снимает подсветку (но не «убирает» строку — она останется
    // в списке, пока заполнение не восстановлено/удалено в этой сессии).
    if (!next) setHighlightedTarget(null)
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
      <Popover open={open} onOpenChange={handleOpenChange}>
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
          {combinedItems.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Черновиков нет</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {combinedItems.map((item) =>
                item.type === "form" ? (
                  <DraftRow
                    key={item.entry.slot.target}
                    rowRef={
                      item.entry.slot.target === highlightedTarget ? highlightRowRef : undefined
                    }
                    highlighted={item.entry.slot.target === highlightedTarget}
                    testId={`form-draft-row-${item.entry.slot.target}`}
                    title={`Несохранённое заполнение ${item.entry.slot.label}`}
                    status={FORM_DRAFT_STATUS}
                    subtitle={formDraftSubtitle(item.entry)}
                    date={timeAgo(item.entry.savedAt)}
                    actions={
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleFormRestore(item.entry)}
                          data-testid="recovery-restore"
                          title="Заполнить форму данными несохранённого заполнения"
                          aria-label="Заполнить"
                        >
                          <ClipboardPaste className="h-4 w-4" />
                        </Button>
                        <DeleteCancelButton
                          armed={armedFormTargets.has(item.entry.slot.target)}
                          onArmedChange={(armed) => {
                            setArmedFormTargets((prev) => {
                              const next = new Set(prev)
                              if (armed) next.add(item.entry.slot.target)
                              else next.delete(item.entry.slot.target)
                              return next
                            })
                          }}
                          onDelete={() => handleFormRemove(item.entry)}
                          idleLabel="Удалить черновик формы"
                        />
                      </>
                    }
                  />
                ) : (
                  <DraftBadgeButton key={item.draft.draft_id} draft={item.draft} />
                )
              )}
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
