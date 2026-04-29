import { useState, useRef } from "react"
import { Download, RotateCcw, Eye, Database, Upload, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useBackups, useBackupConfig, useCreateBackup, usePreviewBackup, useUploadPreview, useRestoreBackup } from "@/entities/backup/useBackups"
import type { BackupPreview } from "@/entities/backup/types"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("ru-RU")
}

export function BackupsPage() {
  const { data: backups, isLoading } = useBackups()
  const { data: config } = useBackupConfig()
  const dbName = config?.db_name || "unknown"
  const createBackup = useCreateBackup()
  const previewBackup = usePreviewBackup()
  const uploadPreview = useUploadPreview()
  const restoreBackup = useRestoreBackup()

  const [previewData, setPreviewData] = useState<BackupPreview | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [restoreFilename, setRestoreFilename] = useState<string | null>(null)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [restoreConfirmInput, setRestoreConfirmInput] = useState("")
  const [restoreLoading, setRestoreLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePreview = async (filename: string) => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const data = await previewBackup.mutateAsync(filename)
      setPreviewData(data)
    } catch (e) {
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleUploadPreview = async (file: File) => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const data = await uploadPreview.mutateAsync(file)
      setPreviewData(data)
    } catch (e) {
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleRestoreClick = (filename: string) => {
    setRestoreFilename(filename)
    setRestoreConfirmInput("")
    setRestoreConfirmOpen(true)
  }

  const handleRestoreConfirm = async () => {
    if (restoreConfirmInput !== dbName || !restoreFilename) return

    setRestoreLoading(true)
    try {
      await restoreBackup.mutateAsync({ filename: restoreFilename, db_name: dbName })
      setRestoreConfirmOpen(false)
      alert("База данных успешно восстановлена. Страница будет перезагружена.")
      window.location.reload()
    } catch (e: any) {
      alert("Ошибка восстановления: " + (e.response?.data?.detail || e.message))
    } finally {
      setRestoreLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Database className="h-5 w-5" />
          Резервное копирование БД
        </h1>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Button
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
          size="sm"
        >
          {createBackup.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Database className="h-4 w-4 mr-1" />}
          Создать бэкап
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-1" />
          Загрузить файл .dump
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".dump"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUploadPreview(file)
            e.target.value = ""
          }}
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden max-w-[900px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Имя файла</th>
              <th className="text-left px-3 py-2 font-medium">База данных</th>
              <th className="text-left px-3 py-2 font-medium">Размер</th>
              <th className="text-left px-3 py-2 font-medium">Дата создания</th>
              <th className="text-right px-2 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  Загрузка...
                </td>
              </tr>
            ) : !backups || backups.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  Нет бэкапов. Нажмите "Создать бэкап"
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.filename} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{b.filename}</td>
                  <td className="px-3 py-2">{b.db_name}</td>
                  <td className="px-3 py-2">{formatBytes(b.size)}</td>
                  <td className="px-3 py-2">{formatDate(b.created_at)}</td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handlePreview(b.filename)}
                        title="Превью"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => window.open(`/api/backups/${b.filename}/download`)}
                        title="Скачать"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRestoreClick(b.filename)}
                        title="Восстановить"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Содержимое бэкапа</DialogTitle>
            <DialogDescription>
              Статистика таблиц в выбранном бэкапе
            </DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Анализ бэкапа...
            </div>
          ) : previewData ? (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Источник:</span> {previewData.source_db}</p>
                <p><span className="text-muted-foreground">Дата бэкапа:</span> {previewData.backup_timestamp ? formatDate(previewData.backup_timestamp) : "—"}</p>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Таблица</th>
                      <th className="text-right px-3 py-2 font-medium">Записей</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(previewData.tables).map(([table, count]) => (
                      <tr key={table} className="border-t">
                        <td className="px-3 py-2 capitalize">{table.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 text-right font-mono">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  Закрыть
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-8 text-center text-red-500">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
              Не удалось проанализировать бэкап
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Подтверждение восстановления
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Восстановление уничтожит <strong>ВСЕ текущие данные</strong> в базе данных.
                После восстановления будут применены актуальные миграции.
              </p>
              <p className="text-red-600 font-medium">Эта операция необратима.</p>
              <div className="pt-2">
                <label className="text-sm text-muted-foreground">
                  Для подтверждения введите имя базы данных: <strong>{dbName}</strong>
                </label>
                <input
                  type="text"
                  value={restoreConfirmInput}
                  onChange={(e) => setRestoreConfirmInput(e.target.value)}
                  className="mt-1 w-full h-10 px-2 text-sm border rounded"
                  placeholder="Имя базы данных"
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleRestoreConfirm()
              }}
              disabled={restoreLoading || restoreConfirmInput !== dbName}
              className="bg-red-500 hover:bg-red-600"
            >
              {restoreLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Восстановить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
