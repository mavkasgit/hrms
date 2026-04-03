import { createBrowserRouter } from "react-router-dom"
import { Layout } from "./Layout"
import { DashboardPage } from "@/pages/DashboardPage"
import { EmployeesPage } from "@/pages/EmployeesPage"
import { OrdersPage } from "@/pages/OrdersPage"
import { VacationsPage } from "@/pages/VacationsPage"
import { LoginPage } from "@/pages/LoginPage"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "employees", element: <EmployeesPage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "vacations", element: <VacationsPage /> },
    ],
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
])
