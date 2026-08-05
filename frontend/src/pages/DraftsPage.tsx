import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  useOrderDrafts,
  useCommitOrderDraft,
  useDeleteOrderDraft,
  useCommitGroupDraft,
} from "@/entities/order/useOnlyOffice"
import { openDraftEditorWindow } from "@/entities/order/draftOrderSaveChannel"
import type { DraftListItem } from "@/entities/order/onlyofficeTypes"
import { DRAFT_SAVE_STATUS_LABEL, DRAFT_SAVE_STATUS_CLASS } from "@/entities/order/draftSaveStatus"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import { Button } from "@/shared/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { formatDate, timeAgo } from "@/shared/utils/date"

function fileDisplayName(draft: DraftListItem): string {
  const name = draft.file_name || ""
  return name.replace(/^[0-9a-fA-F-]{32,36}_/, "") || name || "—"
}

export function DraftsPage() {
  const { data: drafts, isLoading } = useOrderDrafts()
  const commitDraftMutation = useCommitOrderDraft()
  const deleteDraftMutation = useDeleteOrderDraft()
  const commitGroupDraftMutation = useCommitGroupDraft()
  const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null)
  const [sortNewest, setSortNewest] = useState(true)

  const sorted = useMemo(() => {
    const list = [...(drafts ?? [])]
    list.sort((a, b) => {
      const at = a.created_at ? Date.parse(a.created_at) : 0
      const bt = b.created_at ? Date.parse(b.created_at) : 0
      return sortNewest ? bt - at : at - bt
    })
    return list
  }, [drafts, sortNewest])

  const commitPending = commitDraftMutation.isPending || commitGroupDraftMutation.isPending

  const handleCommit = (draft: DraftListItem) => {
    if (commitPending) return
    if (draft.kind === "group_order") {
      commitGroupDraftMutation.mutate(draft.draft_id)
    } else {
      commitDraftMutation.mutate(draft.draft_id)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Черновики</h1>
          <p className="text-sm text-muted-foreground">
            {sorted.length > 0
              ? `Всего: ${sorted.length}${sortNewest ? "" : " (по возрастанию даты)"}`
              : "Сохранённые, но не закоммиченные черновики приказов"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortNewest((prev) => !prev)}
          title="Изменить порядок сортировки"
        >
          {sortNewest ? "Сначала новые" : "Сначала старые"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          message="Черновиков нет"
          description="Создайте приказ — он появится здесь как черновик перед сохранением"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тип приказа</TableHead>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Номер</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Возраст</TableHead>
              <TableHead>Сохранение</TableHead>
              <TableHead>Файл</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((draft) => {
              const status = draft.save_status
              return (
                <TableRow key={draft.draft_id}>
                  <TableCell>
                    <Badge variant="outline">
                      {draft.order_type_name || draft.order_type_code || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {draft.kind === "group_order"
                      ? `Групповой приказ — ${draft.group_employee_count || 0} сотрудников`
                      : draft.employee_name || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{draft.order_number || "—"}</TableCell>
                  <TableCell>{draft.order_date ? formatDate(draft.order_date) : "—"}</TableCell>
                  <TableCell>{timeAgo(draft.created_at)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={DRAFT_SAVE_STATUS_CLASS[status.state]}
                      title={status.state === "error" && status.last_error ? status.last_error : undefined}
                    >
                      {DRAFT_SAVE_STATUS_LABEL[status.state]}
                    </Badge>
                    {status.last_saved_at && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(status.last_saved_at, "dd.MM.yyyy, HH:mm")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[260px] truncate text-sm"
                      title={draft.file_path || undefined}
                    >
                      {fileDisplayName(draft)}
                    </span>
                    {draft.file_path && (
                      <span className="block max-w-[260px] truncate text-[11px] text-muted-foreground">
                        {draft.file_path}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Редактировать"
                        onClick={() =>
                          openDraftEditorWindow(`/orders/drafts/${draft.draft_id}/edit-docx`)
                        }
                      >
                        Редактировать
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Сохранить как приказ"
                        disabled={commitPending}
                        onClick={() => handleCommit(draft)}
                      >
                        {commitPending && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Сохранить
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Удалить черновик"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeleteDraftId(draft.draft_id)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={deleteDraftId !== null} onOpenChange={(open) => !open && setDeleteDraftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить черновик?</AlertDialogTitle>
            <AlertDialogDescription>
              Черновик будет удалён безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDraftId) deleteDraftMutation.mutate(deleteDraftId)
                setDeleteDraftId(null)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
