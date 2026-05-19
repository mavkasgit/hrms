import { Check, Download, Upload, X, Eye, FilePen, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"

export interface TemplateActionsBarProps {
  templateExists: boolean
  onPreview?: () => void
  onEdit?: () => void
  onUpload?: () => void
  onDownload?: () => void
  onDeleteTemplate?: () => void
  onDeleteType?: () => void
  isUploading?: boolean
  uploadSuccess?: boolean
  uploadLabel?: string
  variant?: "row" | "form"
  className?: string
}

export function TemplateActionsBar({
  templateExists,
  onPreview,
  onEdit,
  onUpload,
  onDownload,
  onDeleteTemplate,
  onDeleteType,
  isUploading,
  uploadSuccess,
  uploadLabel,
  variant = "row",
  className,
}: TemplateActionsBarProps) {
  if (variant === "form") {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          {onDeleteTemplate && (
            <Button
              variant="outline"
              size="sm"
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
              disabled={!templateExists}
              onClick={onDeleteTemplate}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Удалить шаблон
            </Button>
          )}
          {onUpload && (
            <Button
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={onUpload}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploadLabel || (templateExists ? "Заменить" : "Загрузить")}
            </Button>
          )}
          {onDownload && (
            <Button variant="outline" size="sm" disabled={!templateExists} onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />
              Скачать
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" size="sm" disabled={!templateExists} onClick={onEdit}>
              <FilePen className="mr-2 h-4 w-4" />
              Редактировать
            </Button>
          )}
          {uploadSuccess && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Шаблон загружен
            </span>
          )}
        </div>
      </div>
    )
  }

  // row variant
  return (
    <div className={`flex justify-end items-center gap-1 ${className || ""}`}>
      {templateExists && onPreview && (
        <Button variant="ghost" size="icon" title="Превью" onClick={onPreview}>
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {templateExists && onEdit && (
        <Button variant="ghost" size="icon" title="Редактировать в OnlyOffice" onClick={onEdit}>
          <FilePen className="h-4 w-4" />
        </Button>
      )}
      {onUpload && (
        <Button variant="ghost" size="icon" title="Загрузить шаблон" onClick={onUpload} disabled={isUploading}>
          <Upload className="h-4 w-4" />
        </Button>
      )}
      {templateExists && onDownload && (
        <Button variant="ghost" size="icon" title="Скачать шаблон" onClick={onDownload}>
          <Download className="h-4 w-4" />
        </Button>
      )}
      {templateExists && onDeleteTemplate && (
        <Button variant="ghost" size="icon" title="Удалить шаблон" onClick={onDeleteTemplate} className="text-red-500">
          <X className="h-4 w-4" />
        </Button>
      )}
      {onDeleteType && (
        <Button variant="ghost" size="icon" title="Удалить тип" onClick={onDeleteType} className="text-red-500">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
