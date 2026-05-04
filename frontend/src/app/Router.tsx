import { createBrowserRouter } from "react-router-dom"
import { Layout } from "./Layout"
import { DashboardPage } from "@/pages/DashboardPage"
import { EmployeesPage } from "@/pages/EmployeesPage"
import { StructurePage } from "@/pages/StructurePage"
import { OrdersPage } from "@/pages/OrdersPage"
import { VacationsPage } from "@/pages/VacationsPage"
import { UnpaidLeavesPage } from "@/pages/UnpaidLeavesPage"
import { WeekendCallsPage } from "@/pages/WeekendCallsPage"
import { SickLeavesPage } from "@/pages/SickLeavesPage"
import { VacationCalendarPage } from "@/pages/VacationCalendarPage"
import { TemplatesPage } from "@/pages/TemplatesPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { HolidaysPage } from "@/pages/HolidaysPage"
import { BackupsPage } from "@/pages/BackupsPage"
import { LoginPage } from "@/pages/LoginPage"
import { DevPage } from "@/pages/DevPage"
import { OrderEditorPage } from "@/pages/OrderEditorPage"
import { DraftOrderEditorPage } from "@/pages/DraftOrderEditorPage"
import { DocumentViewPage } from "@/pages/DocumentViewPage"
import { TemplateEditorPage } from "@/pages/TemplateEditorPage"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "employees", element: <EmployeesPage /> },
      { path: "structure", element: <StructurePage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "vacations", element: <VacationsPage /> },
      { path: "unpaid-leaves", element: <UnpaidLeavesPage /> },
      { path: "weekend-calls", element: <WeekendCallsPage /> },
      { path: "sick-leaves", element: <SickLeavesPage /> },
      { path: "vacation-calendar", element: <VacationCalendarPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/holidays", element: <HolidaysPage /> },
      { path: "settings/backups", element: <BackupsPage /> },
      { path: "dev", element: <DevPage /> },
    ],
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/orders/drafts/:draftId/edit-docx",
    element: <DraftOrderEditorPage />,
  },
  {
    path: "/documents/:docCode/:id/view",
    element: <DocumentViewPage />,
  },
  {
    path: "/orders/:id/view-docx",
    element: <OrderEditorPage />,
  },
  {
    path: "/orders/:id/edit-docx",
    element: <OrderEditorPage />,
  },
  {
    path: "/templates/:id/view",
    element: <TemplateEditorPage />,
  },
  {
    path: "/templates/:id/edit",
    element: <TemplateEditorPage />,
  },
])
