import { useEffect, useRef, useState } from "react"
import { Download, RotateCcw, Eye, Database, Upload, AlertTriangle, Loader2, CheckCircle2, Trash2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/utils/cn"
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
import {
  useBackups,
  useBackupConfig,
  useBackupJob,
  useCurrentPreview,
  usePreviewBackup,
  useUploadPreview,
  useRestoreBackup,
  useUploadRestore,
  useUpdateBackupComment,
  useDeleteBackup,
  useBulkDeleteBackups,
  useDeleteBackupsOlderThan,
  useStartBackupJob,
} from "@/entities/backup/useBackups"
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

function storageLabel(name: string): string {
  const labels: Record<string, string> = {
    orders: "Приказы",
    staffing: "Штатное расписание",
    templates: "Шаблоны",
    personal: "Личные файлы",
  }
  return labels[name] || name
}

function backupStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    queued: "Очередь",
    preparing: "Подготовка",
    dumping_database: "База данных",
    analyzing: "Анализ",
    writing_dump: "Архив",
    adding_files: "Файлы",
    exporting_tables: "CSV-экспорт",
    writing_manifest: "Manifest",
    completed: "Готово",
    failed: "Ошибка",
  }
  return labels[stage] || stage
}

export function BackupsPage() {
  const { data: backups, isLoading, refetch: refetchBackups } = useBackups()
  const { data: config } = useBackupConfig()
  const dbName = config?.db_name || "unknown"
  const startBackupJob = useStartBackupJob()
  const [activeBackupJobId, setActiveBackupJobId] = useState<string | null>(null)
  const [handledBackupJobId, setHandledBackupJobId] = useState<string | null>(null)
  const { data: activeBackupJob } = useBackupJob(activeBackupJobId)
  const currentPreview = useCurrentPreview()
  const previewBackup = usePreviewBackup()
  const uploadPreview = useUploadPreview()
  const restoreBackup = useRestoreBackup()
  const uploadRestore = useUploadRestore()
  const updateComment = useUpdateBackupComment()
  const deleteBackup = useDeleteBackup()
  const bulkDelete = useBulkDeleteBackups()
  const deleteOlderThan = useDeleteBackupsOlderThan()

  const [previewData, setPreviewData] = useState<BackupPreview | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewTitle, setPreviewTitle] = useState("Содержимое бэкапа")

  const [restoreFilename, setRestoreFilename] = useState<string | null>(null)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [restoreConfirmInput, setRestoreConfirmInput] = useState("")
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [uploadedRestoreFile, setUploadedRestoreFile] = useState<File | null>(null)
  const [successOpen, setSuccessOpen] = useState(false)

  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set())
  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [commentInput, setCommentInput] = useState("")

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)

  const [olderThanOpen, setOlderThanOpen] = useState(false)
  const [olderThanDays, setOlderThanDays] = useState("")
  const [olderThanPreview, setOlderThanPreview] = useState<string[]>([])

  const [createToast, setCreateToast] = useState<{ filename: string; size: number; created_at: string } | null>(null)

  const commentInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!activeBackupJob || activeBackupJob.job_id === handledBackupJobId) return
    if (activeBackupJob.status === "completed" && activeBackupJob.result) {
      setHandledBackupJobId(activeBackupJob.job_id)
      setCreateToast({
        filename: activeBackupJob.result.filename,
        size: activeBackupJob.result.size,
        created_at: activeBackupJob.result.created_at,
      })
      refetchBackups()
      setTimeout(() => setCreateToast(null), 5000)
      setTimeout(() => setActiveBackupJobId(null), 1200)
    }
    if (activeBackupJob.status === "failed") {
      setHandledBackupJobId(activeBackupJob.job_id)
      alert("Ошибка создания бэкапа: " + (activeBackupJob.error || "неизвестная ошибка"))
      setActiveBackupJobId(null)
    }
  }, [activeBackupJob, handledBackupJobId, refetchBackups])

  const handleCreateBackup = async () => {
    try {
      const job = await startBackupJob.mutateAsync()
      setHandledBackupJobId(null)
      setActiveBackupJobId(job.job_id)
    } catch (e: any) {
      alert("Ошибка создания бэкапа: " + (e.response?.data?.detail || e.message))
    }
  }

  const handleCurrentPreview = async () => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    setPreviewTitle("Структура текущей базы данных")
    setUploadedRestoreFile(null)
    try {
      const data = await currentPreview.mutateAsync()
      setPreviewData(data)
    } catch (e) {
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handlePreview = async (filename: string) => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    setPreviewTitle("Содержимое бэкапа")
    setUploadedRestoreFile(null)
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
    setPreviewTitle("Содержимое загруженного бэкапа")
    setUploadedRestoreFile(file)
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
    setUploadedRestoreFile(null)
    setRestoreConfirmInput("")
    setRestoreConfirmOpen(true)
  }

  const handleRestoreConfirm = async () => {
    if (restoreConfirmInput !== dbName) return

    setRestoreLoading(true)
    try {
      if (uploadedRestoreFile) {
        await uploadRestore.mutateAsync({ file: uploadedRestoreFile, db_name: dbName })
      } else if (restoreFilename) {
        await restoreBackup.mutateAsync({ filename: restoreFilename, db_name: dbName })
      } else {
        return
      }
      setRestoreConfirmOpen(false)
      setUploadedRestoreFile(null)
      setSuccessOpen(true)
    } catch (e: any) {
      alert("Ошибка восстановления: " + (e.response?.data?.detail || e.message))
    } finally {
      setRestoreLoading(false)
    }
  }

  const toggleSelection = (filename: string) => {
    const next = new Set(selectedFilenames)
    if (next.has(filename)) next.delete(filename)
    else next.add(filename)
    setSelectedFilenames(next)
  }

  const toggleAll = () => {
    if (!backups) return
    if (selectedFilenames.size === backups.length) {
      setSelectedFilenames(new Set())
    } else {
      setSelectedFilenames(new Set(backups.map((b) => b.filename)))
    }
  }

  const startDelete = (filename: string) => {
    setDeleteTarget(filename)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteBackup.mutateAsync(deleteTarget)
      setDeleteConfirmOpen(false)
      setDeleteTarget(null)
    } catch (e: any) {
      alert("Ошибка удаления: " + (e.response?.data?.detail || e.message))
    }
  }

  const startBulkDelete = () => {
    if (selectedFilenames.size === 0) return
    setBulkDeleteConfirmOpen(true)
  }

  const confirmBulkDelete = async () => {
    try {
      await bulkDelete.mutateAsync(Array.from(selectedFilenames))
      setBulkDeleteConfirmOpen(false)
      setSelectedFilenames(new Set())
    } catch (e: any) {
      alert("Ошибка удаления: " + (e.response?.data?.detail || e.message))
    }
  }

  const openOlderThan = () => {
    setOlderThanDays("")
    setOlderThanPreview([])
    setOlderThanOpen(true)
  }

  const previewOlderThan = () => {
    const days = parseInt(olderThanDays, 10)
    if (isNaN(days) || days < 0 || !backups) return
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const toDelete = backups
      .filter((b) => new Date(b.created_at) < cutoff)
      .map((b) => b.filename)
    setOlderThanPreview(toDelete)
  }

  const confirmOlderThanDelete = async () => {
    const days = parseInt(olderThanDays, 10)
    if (isNaN(days) || days < 0) return
    try {
      await deleteOlderThan.mutateAsync(days)
      setOlderThanOpen(false)
      setSelectedFilenames(new Set())
    } catch (e: any) {
      alert("Ошибка удаления: " + (e.response?.data?.detail || e.message))
    }
  }

  const startEditComment = (filename: string, current: string) => {
    setEditingComment(filename)
    setCommentInput(current)
    setTimeout(() => commentInputRef.current?.focus(), 0)
  }

  const saveComment = async (filename: string) => {
    try {
      await updateComment.mutateAsync({ filename, comment: commentInput })
      setEditingComment(null)
    } catch (e: any) {
      alert("Ошибка сохранения комментария: " + (e.response?.data?.detail || e.message))
    }
  }

  const allSelected = backups && backups.length > 0 && selectedFilenames.size === backups.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Database className="h-5 w-5" />
          Резервное копирование БД и файлов
        </h1>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Button
          onClick={handleCreateBackup}
          disabled={startBackupJob.isPending || Boolean(activeBackupJobId)}
          size="sm"
        >
          {startBackupJob.isPending || activeBackupJobId ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Database className="h-4 w-4 mr-1" />}
          Создать бэкап
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCurrentPreview}
          disabled={currentPreview.isPending}
        >
          <Eye className="h-4 w-4 mr-1" />
          Структура текущей БД
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-1" />
          Загрузить файл .dump/.zip
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".dump,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUploadPreview(file)
            e.target.value = ""
          }}
        />
      </div>

      {activeBackupJob && (
        <div className="max-w-[760px] overflow-hidden rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4 text-slate-900 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {activeBackupJob.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Loader2 className="h-4 w-4 animate-spin text-sky-600" />}
                Создание резервной копии
              </div>
              <div className="text-xs text-slate-600">
                {backupStageLabel(activeBackupJob.stage)} · {activeBackupJob.message}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">{activeBackupJob.progress}%</div>
              <div className="text-[11px] text-slate-500">job {activeBackupJob.job_id.slice(0, 8)}</div>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200/80 ring-1 ring-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-500 transition-all duration-500 ease-out"
              style={{ width: `${Math.max(activeBackupJob.progress, 4)}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
            {activeBackupJob.files_total !== undefined && (
              <span className="rounded-full border border-sky-100 bg-white/70 px-2 py-1">
                Файлы: {activeBackupJob.files_done || 0}/{activeBackupJob.files_total}
              </span>
            )}
            {activeBackupJob.tables_total !== undefined && (
              <span className="rounded-full border border-sky-100 bg-white/70 px-2 py-1">
                Таблицы CSV: {activeBackupJob.tables_done || 0}/{activeBackupJob.tables_total}
              </span>
            )}
            <span className="rounded-full border border-sky-100 bg-white/70 px-2 py-1">
              Обновлено: {formatDate(activeBackupJob.updated_at)}
            </span>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          variant="outline"
          size="sm"
          disabled={selectedFilenames.size === 0}
          onClick={startBulkDelete}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Удалить выбранные ({selectedFilenames.size})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={openOlderThan}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Удалить старые
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden max-w-[1100px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-2 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4"
                />
              </th>
              <th className="text-left px-3 py-2 font-medium">Имя файла</th>
              <th className="text-left px-3 py-2 font-medium">База данных</th>
              <th className="text-left px-3 py-2 font-medium">Размер</th>
              <th className="text-left px-3 py-2 font-medium">Дата создания</th>
              <th className="text-left px-3 py-2 font-medium">Комментарий</th>
              <th className="text-right px-2 py-2 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  Загрузка...
                </td>
              </tr>
            ) : !backups || backups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  Нет бэкапов. Нажмите "Создать бэкап"
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.filename} className="border-t hover:bg-muted/30">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedFilenames.has(b.filename)}
                      onChange={() => toggleSelection(b.filename)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{b.filename}</td>
                  <td className="px-3 py-2">{b.db_name}</td>
                  <td className="px-3 py-2">{formatBytes(b.size)}</td>
                  <td className="px-3 py-2">{formatDate(b.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="rounded-md border border-input h-8 w-full overflow-hidden">
                      {editingComment === b.filename ? (
                        <Input
                          ref={commentInputRef}
                          value={commentInput}
                          onChange={(e) => setCommentInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveComment(b.filename)
                            if (e.key === "Escape") setEditingComment(null)
                          }}
                          onBlur={() => saveComment(b.filename)}
                          className="h-full w-full border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm px-2"
                        />
                      ) : (
                        <button
                          onClick={() => startEditComment(b.filename, b.comment)}
                          className="h-full w-full text-left text-sm px-2 text-muted-foreground hover:bg-muted/50 rounded-md truncate"
                          title={b.comment || "Нажмите для редактирования"}
                        >
                          {b.comment || "—"}
                        </button>
                      )}
                    </div>
                  </td>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => startDelete(b.filename)}
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
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
      <Dialog open={previewOpen} onOpenChange={(open) => {
        setPreviewOpen(open)
        if (!open) setUploadedRestoreFile(null)
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>
              Статистика таблиц и файловой части
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
                <p><span className="text-muted-foreground">Дата:</span> {previewData.backup_timestamp ? formatDate(previewData.backup_timestamp) : "—"}</p>
                {previewData.cached !== undefined && (
                  <p>
                    <span className="text-muted-foreground">Источник данных:</span>{" "}
                    {previewData.cached ? (
                      <span className="text-green-600">JSON-кэш (мгновенно)</span>
                    ) : (
                      <span className="text-amber-600">Восстановление во временную БД</span>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Файловая часть</h3>
                  {previewData.storage && (
                    <span className="text-xs text-muted-foreground">
                      {Object.values(previewData.storage).reduce((sum, item) => sum + item.files, 0)} файлов · {formatBytes(Object.values(previewData.storage).reduce((sum, item) => sum + item.bytes, 0))}
                    </span>
                  )}
                </div>
                {previewData.storage ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(previewData.storage).map(([name, storage]) => (
                      <div key={name} className="rounded-lg border bg-muted/10 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{storageLabel(name)}</div>
                            <div className="text-xs text-muted-foreground font-mono">data/{name}</div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>{storage.files} файлов</div>
                            <div>{formatBytes(storage.bytes)}</div>
                            {(storage.directories ?? 0) > 0 && <div>{storage.directories} папок</div>}
                          </div>
                        </div>
                        {storage.files > 0 ? (
                          <div className="max-h-28 overflow-y-auto rounded border bg-background text-xs">
                            {(storage.folders || []).filter((folder) => folder.files > 0).map((folder) => (
                              <div key={folder.path} className="grid grid-cols-[1fr_auto_auto] gap-2 border-b last:border-b-0 px-2 py-1">
                                <span className="font-mono truncate" title={folder.path}>{folder.path}</span>
                                <span className="text-muted-foreground whitespace-nowrap">{folder.files} ф.</span>
                                <span className="text-muted-foreground whitespace-nowrap">{formatBytes(folder.bytes)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground">
                            Файлов нет
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    В этом бэкапе нет файловой части или метаданных о файлах. Обычно это старый .dump, который содержит только БД.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Табличный экспорт для просмотра</h3>
                {previewData.table_exports ? (
                  <div className="rounded-lg border bg-emerald-50/60 p-3 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Excel-файл</div>
                        <div className="font-mono text-xs break-all">{previewData.table_exports.workbook_path || "exports/hrms_tables.xlsx"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">CSV-файлы</div>
                        <div className="font-mono text-xs break-all">{previewData.table_exports.path}/*.csv</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      В архиве есть {previewData.table_exports.tables.length} таблиц в CSV и общий Excel workbook. Откройте `.zip` после скачивания и перейдите в `exports/`.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Табличного экспорта нет. Обычно это старый `.dump` или бэкап, созданный до добавления экспорта.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Таблицы БД</h3>
                <div className="border rounded-lg overflow-hidden max-h-[280px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Таблица</th>
                      <th className="text-right px-3 py-2 font-medium">Записей</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(previewData.tables).map(([table, count]) => (
                      <tr key={table} className="border-t">
                        <td className="px-3 py-2">{table}</td>
                        <td className="px-3 py-2 text-right font-mono">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              <DialogFooter className="gap-2">
                {uploadedRestoreFile && (
                  <Button
                    variant="default"
                    className="bg-red-500 hover:bg-red-600 text-white"
                    onClick={() => {
                      setRestoreConfirmInput("")
                      setRestoreConfirmOpen(true)
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Восстановить
                  </Button>
                )}
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

      {/* Success Dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-xl">Восстановление завершено</DialogTitle>
              <DialogDescription className="text-base">
                База данных успешно восстановлена из резервной копии.
              </DialogDescription>
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => window.location.reload()}>
              Перезагрузить страницу
            </Button>
          </DialogFooter>
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
                <Input
                  type="text"
                  value={restoreConfirmInput}
                  onChange={(e) => setRestoreConfirmInput(e.target.value)}
                  className="mt-1"
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

      {/* Delete Single Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Удалить бэкап?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Файл <strong>{deleteTarget}</strong> будет безвозвратно удалён.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              className="bg-red-500 hover:bg-red-600"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Массовое удаление
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Будет удалено <strong>{selectedFilenames.size}</strong> бэкапов:</p>
              <div className="max-h-[200px] overflow-y-auto border rounded p-2 text-xs font-mono space-y-1">
                {Array.from(selectedFilenames).map((f) => (
                  <div key={f}>{f}</div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmBulkDelete()
              }}
              className="bg-red-500 hover:bg-red-600"
            >
              Удалить выбранные
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Older Than Dialog */}
      <Dialog open={olderThanOpen} onOpenChange={setOlderThanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Удалить старые бэкапы
            </DialogTitle>
            <DialogDescription>
              Укажите количество дней. Будут удалены все бэкапы старше указанной даты.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Количество дней"
                value={olderThanDays}
                onChange={(e) => setOlderThanDays(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={previewOlderThan} disabled={!olderThanDays}>
                Показать
              </Button>
            </div>
            {olderThanPreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Будет удалено <strong>{olderThanPreview.length}</strong> файлов:
                </p>
                <div className="max-h-[200px] overflow-y-auto border rounded p-2 text-xs font-mono space-y-1">
                  {olderThanPreview.map((f) => (
                    <div key={f}>{f}</div>
                  ))}
                </div>
              </div>
            )}
            {olderThanPreview.length === 0 && olderThanDays && (
              <p className="text-sm text-muted-foreground">Нет бэкапов старше указанной даты.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOlderThanOpen(false)}>Отмена</Button>
            <Button
              variant="default"
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={olderThanPreview.length === 0}
              onClick={confirmOlderThanDelete}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Backup Toast */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 max-w-sm transition-all duration-300",
          createToast ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
        )}
      >
        {createToast && (
          <div className="rounded-lg border bg-white p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-green-100 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Бэкап создан</p>
                <p className="text-xs text-muted-foreground break-all">{createToast.filename}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(createToast.size)} · {formatDate(createToast.created_at)}</p>
              </div>
              <button
                onClick={() => setCreateToast(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
