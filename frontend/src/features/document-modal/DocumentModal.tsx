import { useRef, useState } from "react"
import { FileText, Upload, Eye, Clock, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
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
import { Button } from "@/shared/ui/button"
import {
  useCurrentDocument,
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
} from "@/entities/document/useDocuments"
import type { Document } from "@/entities/document/types"

interface DocumentModalProps {
  docCode: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentModal({ docCode, title, open, onOpenChange }: DocumentModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: currentData } = useCurrentDocument(docCode)
  const { data: history, isLoading: historyLoading } = useDocuments(docCode)
  const uploadMutation = useUploadDocument(docCode)
  const deleteMutation = useDeleteDocument(docCode)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null)

  const currentDoc = currentData?.document

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    try {
      await uploadMutation.mutateAsync(file)
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || "Ошибка загрузки файла")
    }
  }

  const handleOpenDocument = (doc: Document) => {
    window.open(`/documents/${docCode}/${doc.id}/view`, "_blank", "noopener,noreferrer")
  }

  const handleDeleteConfirm = async () => {
    if (deleteDocId === null) return
    try {
      await deleteMutation.mutateAsync(deleteDocId)
      setDeleteDocId(null)
    } catch (err: any) {
      alert(err.response?.data?.detail || "Не удалось удалить файл")
    }
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-auto pr-1">
          {/* Current document info */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            {currentDoc ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Последнее обновление:</span>
                  <span className="font-medium">{formatDate(currentDoc.uploaded_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Файл:</span>
                  <span className="font-medium">{currentDoc.original_filename}</span>
                </div>
                <div className="pt-1">
                  <Button className="w-full" onClick={() => handleOpenDocument(currentDoc)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Открыть {title.toLowerCase()}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {title} ещё не загружено.
              </p>
            )}
          </div>

          {/* Upload */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
               onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.xlsx,.pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Нажмите для загрузки файла
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Допустимые форматы: .docx, .xlsx, .pdf (макс 10 МБ)
            </p>
          </div>

          {uploadMutation.isPending && (
            <p className="text-sm text-muted-foreground text-center">Загрузка...</p>
          )}
          {uploadError && (
            <p className="text-sm text-destructive text-center">{uploadError}</p>
          )}

          {/* History */}
          <div>
            <h3 className="text-sm font-medium mb-2">История загрузок</h3>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            ) : !history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground">История пуста</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Файл</th>
                      <th className="text-left px-3 py-2 font-medium">Дата</th>
                      <th className="text-right px-3 py-2 font-medium">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((doc) => (
                      <tr key={doc.id} className="border-t hover:bg-muted/50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {doc.is_current && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                Текущий
                              </span>
                            )}
                            <span className="truncate max-w-[200px]" title={doc.original_filename}>
                              {doc.original_filename}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {formatDate(doc.uploaded_at)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDocument(doc)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteDocId(doc.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={deleteDocId !== null} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить файл?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Файл будет удалён безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
