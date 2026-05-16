import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Download, Eye, Trash2 } from "lucide-react"
import type { VacationPeriodVacation } from "@/entities/vacation-period/types"

type ParsedPostponeComment = {
  orderNumber: string
  periodStart: string
  periodEnd: string
  beforeDays: number
  afterDays: number
  movedDays: number
}

type ParsedExtensionComment = {
  orderNumber: string
  periodStart: string
  periodEnd: string
  extensionStart: string
  extensionEnd: string
  beforeDays: number
  afterDays: number
  extensionDays: number
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function addDaysSafe(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime()) || !Number.isFinite(days)) return isoDate
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

function parsePostponeComment(comment?: string | null): ParsedPostponeComment | null {
  if (!comment) return null
  const match = comment.match(
    /Перенос по приказу №(.+?): период (\d{4}-\d{2}-\d{2}) — (\d{4}-\d{2}-\d{2}), было (\d+) дн\., стало (\d+) дн\., перенесено (\d+) дн\./
  )
  if (!match) return null
  const beforeDays = Number(match[4])
  const afterDays = Number(match[5])
  const movedDays = Number(match[6])
  if (![beforeDays, afterDays, movedDays].every(Number.isFinite)) return null
  return {
    orderNumber: match[1],
    periodStart: match[2],
    periodEnd: match[3],
    beforeDays,
    afterDays,
    movedDays,
  }
}

function parseExtensionComment(comment?: string | null): ParsedExtensionComment | null {
  if (!comment) return null
  const match = comment.match(
    /Продление по приказу №(.+?): период (\d{4}-\d{2}-\d{2}) — (\d{4}-\d{2}-\d{2}), продленный период (\d{4}-\d{2}-\d{2}) — (\d{4}-\d{2}-\d{2}), было (\d+) дн\., стало (\d+) дн\., продлено (\d+) дн\./
  )
  if (match) {
    const beforeDays = Number(match[6])
    const afterDays = Number(match[7])
    const extensionDays = Number(match[8])
    if (![beforeDays, afterDays, extensionDays].every(Number.isFinite)) return null
    return {
      orderNumber: match[1],
      periodStart: match[2],
      periodEnd: match[3],
      extensionStart: match[4],
      extensionEnd: match[5],
      beforeDays,
      afterDays,
      extensionDays,
    }
  }

  const legacy = comment.match(
    /Продление по приказу №(.+?): период (\d{4}-\d{2}-\d{2}) — (\d{4}-\d{2}-\d{2}), продлен до (\d{4}-\d{2}-\d{2}), было (\d+) дн\., стало (\d+) дн\., продлено (\d+) дн\./
  )
  if (!legacy) return null
  const beforeDays = Number(legacy[5])
  const afterDays = Number(legacy[6])
  const extensionDays = Number(legacy[7])
  if (![beforeDays, afterDays, extensionDays].every(Number.isFinite)) return null
  return {
    orderNumber: legacy[1],
    periodStart: legacy[2],
    periodEnd: legacy[3],
    extensionStart: addDaysSafe(legacy[3], 1),
    extensionEnd: legacy[4],
    beforeDays,
    afterDays,
    extensionDays,
  }
}

type Props = {
  vacation: VacationPeriodVacation
  onPreview?: (orderId: number) => void
  onDownload?: (orderId: number) => void
  onDelete?: (vacationId: number) => void
}

export function VacationPeriodVacationRow({
  vacation,
  onPreview,
  onDownload,
  onDelete,
}: Props) {
  const wasRecalled = Boolean(vacation.recall_order_id || vacation.recall_date || vacation.recall_order_number)
  const postponeInfo = parsePostponeComment(vacation.comment)
  const extensionInfo = parseExtensionComment(vacation.comment)

  const otherCommentLines = (vacation.comment || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Перенос по приказу №") && !line.startsWith("Продление по приказу №"))

  const displayedDays =
    wasRecalled && typeof vacation.actual_days === "number"
      ? vacation.actual_days
      : postponeInfo
        ? postponeInfo.afterDays
        : extensionInfo
          ? extensionInfo.afterDays
          : vacation.days_count

  return (
    <tr
      className={`border-b border-muted/30 ${
        wasRecalled ? "bg-amber-50" : extensionInfo ? "bg-green-50/60" : postponeInfo ? "bg-sky-50/60" : ""
      }`}
    >
      <td className="px-2 py-1">{formatDate(vacation.start_date)}</td>
      <td className="px-2 py-1">
        {formatDate(vacation.end_date)}
        {wasRecalled && vacation.recall_date && (
          <div className="text-[9px] text-amber-600 mt-0.5">Отзыв {formatDate(vacation.recall_date)}</div>
        )}
        {postponeInfo && (
          <div className="text-[9px] text-sky-700 mt-0.5">
            Период переноса {formatDate(postponeInfo.periodStart)} — {formatDate(postponeInfo.periodEnd)}
          </div>
        )}
        {extensionInfo && (
          <div className="text-[9px] text-green-700 mt-0.5">
            Продленный период {formatDate(extensionInfo.extensionStart)} — {formatDate(extensionInfo.extensionEnd)}
          </div>
        )}
      </td>
      <td className="px-2 py-1">
        {displayedDays}
        {wasRecalled && typeof vacation.original_days === "number" && (
          <>
            <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1 bg-amber-100 text-amber-700 border-amber-200">
              Отзыв
            </Badge>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              Было {vacation.original_days} → стало {vacation.actual_days ?? 0} (вернулось {vacation.original_days - (vacation.actual_days ?? 0)})
            </div>
          </>
        )}
        {postponeInfo && (
          <>
            <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1 bg-sky-100 text-sky-700 border-sky-200">
              Перенос
            </Badge>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              Было {postponeInfo.beforeDays} → стало {postponeInfo.afterDays} (перенесено {postponeInfo.movedDays})
            </div>
          </>
        )}
        {extensionInfo && (
          <>
            <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1 bg-green-100 text-green-700 border-green-200">
              Продление
            </Badge>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              Было {extensionInfo.beforeDays} → стало {extensionInfo.afterDays} (продлено {extensionInfo.extensionDays})
            </div>
          </>
        )}
      </td>
      <td className="px-2 py-1">
        {vacation.order_number || "—"}
        {wasRecalled && vacation.recall_order_number && (
          <div className="text-[9px] text-amber-600 mt-0.5">Отзыв: №{vacation.recall_order_number}</div>
        )}
        {postponeInfo && (
          <div className="text-[9px] text-sky-700 mt-0.5">Перенос: №{postponeInfo.orderNumber}</div>
        )}
        {extensionInfo && (
          <div className="text-[9px] text-green-700 mt-0.5">Продление: №{extensionInfo.orderNumber}</div>
        )}
      </td>
      <td className="px-2 py-1 text-[10px]">
        {otherCommentLines.length > 0 ? (
          <div className="space-y-0.5">
            {otherCommentLines.map((line, index) => (
              <div key={`${vacation.id}-comment-${index}`} className="text-[9px] text-muted-foreground">
                {line}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-1 py-1">
        <div className="flex gap-0.5">
          {vacation.order_id && onPreview && onDownload && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-blue-400 hover:text-blue-600"
                onClick={() => onPreview(vacation.order_id!)}
                title="Просмотр приказа"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-green-400 hover:text-green-600"
                onClick={() => onDownload(vacation.order_id!)}
                title="Скачать приказ"
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
              onClick={() => onDelete(vacation.id)}
              title="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
