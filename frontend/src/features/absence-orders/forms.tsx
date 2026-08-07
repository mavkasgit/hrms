import { FilePen, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DocumentDatePicker } from "@/shared/ui/document-date-picker"
import { EmployeeSearch } from "@/features/employee-search"
import { OrderNumberField } from "@/features/OrderNumberField"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import { formatDate } from "@/shared/utils/date"
import { getApiErrorDetail } from "./lib"
import type { AbsenceOrdersApi } from "./useAbsenceOrdersPage"
import type { CallMode, MutationUiState } from "./types"

/** Текст ошибки мутации по стандартной схеме ответа API. */
function ErrorText({ mutation, fallback }: { mutation: MutationUiState; fallback: string }) {
  if (!mutation.isError) return null
  return <p className="text-sm text-red-600">{getApiErrorDetail(mutation.error, fallback)}</p>
}

interface CallModeFieldsProps {
  mode: CallMode
  onModeChange: (mode: CallMode) => void
  callDate: string
  onCallDateChange: (value: string) => void
  callDateStart: string
  onCallDateStartChange: (value: string) => void
  callDateEnd: string
  onCallDateEndChange: (value: string) => void
  errors: Record<string, string>
}

/** Переключатель «Один день / Период» + условные поля дат (вызовы в выходные). */
function CallModeFields({
  mode,
  onModeChange,
  callDate,
  onCallDateChange,
  callDateStart,
  onCallDateStartChange,
  callDateEnd,
  onCallDateEndChange,
  errors,
}: CallModeFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Режим</label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "single" ? "default" : "outline"}
            onClick={() => {
              onModeChange("single")
              onCallDateStartChange("")
              onCallDateEndChange("")
            }}
          >
            Один день
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "range" ? "default" : "outline"}
            onClick={() => {
              onModeChange("range")
              onCallDateChange("")
            }}
          >
            Период
          </Button>
        </div>
      </div>
      {mode === "single" ? (
        <div className="w-[130px]">
          <DocumentDatePicker label="Дата вызова *" value={callDate} onChange={onCallDateChange} />
          {errors.callDate && <p className="text-xs text-red-500 mt-1">{errors.callDate}</p>}
        </div>
      ) : (
        <>
          <div className="w-[130px]">
            <DocumentDatePicker label="Дата начала *" value={callDateStart} onChange={onCallDateStartChange} />
            {errors.callDateStart && <p className="text-xs text-red-500 mt-1">{errors.callDateStart}</p>}
          </div>
          <div className="w-[130px]">
            <DocumentDatePicker label="Дата конца *" value={callDateEnd} onChange={onCallDateEndChange} />
            {errors.callDateEnd && <p className="text-xs text-red-500 mt-1">{errors.callDateEnd}</p>}
          </div>
        </>
      )}
    </>
  )
}

/** Одиночная форма: поля зависят от kind конфига (vacation / call). */
export function SingleFormBody({ api }: { api: AbsenceOrdersApi }) {
  const kind = api.config.single.kind
  return (
    <div className="grid gap-4">
      <div className="flex gap-4">
        <EmployeeSearch
          value={api.selectedEmployee}
          onChange={(emp) => {
            api.setSelectedEmployee(emp)
            if (emp) api.setErrors((prev) => ({ ...prev, employee: "" }))
          }}
          error={api.errors.employee}
          required
        />
      </div>

      <div className="flex gap-4">
        <div className="w-[130px]">
          <DocumentDatePicker label="Дата приказа *" value={api.orderDate} onChange={api.setOrderDate} warnIfFuture />
          {api.errors.orderDate && <p className="text-xs text-red-500 mt-1">{api.errors.orderDate}</p>}
        </div>
        <OrderNumberField
          value={api.orderNumber}
          onChange={api.setOrderNumber}
          orderTypeId={api.orderType?.id}
          orderTypes={api.orderTypes}
          required
          error={api.errors.orderNumber}
        />
        {kind === "vacation" ? (
          <>
            <div className="w-[130px]">
              <DocumentDatePicker label="Дата начала *" value={api.vacationStart} onChange={api.setVacationStart} />
              {api.errors.vacationStart && <p className="text-xs text-red-500 mt-1">{api.errors.vacationStart}</p>}
            </div>
            <div className="w-[130px]">
              <DocumentDatePicker label="Дата конца *" value={api.vacationEnd} onChange={api.setVacationEnd} />
              {api.errors.vacationEnd && <p className="text-xs text-red-500 mt-1">{api.errors.vacationEnd}</p>}
            </div>
            <div className="w-[110px]">
              <label className="text-sm font-medium">Дней *</label>
              <Input
                type="number"
                min="1"
                value={api.vacationDays}
                onChange={(event) => api.setVacationDays(event.target.value)}
                className={api.errors.vacationDays ? "border-red-500" : ""}
              />
              {api.errors.vacationDays && <p className="text-xs text-red-500 mt-1">{api.errors.vacationDays}</p>}
            </div>
          </>
        ) : (
          <CallModeFields
            mode={api.mode}
            onModeChange={api.setMode}
            callDate={api.callDate}
            onCallDateChange={api.setCallDate}
            callDateStart={api.callDateStart}
            onCallDateStartChange={api.setCallDateStart}
            callDateEnd={api.callDateEnd}
            onCallDateEndChange={api.setCallDateEnd}
            errors={api.errors}
          />
        )}
      </div>

      {api.errors.orderType && <p className="text-sm text-red-600">{api.errors.orderType}</p>}
      <ErrorText mutation={api.createDraftMutation} fallback="Ошибка подготовки приказа" />
      <ErrorText mutation={api.commitDraftMutation} fallback="Ошибка создания приказа" />

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={api.resetForm}
          disabled={api.createDraftMutation.isPending || api.commitDraftMutation.isPending || api.deleteDraftMutation.isPending}
        >
          Очистить
        </Button>
        {!api.draftId ? (
          <Button size="sm" onClick={api.handleEditBeforeCreate} disabled={api.createDraftMutation.isPending || !api.orderType}>
            <FilePen className="mr-2 h-4 w-4" />
            {api.createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
          </Button>
        ) : (
          <Button size="sm" onClick={() => api.handleCommitDraft()} disabled={api.commitDraftMutation.isPending}>
            {api.commitDraftMutation.isPending ? "Создание..." : "Создать"}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Таблица сотрудников групповой формы (колонки дней/даты окончания — только unpaid). */
function GroupEmployeesSection({
  api,
  showDays,
}: {
  api: AbsenceOrdersApi
  showDays: boolean
}) {
  return (
    <div className="space-y-2">
      {api.groupErrors.employees && <p className="text-xs text-red-500">{api.groupErrors.employees}</p>}

      <div className="flex gap-2 items-center">
        <EmployeeSearch
          value={null}
          onChange={(emp) => {
            if (emp) {
              api.addGroupEmployee(emp)
            }
          }}
          placeholder="Добавить сотрудника..."
        />
      </div>

      {api.groupEmployees.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Должность</TableHead>
              <TableHead>Подразделение</TableHead>
              {showDays && <TableHead className="w-[120px]">Дней</TableHead>}
              {showDays && <TableHead className="w-[150px]">Дата окончания</TableHead>}
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {api.groupEmployees.map((emp) => (
              <TableRow key={emp.employee_id}>
                <TableCell>{emp.employee.name}</TableCell>
                <TableCell>{emp.employee.position?.name || "—"}</TableCell>
                <TableCell>{emp.employee.department?.name || "—"}</TableCell>
                {showDays && (
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      value={emp.vacation_days > 0 ? emp.vacation_days : ""}
                      onChange={(e) => api.updateGroupEmployeeDays(emp.employee_id, e.target.value)}
                    />
                    {api.groupErrors[`employee_${emp.employee_id}`] && (
                      <p className="text-xs text-red-500 mt-1">{api.groupErrors[`employee_${emp.employee_id}`]}</p>
                    )}
                  </TableCell>
                )}
                {showDays && <TableCell>{formatDate(emp.vacation_end_calculated || "")}</TableCell>}
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => api.removeGroupEmployee(emp.employee_id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/** Групповая форма: поля зависят от kind конфига (vacation / call). */
export function GroupFormBody({ api }: { api: AbsenceOrdersApi }) {
  const kind = api.config.group.kind
  return (
    <div className="grid gap-4">
      <div className="flex gap-4">
        <div className="w-[130px]">
          <DocumentDatePicker label="Дата приказа *" value={api.orderDate} onChange={api.setOrderDate} warnIfFuture />
          {api.groupErrors.orderDate && <p className="text-xs text-red-500 mt-1">{api.groupErrors.orderDate}</p>}
        </div>
        <OrderNumberField
          value={api.orderNumber}
          onChange={api.setOrderNumber}
          orderTypeId={api.orderType?.id}
          orderTypes={api.orderTypes}
          required
          error={api.groupErrors.orderNumber}
        />
        {kind === "vacation" ? (
          <div className="w-[130px]">
            <DocumentDatePicker label="Дата начала отпуска *" value={api.groupVacationStart} onChange={api.setGroupVacationStartAndRecalc} />
            {api.groupErrors.vacationStart && <p className="text-xs text-red-500 mt-1">{api.groupErrors.vacationStart}</p>}
          </div>
        ) : (
          <CallModeFields
            mode={api.groupCallMode}
            onModeChange={api.setGroupCallMode}
            callDate={api.groupCallDate}
            onCallDateChange={api.setGroupCallDate}
            callDateStart={api.groupCallDateStart}
            onCallDateStartChange={api.setGroupCallDateStart}
            callDateEnd={api.groupCallDateEnd}
            onCallDateEndChange={api.setGroupCallDateEnd}
            errors={api.groupErrors}
          />
        )}
      </div>

      <GroupEmployeesSection api={api} showDays={kind === "vacation"} />

      {api.groupErrors.orderType && <p className="text-sm text-red-600">{api.groupErrors.orderType}</p>}
      <ErrorText mutation={api.createGroupOrderMutation} fallback="Ошибка создания группового приказа" />
      <ErrorText mutation={api.createGroupDraftMutation} fallback="Ошибка подготовки группового приказа" />
      <ErrorText mutation={api.commitGroupDraftMutation} fallback="Ошибка создания группового приказа" />

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={api.resetGroupForm}
          disabled={api.createGroupOrderMutation.isPending || api.createGroupDraftMutation.isPending || api.commitGroupDraftMutation.isPending}
        >
          Очистить
        </Button>
        {!api.groupDraftId ? (
          <Button
            size="sm"
            onClick={api.handleCreateGroupDraft}
            disabled={api.createGroupDraftMutation.isPending || (api.config.group.requireOrderType && !api.orderType)}
          >
            <FilePen className="mr-2 h-4 w-4" />
            {api.createGroupDraftMutation.isPending ? "Подготовка..." : api.config.group.createButtonLabel}
          </Button>
        ) : (
          <Button size="sm" onClick={api.handleCommitGroupDraft} disabled={api.commitGroupDraftMutation.isPending}>
            {api.commitGroupDraftMutation.isPending ? "Создание..." : "Создать"}
          </Button>
        )}
      </div>
    </div>
  )
}
