import { Fragment } from "react"
import { Download, Eye, Printer, Trash2 } from "lucide-react"
import { SortableFilterHeader } from "@/shared/ui/sortable-filter-header"
import { GroupOrderEmployeesRows } from "@/entities/order/ui/GroupOrderEmployeesRows"
import { downloadOrderDocx, openOrderPrint, openOrderView } from "@/entities/order/orderActions"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/tabs"
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
import { formatDate } from "@/shared/utils/date"
import { callPeriodLabel } from "./lib"
import { useAbsenceOrdersPage } from "./useAbsenceOrdersPage"
import { GroupFormBody, SingleFormBody } from "./forms"
import type { AbsencePageConfig } from "./types"

/**
 * Общий каркас страниц приказов-отсутствий («Отпуск за свой счёт» и
 * «Вызовы в выходные дни»): вкладки одиночной/групповой формы, сводная таблица
 * по сотрудникам, сортируемые/фильтруемые таблицы и восстановление форм.
 * Различия страниц описываются конфигом приказа (см. AbsencePageConfig).
 */
export function AbsenceOrdersPage({ config }: { config: AbsencePageConfig }) {
  const api = useAbsenceOrdersPage(config)
  const c = api.config

  const onFilterChange = (field: string, selected: Set<string>) => {
    api.setColumnFilters((prev) => ({ ...prev, [field]: selected }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{c.title}</h1>
      </div>

      <div className="border rounded-lg bg-card">
        <Tabs value={api.orderMode} onValueChange={(v) => api.setOrderMode(v as "single" | "group")}>
          <div className="px-4 py-3 border-b">
            <TabsList>
              <TabsTrigger value="single">Один сотрудник</TabsTrigger>
              <TabsTrigger value="group">Групповой приказ</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="single" className="px-4 py-4 m-0">
            <SingleFormBody api={api} />
          </TabsContent>

          <TabsContent value="group" className="px-4 py-4 m-0">
            <GroupFormBody api={api} />
          </TabsContent>
        </Tabs>
      </div>

      {api.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : api.orders.length === 0 ? (
        <EmptyState message="Нет приказов" description={c.emptyStateDescription} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant={api.periodMode === "calendarYear" ? "default" : "outline"} onClick={api.setCalendarYearPeriod}>
              Календарный год
            </Button>
            <Button size="sm" variant={api.periodMode === "all" ? "default" : "outline"} onClick={api.setAllPeriod}>
              Весь период
            </Button>
            <div className="w-[220px]">
              <Input
                placeholder="Поиск сотрудника"
                value={api.employeeFilter}
                onChange={(event) => api.setEmployeeFilter(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap lg:flex-nowrap items-end gap-2">
            <div data-testid={c.testids.periodFrom} className="w-[132px]">
              <DatePicker
                placeholder="Период с"
                value={api.periodStart}
                onChange={(value) => {
                  api.setPeriodMode("all")
                  api.setPeriodStart(value)
                }}
              />
            </div>
            <div data-testid={c.testids.periodTo} className="w-[132px]">
              <DatePicker
                placeholder="Период по"
                value={api.periodEnd}
                onChange={(value) => {
                  api.setPeriodMode("all")
                  api.setPeriodEnd(value)
                }}
              />
            </div>
            <div className="px-3 h-10 border rounded-md bg-card flex items-center min-w-[250px]">
              <p data-testid={c.testids.totalOrders} className="text-sm font-medium">{c.testids.totalLabel}: {api.totalOrders}</p>
            </div>
            <div className="px-3 h-10 border rounded-md bg-card flex items-center min-w-[220px]">
              <p data-testid={c.testids.totalDays} className="text-sm font-medium">{c.testids.daysLabel}: {api.totalDays}</p>
            </div>
          </div>

          {api.periodError && <p className="text-xs text-red-500">{api.periodError}</p>}

          {(c.summaryAlwaysRender || api.employeesSummary.length > 0) && (
            <div className="w-fit">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="w-28 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => api.employeesSummary.length > 0 && api.setShowEmployeesTable(!api.showEmployeesTable)}
                    >
                      {api.employeesSummary.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          {api.showEmployeesTable ? "▾ Скрыть" : "▸ Показать"}
                        </span>
                      )}
                    </TableHead>
                    <TableHead className="p-0">
                      <SortableFilterHeader
                        field="name"
                        label="Сотрудник"
                        currentSorts={api.summarySortConfigs}
                        onSortChange={api.handleSummarySort}
                        values={api.summaryUniqueValues.name}
                        selectedValues={api.summaryColumnFilters.name}
                        onFilterChange={api.handleSummaryFilter}
                      />
                    </TableHead>
                    <TableHead className="p-0">
                      <SortableFilterHeader
                        field="second"
                        label={c.summarySecondLabel}
                        currentSorts={api.summarySortConfigs}
                        onSortChange={api.handleSummarySort}
                        values={api.summaryUniqueValues.second}
                        selectedValues={api.summaryColumnFilters.second}
                        onFilterChange={api.handleSummaryFilter}
                      />
                    </TableHead>
                    <TableHead className="p-0">
                      <SortableFilterHeader
                        field="third"
                        label={c.summaryThirdLabel}
                        currentSorts={api.summarySortConfigs}
                        onSortChange={api.handleSummarySort}
                        values={api.summaryUniqueValues.third}
                        selectedValues={api.summaryColumnFilters.third}
                        onFilterChange={api.handleSummaryFilter}
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                {api.showEmployeesTable && (
                  <TableBody>
                    {api.displayedEmployeesSummary.length > 0 ? (
                      api.displayedEmployeesSummary.map((employee) => (
                        <TableRow key={employee.name}>
                          <TableCell className="w-10" />
                          <TableCell className="font-medium">{employee.name}</TableCell>
                          <TableCell>{employee.second}</TableCell>
                          <TableCell>{employee.third}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      c.summaryAlwaysRender && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                            {c.emptySummaryText}
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                )}
              </Table>
            </div>
          )}

          {api.displayOrders.length === 0 ? (
            <EmptyState message={c.emptyTableMessage} description={c.emptyTableDescription} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="order_number"
                      label="№"
                      currentSorts={api.sortConfigs}
                      onSortChange={api.handleSort}
                      values={api.uniqueValues.order_number}
                      selectedValues={api.columnFilters.order_number}
                      onFilterChange={onFilterChange}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="employee_name"
                      label="Сотрудник"
                      currentSorts={api.sortConfigs}
                      onSortChange={api.handleSort}
                      values={api.uniqueValues.employee_name}
                      selectedValues={api.columnFilters.employee_name}
                      onFilterChange={onFilterChange}
                    />
                  </TableHead>
                  {c.kind === "vacation" ? (
                    <>
                      <TableHead className="p-0">
                        <SortableFilterHeader
                          field="period"
                          label="Период"
                          currentSorts={api.sortConfigs}
                          onSortChange={api.handleSort}
                          values={api.uniqueValues.period}
                          selectedValues={api.columnFilters.period}
                          onFilterChange={onFilterChange}
                        />
                      </TableHead>
                      <TableHead className="p-0">
                        <SortableFilterHeader
                          field="days"
                          label="Дней"
                          currentSorts={api.sortConfigs}
                          onSortChange={api.handleSort}
                          values={api.uniqueValues.days}
                          selectedValues={api.columnFilters.days}
                          onFilterChange={onFilterChange}
                        />
                      </TableHead>
                    </>
                  ) : (
                    <TableHead className="p-0">
                      <SortableFilterHeader
                        field="call_date"
                        label="Дата вызова"
                        currentSorts={api.sortConfigs}
                        onSortChange={api.handleSort}
                        values={api.uniqueValues.call_date}
                        selectedValues={api.columnFilters.call_date}
                        onFilterChange={onFilterChange}
                      />
                    </TableHead>
                  )}
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="order_date"
                      label="Дата приказа"
                      currentSorts={api.sortConfigs}
                      onSortChange={api.handleSort}
                      values={api.uniqueValues.order_date}
                      selectedValues={api.columnFilters.order_date}
                      onFilterChange={onFilterChange}
                    />
                  </TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {api.displayOrders.map((order) => {
                  const extra = (order.extra_fields || {}) as Record<string, unknown>
                  const isGroup = order.is_group

                  return (
                    <Fragment key={order.id}>
                      <TableRow>
                        <TableCell className="font-mono">{order.order_number}</TableCell>
                        <TableCell>
                          {isGroup ? (
                            <span className="font-medium">Групповой приказ — {order.group_employee_count || 0} сотрудников</span>
                          ) : (
                            order.employee_name || "—"
                          )}
                        </TableCell>
                        {c.kind === "vacation" ? (
                          <>
                            <TableCell>
                              {isGroup ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <>{formatDate(String(extra.vacation_start || ""))} — {formatDate(String(extra.vacation_end || ""))}</>
                              )}
                            </TableCell>
                            <TableCell>
                              {isGroup ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                extra.vacation_days ? String(extra.vacation_days) : "—"
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell>
                            {isGroup ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              callPeriodLabel(extra)
                            )}
                          </TableCell>
                        )}
                        <TableCell>{formatDate(order.order_date)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Просмотр DOCX" onClick={() => openOrderView(order.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Печать" onClick={() => openOrderPrint(order.id)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Скачать приказ" onClick={() => downloadOrderDocx(order.id)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Удалить приказ"
                              onClick={() => api.setDeleteOrderId(order.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isGroup && order.group_employees && (
                        <GroupOrderEmployeesRows
                          employees={api.getDisplayGroupEmployees(order)}
                          type={c.groupRowsType}
                          orderNumber={order.order_number}
                        />
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <AlertDialog open={api.deleteOrderId !== null} onOpenChange={(open) => !open && api.setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить приказ безвозвратно?</AlertDialogTitle>
            <AlertDialogDescription>
              Приказ будет удален безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={api.handleDeleteOrderConfirm} className="bg-red-600 hover:bg-red-700">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение перезаписи сохранённого заполнения (#28) */}
      {c.renderOverwriteDialogsByMode ? (
        <>
          {api.orderMode === "single" && api.recoveryOverwriteDialog}
          {api.orderMode === "group" && api.groupRecoveryOverwriteDialog}
        </>
      ) : (
        <>
          {api.recoveryOverwriteDialog}
          {api.groupRecoveryOverwriteDialog}
        </>
      )}
    </div>
  )
}
