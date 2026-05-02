import { useState } from "react"
import { ChevronDown, ChevronRight, Trash2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
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
  useCreateSickLeave,
  useDeleteSickLeave,
  useCancelSickLeave,
  useSickLeaves,
} from "@/entities/sick-leave/useSickLeaves"
import { EmployeeSearch } from "@/features/employee-search"
import type { Employee } from "@/entities/employee/types"
import type { SickLeave } from "@/entities/sick-leave/types"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const s = dateStr.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export function SickLeavesPage() {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [comment, setComment] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const [statusFilter, setStatusFilter] = useState<string | undefined>("active")
  const [nameFilter, setNameFilter] = useState("")

  const { data: sickLeavesData, isLoading } = useSickLeaves({
    q: nameFilter || undefined,
    status: statusFilter,
    page: 1,
    per_page: 50,
  })

  const createMutation = useCreateSickLeave()
  const cancelMutation = useCancelSickLeave()
  const deleteMutation = useDeleteSickLeave()

  const resetForm = () => {
    setSelectedEmployee(null)
    setStartDate("")
    setEndDate("")
    setComment("")
    setErrors({})
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedEmployee) newErrors.employee = "Выберите сотрудника"
    if (!startDate) newErrors.startDate = "Укажите дату начала"
    if (!endDate) newErrors.endDate = "Укажите дату конца"
    if (startDate && endDate && endDate < startDate) newErrors.endDate = "Дата конца раньше даты начала"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    
    const payload = {
      employee_id: selectedEmployee!.id,
      start_date: startDate,
      end_date: endDate,
      comment: comment || null,
    }
    
    createMutation.mutate(payload, {
      onSuccess: () => {
        setSuccessMessage("Больничный успешно создан!")
        setTimeout(() => setSuccessMessage(null), 5000)
        resetForm()
      },
      onError: (error: any) => {
        console.error(error)
      }
    })
  }

  const handleCancelConfirm = () => {
    if (cancelId) {
      cancelMutation.mutate(cancelId, {
        onSuccess: () => {
          setSuccessMessage("Больничный отменён")
          setTimeout(() => setSuccessMessage(null), 3000)
        }
      })
    }
    setCancelId(null)
  }

  const handleDeleteConfirm = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId, {
        onSuccess: () => {
          setSuccessMessage("Больничный удалён")
          setTimeout(() => setSuccessMessage(null), 3000)
        }
      })
    }
    setDeleteId(null)
  }

  const sickLeaves = sickLeavesData?.items || []
  
  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg z-50">
          <span className="text-sm font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Больничные листы</h1>
      </div>

      <div className="border rounded-lg bg-card">
        <div
          className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold">Создать больничный</h2>
        </div>

        {!collapsed && (
          <div className="border-t px-4 py-4">
            <div className="grid gap-4">
              <div className="flex gap-4">
                <EmployeeSearch
                  value={selectedEmployee}
                  onChange={(emp) => {
                    setSelectedEmployee(emp)
                    if (emp) setErrors({})
                  }}
                  error={errors.employee}
                  required
                />
              </div>

              <div className="flex gap-4">
                <div className="w-[130px]">
                  <DatePicker label="Дата начала *" value={startDate} onChange={setStartDate} />
                  {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
                </div>
                <div className="w-[130px]">
                  <DatePicker label="Дата конца *" value={endDate} onChange={setEndDate} />
                  {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
                </div>
                {startDate && endDate && (
                  <div className="w-[130px]">
                    <label className="text-sm font-medium">Дней</label>
                    <Input
                      value={String(
                        Math.round(
                          (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
                        ) + 1
                      )}
                      readOnly
                      className="h-10 text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="max-w-[420px]">
                <label className="text-sm font-medium">Описание / комментарий</label>
                <Input
                  placeholder="Описание больничного..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    resetForm()
                  }}
                  disabled={createMutation.isPending}
                >
                  Очистить
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSubmit()
                  }}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Создание..." : "Создать"}
                </Button>
              </div>
              {createMutation.isError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Ошибка: {(createMutation.error as any)?.response?.data?.detail || (createMutation.error as any)?.message || "Неизвестная ошибка"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <Input
          placeholder="Поиск по сотруднику..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className="w-64 h-9 text-sm"
        />
        <div className="flex gap-1">
          {(["active", "cancelled", undefined] as const).map((f) => (
            <Button
              key={f ?? "all"}
              variant={statusFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f ?? undefined)}
              className="text-xs"
            >
              {f === "active" ? "Активные" : f === "cancelled" ? "Отменённые" : "Все"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : sickLeaves.length === 0 ? (
        <EmptyState message="Нет больничных" description="Создайте первый больничный лист" />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Сотрудник</th>
                <th className="text-left px-4 py-2 font-medium">Период</th>
                <th className="text-left px-4 py-2 font-medium">Дней</th>
                <th className="text-left px-4 py-2 font-medium">Описание</th>
                <th className="text-left px-4 py-2 font-medium">Статус</th>
                <th className="w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {sickLeaves.map((sl: SickLeave) => (
                <tr key={sl.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2">{sl.employee_name}</td>
                  <td className="px-4 py-2">
                    {formatDate(sl.start_date)} — {formatDate(sl.end_date)}
                  </td>
                  <td className="px-4 py-2">{sl.days_count}</td>
                  <td className="px-4 py-2 text-muted-foreground max-w-[200px] truncate">
                    {sl.comment || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={sl.status === "active" ? "default" : "secondary"}>
                      {sl.status === "active" ? "Активный" : "Отменён"}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">
                    {sl.status === "active" && (
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-amber-500 hover:text-amber-700" 
                          onClick={() => setCancelId(sl.id)}
                          title="Отменить"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600" 
                          onClick={() => setDeleteId(sl.id)}
                          title="Удалить"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить больничный?</AlertDialogTitle>
            <AlertDialogDescription>
              Больничный будет отменён. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} className="bg-amber-600 hover:bg-amber-700">
              Отменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить больничный безвозвратно?</AlertDialogTitle>
            <AlertDialogDescription>
              Больничный будет удалён безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
