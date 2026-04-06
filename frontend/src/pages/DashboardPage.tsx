import { useQuery } from "@tanstack/react-query"
import { fetchDashboardStats, fetchBirthdays, fetchContracts, fetchDepartmentDistribution } from "@/features/dashboard/api"
import { StatCard } from "@/features/dashboard/components/StatCard"
import { BirthdaysList } from "@/features/dashboard/components/BirthdaysList"
import { ContractsTable } from "@/features/dashboard/components/ContractsTable"
import { DepartmentChart } from "@/features/dashboard/components/DepartmentChart"
import { Users, CalendarClock, Briefcase, User } from "lucide-react"

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchDashboardStats(),
  })

  const { data: birthdays, isLoading: birthdaysLoading } = useQuery({
    queryKey: ["dashboard-birthdays"],
    queryFn: () => fetchBirthdays(30),
  })

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ["dashboard-contracts"],
    queryFn: () => fetchContracts(),
  })

  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ["dashboard-departments"],
    queryFn: () => fetchDepartmentDistribution(),
  })

  const allDepartments = deptData
    ? (deptData as any[]).map((d: any) => d.department || d.position)
    : []

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold">Дашборд</h1>
      </div>

      {/* Карточки статистики */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Всего сотрудников"
          value={statsLoading ? "—" : stats?.total ?? 0}
          icon={<Users className="h-6 w-6" />}
        />
        <StatCard
          title="Мужчин"
          value={statsLoading ? "—" : stats?.male_count ?? 0}
          icon={<User className="h-6 w-6 text-blue-500" />}
        />
        <StatCard
          title="Женщин"
          value={statsLoading ? "—" : stats?.female_count ?? 0}
          icon={<User className="h-6 w-6 text-pink-500" />}
        />
        <StatCard
          title="Средний возраст"
          value={statsLoading ? "—" : `${stats?.avg_age ?? 0} лет`}
          icon={<CalendarClock className="h-6 w-6" />}
        />
        <StatCard
          title="Средний стаж"
          value={statsLoading ? "—" : `${stats?.avg_tenure ?? 0} лет`}
          icon={<Briefcase className="h-6 w-6" />}
        />
      </div>

      {/* Дни рождения и контракты */}
      <div className="flex flex-wrap gap-6">
        <div className="w-[500px]">
          <BirthdaysList birthdays={birthdays || []} isLoading={birthdaysLoading} />
        </div>
        <div className="w-[690px]">
          <ContractsTable
            contracts={contracts || []}
            departments={allDepartments.filter((d: string) => d)}
            isLoading={contractsLoading}
          />
        </div>
      </div>

      {/* График по отделам */}
      <DepartmentChart
        data={deptData || []}
        isLoading={deptLoading}
      />
    </div>
  )
}
