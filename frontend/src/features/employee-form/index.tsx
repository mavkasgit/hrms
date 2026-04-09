import { useState, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Checkbox } from "@/shared/ui/checkbox"
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
import type { Employee, EmployeeCreate, EmployeeUpdate } from "@/entities/employee/types"
import {
  useCreateEmployee,
  useUpdateEmployee,
  useArchiveEmployee,
  useRestoreEmployee,
  useDeleteEmployee,
} from "@/entities/employee/useEmployees"
import { Archive, Trash2, RotateCcw, Building } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { useDepartments } from "@/entities/employee/useEmployees"

interface EmployeeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null
}

const emptyForm: EmployeeCreate = {
  name: "",
  department: "",
  position: "",
  tab_number: null,
  hire_date: null,
  birth_date: null,
  gender: null,
  citizenship: true,
  residency: true,
  pensioner: false,
  payment_form: null,
  rate: null,
  contract_start: null,
  contract_end: null,
  personal_number: null,
  insurance_number: null,
  passport_number: null,
}

export function EmployeeForm({ open, onOpenChange, employee }: EmployeeFormProps) {
  const isEdit = !!employee
  const [form, setForm] = useState(isEdit ? employee : emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee()
  const archiveMutation = useArchiveEmployee()
  const restoreMutation = useRestoreEmployee()
  const deleteMutation = useDeleteEmployee()
  const { data: departments = [] } = useDepartments()

  useEffect(() => {
    console.log(`[FORM] Эффект: employee или open изменились`, { employee: employee?.id, open })
    if (employee) {
      console.log(`[FORM] Загрузка данных сотрудника:`, employee)
      setForm(employee)
    } else {
      console.log(`[FORM] Очистка формы`)
      setForm(emptyForm)
    }
    setErrors({})
  }, [employee, open])

  const updateField = (field: string, value: string | boolean | number | null) => {
    console.log(`[FORM] Изменение поля: ${field}`, { oldValue: form[field as keyof typeof form], newValue: value })
    setForm((prev) => {
      const updated = { ...prev, [field]: value }
      console.log(`[FORM] Состояние формы обновлено:`, updated)
      return updated
    })
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    console.log(`[FORM] Валидация формы`)
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) {
      newErrors.name = "ФИО обязательно"
      console.log(`[FORM] Ошибка: ФИО пусто`)
    }
    if (!form.department.trim()) {
      newErrors.department = "Подразделение обязательно"
      console.log(`[FORM] Ошибка: Подразделение пусто`)
    }
    if (!form.position.trim()) {
      newErrors.position = "Должность обязательна"
      console.log(`[FORM] Ошибка: Должность пуста`)
    }
    setErrors(newErrors)
    const isValid = Object.keys(newErrors).length === 0
    console.log(`[FORM] Результат валидации: ${isValid ? 'OK' : 'ОШИБКИ'}`, newErrors)
    return isValid
  }

  const handleSubmit = () => {
    console.log(`[FORM] handleSubmit вызван, isEdit=${isEdit}`)
    if (!validate()) {
      console.log(`[FORM] Валидация не пройдена`)
      return
    }
    console.log(`[FORM] Отправка данных:`, form)
    if (isEdit && employee) {
      console.log(`[FORM] Обновление сотрудника ID=${employee.id}`)
      // Отправляем только редактируемые поля, исключая readonly поля
      const updateData: EmployeeUpdate = {
        name: form.name,
        tab_number: form.tab_number,
        department: form.department,
        position: form.position,
        hire_date: form.hire_date,
        birth_date: form.birth_date,
        gender: form.gender,
        citizenship: form.citizenship,
        residency: form.residency,
        pensioner: form.pensioner,
        payment_form: form.payment_form,
        rate: form.rate,
        contract_start: form.contract_start,
        contract_end: form.contract_end,
        personal_number: form.personal_number,
        insurance_number: form.insurance_number,
        passport_number: form.passport_number,
      }
      console.log(`[FORM] Данные для обновления:`, updateData)
      updateMutation.mutate(
        { employeeId: employee.id, data: updateData },
        {
          onSuccess: () => {
            console.log(`[FORM] Сотрудник успешно обновлен, ждем 500ms перед закрытием`)
            setTimeout(() => {
              console.log(`[FORM] Закрытие формы`)
              onOpenChange(false)
            }, 500)
          },
          onError: (error) => {
            console.error(`[FORM] Ошибка при обновлении:`, error)
          },
        }
      )
    } else {
      console.log(`[FORM] Создание нового сотрудника`)
      createMutation.mutate(form as EmployeeCreate, {
        onSuccess: () => {
          console.log(`[FORM] Сотрудник успешно создан, ждем 500ms перед закрытием`)
          setTimeout(() => {
            console.log(`[FORM] Закрытие формы`)
            onOpenChange(false)
          }, 500)
        },
        onError: (error) => {
          console.error(`[FORM] Ошибка при создании:`, error)
        },
      })
    }
  }

  const handleArchive = () => {
    console.log(`[FORM] handleArchive вызван`)
    if (!employee) {
      console.log(`[FORM] Нет данных сотрудника`)
      return
    }
    console.log(`[FORM] Увольнение сотрудника ID=${employee.id}`)
    archiveMutation.mutate(
      { employeeId: employee.id },
      {
        onSuccess: () => {
          console.log(`[FORM] Сотрудник успешно уволен`)
          setShowArchiveDialog(false)
          onOpenChange(false)
        },
        onError: (error) => {
          console.error(`[FORM] Ошибка при увольнении:`, error)
        },
      }
    )
  }

  const handleRestore = () => {
    console.log(`[FORM] handleRestore вызван`)
    if (!employee) {
      console.log(`[FORM] Нет данных сотрудника`)
      return
    }
    console.log(`[FORM] Восстановление сотрудника ID=${employee.id}`)
    restoreMutation.mutate(employee.id, {
      onSuccess: () => {
        console.log(`[FORM] Сотрудник успешно восстановлен`)
        onOpenChange(false)
      },
      onError: (error) => {
        console.error(`[FORM] Ошибка при восстановлении:`, error)
      },
    })
  }

  const handleDelete = () => {
    console.log(`[FORM] handleDelete вызван`)
    if (!employee) {
      console.log(`[FORM] Нет данных сотрудника`)
      return
    }
    console.log(`[FORM] Удаление сотрудника ID=${employee.id}`)
    deleteMutation.mutate(
      { employeeId: employee.id, hard: true, confirm: true },
      {
        onSuccess: () => {
          console.log(`[FORM] Сотрудник успешно удален`)
          setShowDeleteDialog(false)
          onOpenChange(false)
        },
        onError: (error) => {
          console.error(`[FORM] Ошибка при удалении:`, error)
        },
      }
    )
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isEdit ? "Редактировать сотрудника" : "Новый сотрудник"}</DialogTitle>
            {isEdit && employee && (
              <Badge variant={employee.is_archived ? "warning" : employee.is_deleted ? "destructive" : "success"}>
                {employee.is_deleted ? "Удалён" : employee.is_archived ? "В архиве" : "Активен"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2 overflow-y-auto flex-1">
          <div className="grid grid-cols-[1fr_120px_130px] gap-4">
            <div>
              <label className="text-sm font-medium">ФИО *</label>
              <Input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Пол</label>
              <Select
                value={form.gender || ""}
                onValueChange={(v) => updateField("gender", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не указан" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="М">Мужской</SelectItem>
                  <SelectItem value="Ж">Женский</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <DatePicker
                label="Дата рождения"
                value={form.birth_date || ""}
                onChange={(value) => updateField("birth_date", value || null)}
              />
            </div>
          </div>

          <div className="grid grid-cols-[100px_1fr_1fr] gap-4">
            <div>
              <label className="text-sm font-medium">Таб.№</label>
              <Input
                type="number"
                value={form.tab_number ?? ""}
                onChange={(e) => updateField("tab_number", e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Должность *</label>
              <Input
                value={form.position}
                onChange={(e) => updateField("position", e.target.value)}
                className={errors.position ? "border-red-500" : ""}
              />
              {errors.position && <p className="text-xs text-red-500 mt-1">{errors.position}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Подразделение *</label>
              <Select
                value={form.department}
                onValueChange={(v) => updateField("department", v)}
              >
                <SelectTrigger className={errors.department ? "border-red-500" : ""}>
                  <SelectValue placeholder="Выберите подразделение" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      <div className="flex items-center">
                        <Building className="h-4 w-4 mr-2" />
                        {d}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.department && <p className="text-xs text-red-500 mt-1">{errors.department}</p>}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Статусы</label>
            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="citizenship"
                  checked={form.citizenship}
                  onCheckedChange={(checked: boolean) => updateField("citizenship", checked === true)}
                />
                <label htmlFor="citizenship" className="text-sm cursor-pointer">
                  Гражданство РБ
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="residency"
                  checked={form.residency}
                  onCheckedChange={(checked: boolean) => updateField("residency", checked === true)}
                />
                <label htmlFor="residency" className="text-sm cursor-pointer">
                  Резидент РБ
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pensioner"
                  checked={form.pensioner}
                  onCheckedChange={(checked: boolean) => updateField("pensioner", checked === true)}
                />
                <label htmlFor="pensioner" className="text-sm cursor-pointer">
                  Пенсионер
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[130px_140px_80px] gap-4">
            <div>
              <DatePicker
                label="Дата приёма"
                value={form.hire_date || ""}
                onChange={(value) => updateField("hire_date", value || null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Форма оплаты</label>
              <Select
                value={form.payment_form || ""}
                onValueChange={(v) => updateField("payment_form", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не указана" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Повременная">Повременная</SelectItem>
                  <SelectItem value="Сдельная">Сдельная</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Ставка</label>
              <Input
                type="number"
                step="0.1"
                value={form.rate ?? ""}
                onChange={(e) => updateField("rate", e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-[130px_130px] gap-4">
            <div>
              <DatePicker
                label="Начало контракта"
                value={form.contract_start || ""}
                onChange={(value) => updateField("contract_start", value || null)}
              />
            </div>
            <div>
              <DatePicker
                label="Окончание контракта"
                value={form.contract_end || ""}
                onChange={(value) => updateField("contract_end", value || null)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Личный номер</label>
              <Input
                value={form.personal_number || ""}
                onChange={(e) => updateField("personal_number", e.target.value || null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Страховой номер</label>
              <Input
                value={form.insurance_number || ""}
                onChange={(e) => updateField("insurance_number", e.target.value || null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Паспорт</label>
              <Input
                value={form.passport_number || ""}
                onChange={(e) => updateField("passport_number", e.target.value || null)}
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-2 flex items-center justify-between gap-4 shrink-0">
          <div className="flex gap-2">
            {isEdit && employee && !employee.is_deleted && (
              <>
                {!employee.is_archived && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={() => setShowArchiveDialog(true)}
                    disabled={archiveMutation.isPending}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Уволить (в архив)
                  </Button>
                )}

                {employee.is_archived && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-green-600 border-green-200 hover:bg-green-50"
                    onClick={handleRestore}
                    disabled={restoreMutation.isPending}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Восстановить
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить навсегда
                </Button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Закрыть
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Уволить сотрудника?</AlertDialogTitle>
          <AlertDialogDescription>
            Сотрудник {employee?.name} будет перемещён в архив. Вы сможете восстановить его позже.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArchive}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Уволить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить сотрудника навсегда?</AlertDialogTitle>
          <AlertDialogDescription>
            Сотрудник {employee?.name} будет удалён безвозвратно. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700"
          >
            Удалить навсегда
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}
