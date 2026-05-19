import { Download, Eye, FilePen, Upload } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

interface TemplateTypeItem {
  id: number
  code: string
  name: string
  is_active: boolean
  template_filename: string | null
  display_name: string | null
  letter?: string | null
  show_in_orders_page?: boolean
  template_exists: boolean
}

interface TemplateTypeTableProps {
  types: TemplateTypeItem[]
  isLoading: boolean
  emptyMessage: string
  onEditRow: (t: TemplateTypeItem) => void
  uploadTemplate: (id: number, file: File, onSuccess: () => void) => void
  downloadTemplate: (id: number) => string
  openPreview?: (id: number) => void
  openEdit?: (id: number) => void
  grouped?: boolean
}

// Code-to-category mapping for order types
function getOrderCategory(code: string, showInOrders: boolean): string {
  if (code === "vacation_unpaid") return "Отпуска за свой счёт"
  if (code === "vacation_paid" || code === "vacation_recall" || code === "vacation_postpone" || code === "vacation_extension") return "Трудовые отпуска"
  if (code === "weekend_call") return "Вызовы в выходной"
  return showInOrders ? "Общий журнал" : "Отпуска"
}

function ActionButtons({ item, uploadTemplate, downloadTemplate, openPreview, openEdit }: {
  item: TemplateTypeItem
  uploadTemplate: (id: number, file: File, onSuccess: () => void) => void
  downloadTemplate: (id: number) => string
  openPreview?: (id: number) => void
  openEdit?: (id: number) => void
}) {
  return (
    <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {item.template_exists && openPreview && (
        <Button variant="ghost" size="icon" title="Превью" onClick={() => openPreview(item.id)}>
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {item.template_exists && openEdit && (
        <Button variant="ghost" size="icon" title="Редактировать в OnlyOffice" onClick={() => openEdit(item.id)}>
          <FilePen className="h-4 w-4" />
        </Button>
      )}
      <input
        type="file"
        accept=".docx"
        className="hidden"
        id={`upload-${item.id}`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) uploadTemplate(item.id, file, () => { e.target.value = "" })
        }}
      />
      <label htmlFor={`upload-${item.id}`}>
        <Button variant="ghost" size="icon" title="Загрузить шаблон" asChild>
          <span><Upload className="h-4 w-4" /></span>
        </Button>
      </label>
      {item.template_exists && (
        <Button variant="ghost" size="icon" title="Скачать шаблон" onClick={() => window.open(downloadTemplate(item.id), "_blank")}>
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function TypeRow({ item, onEditRow, uploadTemplate, downloadTemplate, openPreview, openEdit, showLetter, showCategory }: {
  item: TemplateTypeItem
  onEditRow: (t: TemplateTypeItem) => void
  uploadTemplate: (id: number, file: File, onSuccess: () => void) => void
  downloadTemplate: (id: number) => string
  openPreview?: (id: number) => void
  openEdit?: (id: number) => void
  showLetter: boolean
  showCategory: boolean
}) {
  return (
    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onEditRow(item)}>
      <TableCell>{item.name}</TableCell>
      <TableCell className="font-mono text-sm">{item.code}</TableCell>
      {showLetter && <TableCell className="font-mono text-sm">{item.letter ?? "—"}</TableCell>}
      {showCategory && (
        <TableCell>{getOrderCategory(item.code, item.show_in_orders_page ?? true)}</TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${item.template_exists ? "bg-green-500" : "bg-gray-300"}`} />
          <span className="text-sm">{item.display_name || item.template_filename || "—"}</span>
        </div>
      </TableCell>
      <TableCell>{item.is_active ? "Активен" : "Архив"}</TableCell>
      <TableCell className="text-right">
        <ActionButtons
          item={item}
          uploadTemplate={uploadTemplate}
          downloadTemplate={downloadTemplate}
          openPreview={openPreview}
          openEdit={openEdit}
        />
      </TableCell>
    </TableRow>
  )
}

export function TemplateTypeTable({
  types,
  isLoading,
  emptyMessage,
  onEditRow,
  uploadTemplate,
  downloadTemplate,
  openPreview,
  openEdit,
  grouped = false,
}: TemplateTypeTableProps) {
  const hasLetters = types.some((t) => t.letter)

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  }

  if (!types.length) {
    return <EmptyState message={emptyMessage} description="Создайте первый тип." />
  }

  if (grouped && hasLetters) {
    const groupedMap: Record<string, TemplateTypeItem[]> = {}
    const order = ["л", "к", ""]
    for (const t of types) {
      const key = t.letter || ""
      if (!groupedMap[key]) groupedMap[key] = []
      groupedMap[key].push(t)
    }

    return (
      <div className="space-y-6">
        {order.map((letter) => {
          const items = groupedMap[letter]
          if (!items?.length) return null
          const label = letter === "" ? "Без литеры" : `Литера "${letter}"`
          return (
            <div key={letter} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-base font-semibold">
                  {label} <span className="text-muted-foreground font-normal">({items.length})</span>
                </h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Литера</TableHead>
                    <TableHead>Где показывается</TableHead>
                    <TableHead>Шаблон</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TypeRow
                      key={item.id}
                      item={item}
                      onEditRow={onEditRow}
                      uploadTemplate={uploadTemplate}
                      downloadTemplate={downloadTemplate}
                      openPreview={openPreview}
                      openEdit={openEdit}
                      showLetter
                      showCategory
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Шаблон</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((item) => (
            <TypeRow
              key={item.id}
              item={item}
              onEditRow={onEditRow}
              uploadTemplate={uploadTemplate}
              downloadTemplate={downloadTemplate}
              openPreview={openPreview}
              openEdit={openEdit}
              showLetter={false}
              showCategory={false}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
