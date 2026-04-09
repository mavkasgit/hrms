import { createBrowserRouter } from "react-router-dom"
import { Layout } from "./Layout"
import { DashboardPage } from "@/pages/DashboardPage"
import { EmployeesPage } from "@/pages/EmployeesPage"
import { OrdersPage } from "@/pages/OrdersPage"
import { VacationsPage } from "@/pages/VacationsPage"
import { VacationCalendarPage } from "@/pages/VacationCalendarPage"
import { TemplatesPage } from "@/pages/TemplatesPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { HolidaysPage } from "@/pages/HolidaysPage"
import { LoginPage } from "@/pages/LoginPage"
import { DevPage } from "@/pages/DevPage"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "employees", element: <EmployeesPage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "vacations", element: <VacationsPage /> },
      { path: "vacation-calendar", element: <VacationCalendarPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/holidays", element: <HolidaysPage /> },
      { path: "dev", element: <DevPage /> },
    ],
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
])
