import { createBrowserRouter } from "react-router-dom"
import { Suspense, lazy } from "react"
import type { ReactNode } from "react"
import { Layout } from "./Layout"

const DashboardPage = lazy(async () => ({ default: (await import("@/pages/DashboardPage")).DashboardPage }))
const EmployeesPage = lazy(async () => ({ default: (await import("@/pages/EmployeesPage")).EmployeesPage }))
const StructurePage = lazy(async () => ({ default: (await import("@/pages/StructurePage")).StructurePage }))
const OrdersPage = lazy(async () => ({ default: (await import("@/pages/OrdersPage")).OrdersPage }))
const NotificationsPage = lazy(async () => ({ default: (await import("@/pages/NotificationsPage")).NotificationsPage }))
const StatementsPage = lazy(async () => ({ default: (await import("@/pages/StatementsPage")).StatementsPage }))
const VacationsPage = lazy(async () => ({ default: (await import("@/pages/vacations/VacationsPage")).VacationsPage }))
const VacationRecallPage = lazy(async () => ({ default: (await import("@/pages/vacations/VacationRecallPage")).VacationRecallPage }))
const VacationPostponePage = lazy(async () => ({ default: (await import("@/pages/vacations/VacationPostponePage")).VacationPostponePage }))
const VacationExtensionPage = lazy(async () => ({ default: (await import("@/pages/vacations/VacationExtensionPage")).VacationExtensionPage }))
const UnpaidLeavesPage = lazy(async () => ({ default: (await import("@/pages/UnpaidLeavesPage")).UnpaidLeavesPage }))
const WeekendCallsPage = lazy(async () => ({ default: (await import("@/pages/WeekendCallsPage")).WeekendCallsPage }))
const SickLeavesPage = lazy(async () => ({ default: (await import("@/pages/SickLeavesPage")).SickLeavesPage }))
const VacationCalendarPage = lazy(async () => ({ default: (await import("@/pages/VacationCalendarPage")).VacationCalendarPage }))
const TemplatesPage = lazy(async () => ({ default: (await import("@/pages/TemplatesPage")).TemplatesPage }))
const SettingsPage = lazy(async () => ({ default: (await import("@/pages/SettingsPage")).SettingsPage }))
const HolidaysPage = lazy(async () => ({ default: (await import("@/pages/HolidaysPage")).HolidaysPage }))
const BackupsPage = lazy(async () => ({ default: (await import("@/pages/BackupsPage")).BackupsPage }))
const LoginPage = lazy(async () => ({ default: (await import("@/pages/LoginPage")).LoginPage }))
const DevPage = lazy(async () => ({ default: (await import("@/pages/DevPage")).DevPage }))
const OrderEditorPage = lazy(async () => ({ default: (await import("@/pages/OrderEditorPage")).OrderEditorPage }))
const DraftOrderEditorPage = lazy(async () => ({ default: (await import("@/pages/DraftOrderEditorPage")).DraftOrderEditorPage }))
const DocumentViewPage = lazy(async () => ({ default: (await import("@/pages/DocumentViewPage")).DocumentViewPage }))
const NotificationEditorPage = lazy(async () => ({ default: (await import("@/pages/NotificationEditorPage")).NotificationEditorPage }))
const StatementEditorPage = lazy(async () => ({ default: (await import("@/pages/StatementEditorPage")).StatementEditorPage }))
const DocumentPrintPage = lazy(async () => ({ default: (await import("@/pages/DocumentPrintPage")).DocumentPrintPage }))
const TemplateEditorPage = lazy(async () => ({ default: (await import("@/pages/TemplateEditorPage")).TemplateEditorPage }))

const withSuspense = (component: ReactNode) => (
  <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Загрузка...</div>}>
    {component}
  </Suspense>
)

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: withSuspense(<DashboardPage />) },
      { path: "employees", element: withSuspense(<EmployeesPage />) },
      { path: "structure", element: withSuspense(<StructurePage />) },
      { path: "orders", element: withSuspense(<OrdersPage />) },
      { path: "orders/notifications", element: withSuspense(<NotificationsPage />) },
      { path: "orders/statements", element: withSuspense(<StatementsPage />) },
      { path: "vacations", element: withSuspense(<VacationsPage />) },
      { path: "vacations/recall", element: withSuspense(<VacationRecallPage />) },
      { path: "vacations/postpone", element: withSuspense(<VacationPostponePage />) },
      { path: "vacations/extension", element: withSuspense(<VacationExtensionPage />) },
      { path: "unpaid-leaves", element: withSuspense(<UnpaidLeavesPage />) },
      { path: "weekend-calls", element: withSuspense(<WeekendCallsPage />) },
      { path: "sick-leaves", element: withSuspense(<SickLeavesPage />) },
      { path: "vacation-calendar", element: withSuspense(<VacationCalendarPage />) },
      { path: "templates", element: withSuspense(<TemplatesPage />) },
      { path: "settings", element: withSuspense(<SettingsPage />) },
      { path: "settings/holidays", element: withSuspense(<HolidaysPage />) },
      { path: "settings/backups", element: withSuspense(<BackupsPage />) },
      { path: "dev", element: withSuspense(<DevPage />) },
    ],
  },
  {
    path: "/login",
    element: withSuspense(<LoginPage />),
  },
  {
    path: "/orders/drafts/:draftId/edit-docx",
    element: withSuspense(<DraftOrderEditorPage />),
  },
  {
    path: "/documents/:docCode/:id/view",
    element: withSuspense(<DocumentViewPage />),
  },
  {
    path: "/orders/:id/view-docx",
    element: withSuspense(<OrderEditorPage />),
  },
  {
    path: "/orders/:id/edit-docx",
    element: withSuspense(<OrderEditorPage />),
  },
  {
    path: "/notifications/:notificationId/edit-docx",
    element: withSuspense(<NotificationEditorPage />),
  },
  {
    path: "/notifications/:notificationId/view-docx",
    element: withSuspense(<NotificationEditorPage />),
  },
  {
    path: "/statements/:statementId/edit-docx",
    element: withSuspense(<StatementEditorPage />),
  },
  {
    path: "/statements/:statementId/view-docx",
    element: withSuspense(<StatementEditorPage />),
  },
  {
    path: "/orders/:id/print",
    element: withSuspense(
      <DocumentPrintPage
        routeParam="id"
        endpoint="orders"
        titlePrefix="Приказ"
        invalidIdMessage="Некорректный ID приказа"
      />
    ),
  },
  {
    path: "/notifications/:notificationId/print",
    element: withSuspense(
      <DocumentPrintPage
        routeParam="notificationId"
        endpoint="notifications"
        titlePrefix="Уведомление"
        invalidIdMessage="Некорректный ID уведомления"
      />
    ),
  },
  {
    path: "/statements/:statementId/print",
    element: withSuspense(
      <DocumentPrintPage
        routeParam="statementId"
        endpoint="statements"
        titlePrefix="Заявление"
        invalidIdMessage="Некорректный ID заявления"
      />
    ),
  },
  {
    path: "/templates/:kind/:id/view",
    element: withSuspense(<TemplateEditorPage />),
  },
  {
    path: "/templates/:kind/:id/edit",
    element: withSuspense(<TemplateEditorPage />),
  },
])
