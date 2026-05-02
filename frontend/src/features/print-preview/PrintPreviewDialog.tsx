import { Fragment, useMemo, useState } from "react"
import { Printer, Download } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

export interface PrintTag {
  id: number
  name: string
}

export interface PrintColumn<T> {
  title: string
  width: string
  render: (item: T) => React.ReactNode
}

interface PrintPreviewDialogProps<T extends { id: number | string }> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  data: T[]
  columns: PrintColumn<T>[]
  getDepartmentId: (item: T) => number
  getDepartmentName: (item: T) => string
  getTags: (item: T) => PrintTag[]
  allTags?: PrintTag[]
}

export function PrintPreviewDialog<T extends { id: number | string }>({
  open,
  onOpenChange,
  title,
  data,
  columns,
  getDepartmentId,
  getDepartmentName,
  getTags,
  allTags,
}: PrintPreviewDialogProps<T>) {
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [selectedDeptIds, setSelectedDeptIds] = useState<number[]>([])

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const tags = getTags(item)
      const tagMatch =
        selectedTagIds.length === 0 ||
        selectedTagIds.some((tagId) => tags.some((t) => t.id === tagId))
      const deptMatch =
        selectedDeptIds.length === 0 ||
        selectedDeptIds.includes(getDepartmentId(item))
      return tagMatch && deptMatch
    })
  }, [data, selectedTagIds, selectedDeptIds, getTags, getDepartmentId])

  const allDepts = useMemo(() => {
    const map = new Map<number, string>()
    data.forEach((item) => {
      const id = getDepartmentId(item)
      const name = getDepartmentName(item)
      if (id !== -1 && name) {
        map.set(id, name)
      }
    })
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "ru")
    )
  }, [data, getDepartmentId, getDepartmentName])

  const colCount = columns.length
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const PAGE_MARGIN_MM = 8
  const MM_TO_PT = 2.8346456693
  const PX_TO_PT = 0.75
  const TABLE_FONT_PX = 9
  const TABLE_FONT_PT = TABLE_FONT_PX * PX_TO_PT
  const PAGE_USABLE_WIDTH_MM = 210 - PAGE_MARGIN_MM * 2

  const handleDownloadPdf = async () => {
    setIsPdfLoading(true)
    setPdfError(null)
    try {
      const pdfMake = (await import("pdfmake/build/pdfmake")).default as any
      const pdfFonts = (await import("pdfmake/build/vfs_fonts")).default as any
      pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts
      const MARGIN_PT = PAGE_MARGIN_MM * MM_TO_PT
      const A4_W_PT = 595.28
      const USABLE_W_PT = A4_W_PT - 2 * MARGIN_PT

      const colWidths: (number | string)[] = columns.map((col) => {
        const m = col.width.match(/(\d+(?:\.\d+)?)%/)
        if (m) return (parseFloat(m[1]) / 100) * USABLE_W_PT
        return "*"
      })

      const deptStats = new Map<number, { name: string; count: number }>()
      filteredData.forEach((item) => {
        const id = getDepartmentId(item)
        const name = getDepartmentName(item)
        const existing = deptStats.get(id)
        if (existing) existing.count++
        else deptStats.set(id, { name, count: 1 })
      })
      const total = filteredData.length
      const sortedStats = Array.from(deptStats.entries()).sort((a, b) =>
        a[1].name.localeCompare(b[1].name, "ru")
      )

      const content: any[] = [
        {
          text: title,
          alignment: "center",
          fontSize: 12,
          bold: true,
          margin: [0, 0, 0, 2],
        },
        {
          text: `Дата формирования: ${new Date().toLocaleDateString("ru-RU")}`,
          alignment: "center",
          fontSize: 8,
          margin: [0, 0, 0, 6],
        },
      ]

      if (sortedStats.length > 0) {
        const statsText: any[] = []
        sortedStats.forEach(([_, { name, count }], i) => {
          if (i > 0) statsText.push({ text: "   ", fontSize: 7 })
          statsText.push({ text: name, fontSize: 7, bold: true })
          statsText.push({ text: `: ${count} чел.`, fontSize: 7 })
        })
        statsText.push({ text: "   ", fontSize: 7 })
        statsText.push({ text: `Всего: ${total} чел.`, fontSize: 7, bold: true })
        content.push({
          text: statsText,
          margin: [0, 0, 0, 6],
        })
      }

      const tableBody: any[][] = []
      tableBody.push(
        columns.map((col) => ({
          text: col.title,
          bold: true,
          fontSize: 8,
          fillColor: "#e5e5e5",
        }))
      )

      const groupByTags = selectedTagIds.length > 0
      const groupByDepts = !groupByTags && selectedDeptIds.length > 0

      if (groupByTags) {
        selectedTagIds.forEach((tagId) => {
          const tag = allTags?.find((t) => t.id === tagId)
          const tagItems = filteredData.filter((item) =>
            getTags(item).some((t) => t.id === tagId)
          )
          if (tagItems.length === 0) return
          const spanRow = new Array(columns.length).fill("")
          spanRow[0] = {
            text: `${tag?.name ?? ""} — ${tagItems.length} чел.`,
            colSpan: columns.length,
            bold: true,
            fontSize: TABLE_FONT_PT,
            fillColor: "#f0f0f0",
          }
          tableBody.push(spanRow)
          tagItems.forEach((item) => {
            tableBody.push(
              columns.map((col) => ({
                text: String(col.render(item) ?? ""),
                fontSize: TABLE_FONT_PT,
              }))
            )
          })
        })
      } else if (groupByDepts) {
        const deptMap = new Map<number, { name: string; items: T[] }>()
        filteredData.forEach((item) => {
          const id = getDepartmentId(item)
          const name = getDepartmentName(item)
          if (!deptMap.has(id)) deptMap.set(id, { name, items: [] })
          deptMap.get(id)!.items.push(item)
        })
        const sortedDepts = Array.from(deptMap.entries()).sort((a, b) =>
          a[1].name.localeCompare(b[1].name, "ru")
        )
        sortedDepts.forEach(([_, { name, items }]) => {
          const spanRow = new Array(columns.length).fill("")
          spanRow[0] = {
            text: `${name} — ${items.length} чел.`,
            colSpan: columns.length,
            bold: true,
            fontSize: TABLE_FONT_PT,
            fillColor: "#f0f0f0",
          }
          tableBody.push(spanRow)
          items.forEach((item) => {
            tableBody.push(
              columns.map((col) => ({
                text: String(col.render(item) ?? ""),
                fontSize: TABLE_FONT_PT,
              }))
            )
          })
        })
      } else {
        filteredData.forEach((item) => {
          tableBody.push(
            columns.map((col) => ({
              text: String(col.render(item) ?? ""),
              fontSize: TABLE_FONT_PT,
            }))
          )
        })
      }

      content.push({
        table: {
          headerRows: 1,
          widths: colWidths,
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
          paddingLeft: () => 3,
          paddingRight: () => 3,
          paddingTop: () => 0.75,
          paddingBottom: () => 0.75,
        },
      })

      const docDefinition = {
        pageSize: "A4" as const,
        pageMargins: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT] as [number, number, number, number],
        content,
        defaultStyle: {
          font: "Roboto",
          fontSize: TABLE_FONT_PT,
        },
      }

      const filename = `${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`
      pdfMake.createPdf(docDefinition).download(filename)
    } catch (error) {
      console.error("Error generating PDF:", error)
      setPdfError("Не удалось сформировать PDF. Откройте консоль браузера для деталей ошибки.")
    } finally {
      setIsPdfLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="print-preview max-w-4xl max-h-[90vh] overflow-y-auto p-4">
        <style>{`
          @page { size: A4 portrait; margin: ${PAGE_MARGIN_MM}mm; }
          @media print {
            html, body {
              margin: 0 !important; padding: 0 !important; background: white !important;
              height: auto !important; min-height: auto !important; overflow: visible !important;
            }
            body * { visibility: hidden; }
            .print-preview, .print-preview * { visibility: visible; }
            body > *:not(.print-preview):not([data-radix-focus-guard]) { display: none !important; }
            [data-radix-dialog-overlay], [role="presentation"] { display: none !important; visibility: hidden !important; }
            [data-state="open"] > div, .print-preview, [role="dialog"] {
              position: static !important; left: auto !important; top: auto !important;
              right: auto !important; bottom: auto !important; transform: none !important;
              max-width: none !important; max-height: none !important; min-height: auto !important;
              width: 100% !important; height: auto !important; overflow: visible !important;
              background: white !important; padding: 0 !important; margin: 0 !important;
              border: none !important; border-radius: 0 !important; box-shadow: none !important;
              outline: none !important;
            }
            .print-preview button, .print-preview [role="button"] { display: none !important; }
            .print-preview .no-print { display: none !important; }
            .print-sheet {
              width: ${PAGE_USABLE_WIDTH_MM}mm !important;
              max-width: ${PAGE_USABLE_WIDTH_MM}mm !important;
              margin: 0 auto !important;
            }
            .print-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${TABLE_FONT_PX}px; }
            .print-table th, .print-table td {
              border: 0.5px solid #000; padding: 1px 3px; text-align: left; vertical-align: top;
              box-sizing: border-box; word-wrap: break-word; overflow-wrap: anywhere; word-break: break-word;
            }
            .print-table th { font-weight: bold; background: #e5e5e5; }
            .print-table td { line-height: 1.2; }
            .print-header { margin-bottom: 4px; text-align: center; }
            .print-header span { display: inline; font-size: 11px; margin: 0; padding: 0; }
          }
        `}</style>

        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center justify-between">
            <span>Предпросмотр печати</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleDownloadPdf} disabled={isPdfLoading}>
                <Download className="mr-1.5 h-4 w-4" />
                {isPdfLoading ? "Загрузка..." : "Скачать PDF"}
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" />
                Печать
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 mt-1 print-sheet">
          {pdfError && (
            <p className="no-print text-xs text-destructive">{pdfError}</p>
          )}
          <div className="text-center print-header">
            <span className="text-base font-bold uppercase tracking-wide">{title}</span>{" "}
            <span className="text-[10px] text-muted-foreground ml-2">
              Дата формирования: {new Date().toLocaleDateString("ru-RU")}
            </span>
          </div>

          {/* Department stats */}
          {(() => {
            const deptStats = new Map<number, { name: string; count: number }>()
            filteredData.forEach((item) => {
              const id = getDepartmentId(item)
              const name = getDepartmentName(item)
              const existing = deptStats.get(id)
              if (existing) {
                existing.count++
              } else {
                deptStats.set(id, { name, count: 1 })
              }
            })
            if (deptStats.size === 0) return null
            const sortedStats = Array.from(deptStats.entries()).sort((a, b) =>
              a[1].name.localeCompare(b[1].name, "ru")
            )
            const total = filteredData.length
            return (
              <div className="mb-2">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                  {sortedStats.map(([_, { name, count }]) => (
                    <span key={name}>
                      <span className="font-semibold">{name}</span>: {count} чел.
                    </span>
                  ))}
                  <span className="font-bold">Всего: {total} чел.</span>
                </div>
              </div>
            )
          })()}

          {/* Filters */}
          <div className="no-print space-y-2">
            {allDepts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Фильтр по подразделениям:</p>
                <div className="flex flex-wrap gap-1">
                  {allDepts.map(([id, name]) => {
                    const isSelected = selectedDeptIds.includes(id)
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          setSelectedDeptIds((prev) =>
                            prev.includes(id)
                              ? prev.filter((d) => d !== id)
                              : [...prev, id]
                          )
                        }}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border hover:bg-accent"
                        }`}
                      >
                        {name}
                      </button>
                    )
                  })}
                  {selectedDeptIds.length > 0 && (
                    <button
                      onClick={() => setSelectedDeptIds([])}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border border-dashed border-gray-400 text-muted-foreground hover:bg-accent transition-colors"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              </div>
            )}

            {allTags && allTags.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Фильтр по тегам:</p>
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                          onClick={() => {
                            setSelectedTagIds((prev) =>
                              prev.includes(tag.id)
                                ? prev.filter((tid) => tid !== tag.id)
                                : [...prev, tag.id]
                            )
                          }}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border hover:bg-accent"
                        }`}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                  {selectedTagIds.length > 0 && (
                    <button
                      onClick={() => setSelectedTagIds([])}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border border-dashed border-gray-400 text-muted-foreground hover:bg-accent transition-colors"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          <table className="print-table w-full text-[10px]">
            <colgroup>
              {columns.map((col, i) => (
                <col key={i} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b-2 border-black">
                {columns.map((col, i) => (
                  <th key={i} className="text-left px-0.5 py-0 font-semibold">
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const groupByTags = selectedTagIds.length > 0
                const groupByDepts = !groupByTags && selectedDeptIds.length > 0

                if (groupByTags) {
                  return selectedTagIds.map((tagId) => {
                    const tag = allTags?.find((t) => t.id === tagId)
                    const tagItems = filteredData.filter((item) =>
                      getTags(item).some((t) => t.id === tagId)
                    )
                    if (tagItems.length === 0) return null
                    return (
                      <Fragment key={tagId}>
                        <tr className="border-b border-gray-300 bg-gray-100">
                          <td colSpan={colCount} className="px-0.5 py-0 font-bold text-[10px]">
                            {tag?.name} — {tagItems.length} чел.
                          </td>
                        </tr>
                        {tagItems.map((item) => (
                          <tr key={`${tagId}-${item.id}`} className="border-b border-gray-300">
                            {columns.map((col, ci) => (
                              <td key={ci} className="px-0.5 py-0">
                                {col.render(item)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })
                }

                if (groupByDepts) {
                  const deptMap = new Map<number, { name: string; items: T[] }>()
                  filteredData.forEach((item) => {
                    const id = getDepartmentId(item)
                    const name = getDepartmentName(item)
                    if (!deptMap.has(id)) {
                      deptMap.set(id, { name, items: [] })
                    }
                    deptMap.get(id)!.items.push(item)
                  })
                  const sortedDepts = Array.from(deptMap.entries()).sort((a, b) =>
                    a[1].name.localeCompare(b[1].name, "ru")
                  )
                  return sortedDepts.map(([deptId, { name, items }]) => (
                    <Fragment key={deptId}>
                      <tr className="border-b border-gray-300 bg-gray-100">
                        <td colSpan={colCount} className="px-0.5 py-0 font-bold text-[10px]">
                          {name} — {items.length} чел.
                        </td>
                      </tr>
                      {items.map((item) => (
                        <tr key={`${deptId}-${item.id}`} className="border-b border-gray-300">
                          {columns.map((col, ci) => (
                            <td key={ci} className="px-0.5 py-0">
                              {col.render(item)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))
                }

                return filteredData.map((item) => (
                  <tr key={item.id} className="border-b border-gray-300">
                    {columns.map((col, ci) => (
                      <td key={ci} className="px-0.5 py-0">
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))
              })()}
            </tbody>
          </table>

          {filteredData.length === 0 && (
            <p className="text-center text-muted-foreground py-2 text-xs">Нет данных для печати</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
