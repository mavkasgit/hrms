import { useState, useEffect, useCallback, useMemo } from "react"
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
  useResetEmployeePeriods,
} from "@/entities/employee/useEmployees"
import { Archive, Trash2, RotateCcw, Building, Briefcase } from "lucide-react"
import { useDepartments, useCreateDepartment } from "@/entities/department"
import { usePositions, useCreatePosition } from "@/entities/position"
import { ComboboxCreate } from "@/shared/ui/combobox-create"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

interface EmployeeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null
}

const emptyForm: EmployeeCreate = {
  name: "",
  department_id: null as unknown as number,
  position_id: null as unknown as number,
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
  const [showHireDateDialog, setShowHireDateDialog] = useState(false)
  const [pendingUpdateData, setPendingUpdateData] = useState<EmployeeUpdate | null>(null)
  const [isRecalculating, setIsRecalculating] = useState(false)

  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee()
  const archiveMutation = useArchiveEmployee()
  const restoreMutation = useRestoreEmployee()
  const deleteMutation = useDeleteEmployee()
  const resetPeriodsMutation = useResetEmployeePeriods()
  const createDept = useCreateDepartment()
  const createPos = useCreatePosition()
  const { data: departments = [] } = useDepartments()
  const { data: positions = [] } = usePositions()

  // Приводим к общему виду { id, name }
  const deptItems = useMemo(
    () => departments.map((d) => ({ id: d.id, name: d.name })),
    [departments]
  )
  const posItems = useMemo(
    () => positions.map((p) => ({ id: p.id, name: p.name })),
    [positions]
  )

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
    }
    if (!form.department_id) {
      newErrors.department = "Подразделение обязательно"
    }
    if (!form.position_id) {
      newErrors.position = "Должность обязательна"
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
        department_id: form.department_id,
        position_id: form.position_id,
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

      // Если изменилась дата приёма — показываем диалог ПЕРЕД отправкой
      if (employee.hire_date !== form.hire_date) {
        setPendingUpdateData(updateData)
        setShowHireDateDialog(true)
        return
      }

      // Обычное обновление без изменения hire_date
      updateMutation.mutate(
        { employeeId: employee.id, data: updateData },
        {
          onSuccess: () => {
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

  const handleConfirmHireDateChange = () => {
    console.log(`[FORM] handleConfirmHireDateChange вызван`)
    if (!employee || !pendingUpdateData) {
      console.log(`[FORM] Нет данных для обновления`)
      return
    }
    console.log(`[FORM] Сохранение hire_date и пересоздание периодов для employeeId=${employee.id}`)
    setIsRecalculating(true)
    const startTime = Date.now()

    const finishRecalculate = () => {
      const elapsed = Date.now() - startTime
      const minDelay = 1500
      const remaining = Math.max(0, minDelay - elapsed)
      setTimeout(() => {
        setIsRecalculating(false)
        setShowHireDateDialog(false)
      }, remaining)
    }

    updateMutation.mutate(
      { employeeId: employee.id, data: pendingUpdateData },
      {
        onSuccess: (data) => {
          console.log(`[FORM] Сотрудник успешно обновлен`, data)
          if (data.periods_need_reset) {
            resetPeriodsMutation.mutate(employee.id, {
              onSettled: () => {
                finishRecalculate()
              },
              onSuccess: () => {
                console.log(`[FORM] Периоды успешно пересозданы`)
                setPendingUpdateData(null)
                setTimeout(() => {
                  onOpenChange(false)
                }, 500)
              },
              onError: (error) => {
                console.error(`[FORM] Ошибка при пересоздании периодов:`, error)
              },
            })
          } else {
            finishRecalculate()
            setPendingUpdateData(null)
            setTimeout(() => {
              onOpenChange(false)
            }, 500)
          }
        },
        onError: (error) => {
          finishRecalculate()
          console.error(`[FORM] Ошибка при обновлении сотрудника:`, error)
        },
      }
    )
  }

  const handleCancelHireDateChange = () => {
    console.log(`[FORM] Пользователь отменил изменение hire_date — откатываем только hire_date`)
    if (employee) {
      updateField("hire_date", employee.hire_date ?? null)
    }
    setShowHireDateDialog(false)
    setPendingUpdateData(null)
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

  // Создание подразделения / должности «на лету»
  const handleCreateDepartment = useCallback(async (name: string): Promise<number> => {
    const newDept = await createDept.mutateAsync({ name, rank: 1 })
    return newDept.id
  }, [createDept])

  const handleCreatePosition = useCallback(async (name: string): Promise<number> => {
    const newPos = await createPos.mutateAsync({ name })
    return newPos.id
  }, [createPos])

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
                onValueChange={(v: string) => updateField("gender", v || null)}
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
              <ComboboxCreate
                value={form.position_id}
                onChange={(id) => updateField("position_id", id)}
                items={posItems}
                onCreate={handleCreatePosition}
                placeholder="Выберите или создайте"
                icon={<Briefcase className="h-4 w-4" />}
                error={errors.position}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Подразделение *</label>
              <ComboboxCreate
                value={form.department_id}
                onChange={(id) => updateField("department_id", id)}
                items={deptItems}
                onCreate={handleCreateDepartment}
                placeholder="Выберите или создайте"
                icon={<Building className="h-4 w-4" />}
                error={errors.department}
              />
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

    <AlertDialog open={showHireDateDialog} onOpenChange={setShowHireDateDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Изменилась дата приёма</AlertDialogTitle>
          <AlertDialogDescription>
            Периоды отпусков будут пересозданы от новой даты.
            Все закрытия и списания будут потеряны. Продолжить?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelHireDateChange}>
            Отмена
          </AlertDialogCancel>
          <Button
            onClick={handleConfirmHireDateChange}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isRecalculating}
          >
            {isRecalculating ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Пересоздание...
              </span>
            ) : (
              "Пересоздать периоды"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}
