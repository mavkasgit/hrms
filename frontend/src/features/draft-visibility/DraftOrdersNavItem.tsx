import { useState } from "react"
import { NavLink } from "react-router-dom"
import type { ComponentType, SVGProps } from "react"
import { cn } from "@/shared/utils/cn"
import { Badge } from "@/shared/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { useOrderDrafts } from "@/entities/order/useOnlyOffice"
import { openDraftEditorWindow } from "@/entities/order/draftOrderSaveChannel"
import { DRAFT_SAVE_STATUS_LABEL, DRAFT_SAVE_STATUS_CLASS } from "@/entities/order/draftSaveStatus"
import { timeAgo } from "@/shared/utils/date"
import type { DraftListItem } from "@/entities/order/onlyofficeTypes"

type DraftOrdersNavItemProps = {
  item: {
    to: string
    label: string
    icon: ComponentType<SVGProps<SVGSVGElement>>
  }
}

function DraftBadgeButton({ draft }: { draft: DraftListItem }) {
  const status = draft.save_status
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openDraftEditorWindow(`/orders/drafts/${draft.draft_id}/edit-docx`)
      }}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
      title={draft.employee_name || draft.order_number || draft.draft_id}
    >
      <span className="min-w-0 truncate">
        {draft.order_type_name || draft.order_type_code || "—"}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Badge
          variant="outline"
          className={cn("px-1.5", DRAFT_SAVE_STATUS_CLASS[status.state])}
          title={status.state === "error" && status.last_error ? status.last_error : undefined}
        >
          {DRAFT_SAVE_STATUS_LABEL[status.state]}
        </Badge>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {timeAgo(draft.created_at)}
        </span>
      </span>
    </button>
  )
}

export function DraftOrdersNavItem({ item }: DraftOrdersNavItemProps) {
  const { data: drafts } = useOrderDrafts()
  const [open, setOpen] = useState(false)
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
              className="absolute right-2 top-1/2 inline-flex h-[18px] min-w-[18px] -translate-y-1/2 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {count > 99 ? "99+" : count}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="w-80">
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
