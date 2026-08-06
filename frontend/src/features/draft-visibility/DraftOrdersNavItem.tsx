import { useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import type { ComponentType, SVGProps } from "react"
import { cn } from "@/shared/utils/cn"
import { Badge } from "@/shared/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { useAllDrafts } from "@/entities/draft"
import type { AllDraftItem } from "@/entities/draft"
import { openDraftEditorWindow } from "@/entities/order/draftOrderSaveChannel"
import { DRAFT_SAVE_STATUS_LABEL, DRAFT_SAVE_STATUS_CLASS } from "@/entities/order/draftSaveStatus"
import { timeAgo } from "@/shared/utils/date"

type DraftOrdersNavItemProps = {
  item: {
    to: string
    label: string
    icon: ComponentType<SVGProps<SVGSVGElement>>
  }
}

function DraftBadgeButton({ draft }: { draft: AllDraftItem }) {
  const status = draft.save_status
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        // Попап открывает черновик только для просмотра (#61).
        openDraftEditorWindow(draft.view_url)
      }}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
      title={draft.title || undefined}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{draft.title || "—"}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {draft.type_name || "—"}
          {draft.number ? ` · № ${draft.number}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {draft.kind === "order" && status && (
          <Badge
            variant="outline"
            className={cn("px-1.5", DRAFT_SAVE_STATUS_CLASS[status.state])}
            title={status.state === "error" && status.last_error ? status.last_error : undefined}
          >
            {DRAFT_SAVE_STATUS_LABEL[status.state]}
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {timeAgo(draft.created_at)}
        </span>
      </span>
    </button>
  )
}

export function DraftOrdersNavItem({ item }: DraftOrdersNavItemProps) {
  const { data: drafts } = useAllDrafts()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isOrdersActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  const count = drafts?.length ?? 0
  const recent = drafts?.slice(0, 5) ?? []

  return (
    <div className="relative">
      <NavLink
        to={item.to}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )
        }
      >
        <item.icon className="h-4 w-4" />
        {item.label}
      </NavLink>
      {count > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={`Черновики: ${count}`}
              aria-label={`Черновики: ${count}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "absolute right-2 top-1/2 inline-flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none transition-all duration-200",
                isOrdersActive
                  ? "bg-background text-primary hover:bg-background/80"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
                "hover:scale-110 hover:shadow-md",
                open && "scale-110 ring-2 ring-ring ring-offset-1"
              )}
            >
              {count > 99 ? "99+" : count}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="w-[500px]">
            <div className="border-b p-3">
              <p className="text-sm font-semibold">Черновики ({count})</p>
            </div>
            {recent.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Черновиков нет</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {recent.map((draft) => (
                  <li key={draft.draft_id}>
                    <DraftBadgeButton draft={draft} />
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t p-2">
              <NavLink
                to="/orders/drafts"
                className="block rounded px-2 py-1.5 text-sm text-primary hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                Все черновики →
              </NavLink>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
