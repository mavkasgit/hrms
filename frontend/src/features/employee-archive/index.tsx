import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { useArchiveEmployee } from "@/entities/employee/useEmployees"

interface EmployeeArchiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: number
  name: string
}

export function EmployeeArchiveDialog({ open, onOpenChange, employeeId, name }: EmployeeArchiveDialogProps) {
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useArchiveEmployee()

  const handleArchive = () => {
    mutation.mutate({ employeeId, reason: reason || undefined })
    setReason("")
    setConfirmed(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Увольнение сотрудника</DialogTitle>
          <DialogDescription>
            {name} будет переведён в архив
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">Причина увольнения</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: по собственному желанию"
            />
          </div>

          {!confirmed && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Внимание</AlertTitle>
              <AlertDescription>
                Сотрудник будет переведён в архив. Все связанные приказы и отпуска сохранятся.
              </AlertDescription>
            </Alert>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-gray-300"
            />
            Подтверждаю увольнение
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={handleArchive}
            disabled={!confirmed || mutation.isPending}
          >
            {mutation.isPending ? "Увольнение..." : "Уволить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
