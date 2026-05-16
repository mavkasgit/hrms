import { useState, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Dialog,
  DialogContent,
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
import { DatePicker } from "@/shared/ui/date-picker"
import { ComboboxCreate } from "@/shared/ui/combobox-create"
import { Briefcase } from "lucide-react"
import type { EmployeeTransfer } from "@/entities/employee/types"
import { usePositions, useCreatePosition } from "@/entities/position"

interface TransferHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transfers: EmployeeTransfer[]
  onSave: (transfers: EmployeeTransfer[]) => void
}

export function TransferHistoryModal({ open, onOpenChange, transfers, onSave }: TransferHistoryModalProps) {
  const [localTransfers, setLocalTransfers] = useState<EmployeeTransfer[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  const { data: positions = [] } = usePositions()
  const createPos = useCreatePosition()

  const posItems = positions.map((p) => ({ id: p.id, name: p.name }))

  const handleCreatePosition = async (name: string): Promise<number> => {
    const newPos = await createPos.mutateAsync({ name })
    return newPos.id
  }

  useEffect(() => {
    if (open) {
      setLocalTransfers(transfers.map(t => ({ ...t })))
      setEditingIndex(null)
    }
  }, [open, transfers])

  const addTransfer = () => {
    setLocalTransfers(prev => [...prev, { date: "", order_number: "", old_position_id: null, new_position_id: null, reason: "" }])
    setEditingIndex(localTransfers.length)
  }

  const updateTransfer = (index: number, field: keyof EmployeeTransfer, value: string | number | null) => {
    setLocalTransfers(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const removeTransfer = (index: number) => {
    setLocalTransfers(prev => prev.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
    }
    setDeleteIndex(null)
  }

  const confirmDelete = () => {
    if (deleteIndex !== null) {
      removeTransfer(deleteIndex)
    }
  }

  const handleSave = () => {
    onSave(localTransfers)
    onOpenChange(false)
  }

  const getPositionName = (id: number | null) => {
    if (!id) return "—"
    const pos = positions.find(p => p.id === id)
    return pos?.name || "—"
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(96vw,1200px)] max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>История переводов</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {localTransfers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Нет переводов. Нажмите «Добавить» чтобы создать.</p>
          ) : (
            <div className="space-y-2">
              {/* Table header */}
              <div className="grid grid-cols-[130px_100px_minmax(180px,1fr)_minmax(180px,1fr)_160px_40px] gap-3 text-xs font-medium text-muted-foreground px-2">
                <div>Дата</div>
                <div>№ Приказа</div>
                <div>Была должность</div>
                <div>Стала должность</div>
                <div>Основание</div>
                <div></div>
              </div>

              {localTransfers.map((t, i) => (
                <div key={i} className="grid grid-cols-[130px_100px_minmax(180px,1fr)_minmax(180px,1fr)_160px_40px] gap-3 items-center px-2 h-10 rounded hover:bg-muted/50">
                  {editingIndex === i ? (
                    <>
                      <DatePicker
                        value={t.date}
                        onChange={(value) => updateTransfer(i, "date", value || "")}
                        className="h-10 w-[130px]"
                      />
                      <Input
                        value={t.order_number}
                        onChange={(e) => updateTransfer(i, "order_number", e.target.value)}
                        placeholder="№"
                        className="h-10"
                      />
                      <ComboboxCreate
                        value={t.old_position_id}
                        onChange={(id) => updateTransfer(i, "old_position_id", id)}
                        items={posItems}
                        onCreate={handleCreatePosition}
                        placeholder="Должность"
                        icon={<Briefcase className="h-4 w-4" />}
                      />
                      <ComboboxCreate
                        value={t.new_position_id}
                        onChange={(id) => updateTransfer(i, "new_position_id", id)}
                        items={posItems}
                        onCreate={handleCreatePosition}
                        placeholder="Должность"
                        icon={<Briefcase className="h-4 w-4" />}
                      />
                      <Input
                        value={t.reason || ""}
                        onChange={(e) => updateTransfer(i, "reason", e.target.value)}
                        placeholder="Причина"
                        className="h-10"
                      />
                      <button
                        type="button"
                        onClick={() => setDeleteIndex(i)}
                        className="h-10 w-10 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors shrink-0"
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-sm h-10 flex items-center">{t.date ? new Date(t.date).toLocaleDateString("ru-RU") : "—"}</div>
                      <div className="text-sm h-10 flex items-center">{t.order_number || "—"}</div>
                      <div className="text-sm h-10 flex items-center">{getPositionName(t.old_position_id)}</div>
                      <div className="text-sm h-10 flex items-center">{getPositionName(t.new_position_id)}</div>
                      <div className="text-sm h-10 flex items-center">{t.reason || "—"}</div>
                      <button
                        type="button"
                        onClick={() => setEditingIndex(i)}
                        className="h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Редактировать"
                      >
                        <span className="text-sm">✎</span>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={addTransfer}>
            <Plus className="mr-1 h-4 w-4" />
            Добавить
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => { if (!open) setDeleteIndex(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить перевод?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteIndex !== null && localTransfers[deleteIndex] ? (
              <>
                Перевод от {new Date(localTransfers[deleteIndex].date).toLocaleDateString("ru-RU") || "—"} будет удалён.
              </>
            ) : "Перевод будет удалён."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="bg-red-600 hover:bg-red-700"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
