import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { EmptyState } from "@/shared/ui/empty-state"
import { Skeleton } from "@/shared/ui/skeleton"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import type { ContractExpiring } from "../types"
import { FileText, Search, CalendarDays } from "lucide-react"

interface ContractsTableProps {
  contracts: ContractExpiring[]
  departments: string[]
  isLoading?: boolean
}

const FILTER_OPTIONS = [
  { value: 3, label: "3 мес" },
]

function getDeptBorderClass(dept: string): string {
  if (dept === "Основное") return "border-emerald-400";
  if (dept === "Завод КТМ") return "border-sky-400";
  return "border-border";
}

function getDeptDotClass(dept: string): string {
  if (dept === "Основное") return "bg-emerald-500";
  if (dept === "Завод КТМ") return "bg-sky-500";
  return "bg-muted-foreground";
}

function getDeptButtonClass(dept: string, active: boolean): string {
  if (dept === "Основное") {
    return active
      ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : "hover:bg-accent text-muted-foreground";
  }
  if (dept === "Завод КТМ") {
    return active
      ? "bg-sky-100 text-sky-700 border-sky-300"
      : "hover:bg-accent text-muted-foreground";
  }
  return active
    ? "bg-muted text-foreground border-border"
    : "hover:bg-accent text-muted-foreground";
}

const MONTH_LABELS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`
}

function contractsInMonthRange(contracts: ContractExpiring[], months: number): ContractExpiring[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(today)
  end.setMonth(end.getMonth() + months)

  return contracts.filter((c) => {
    if (!c.contract_end) return false
    const d = new Date(c.contract_end)
    return d >= today && d <= end
  })
}

export function ContractsTable({ contracts, departments, isLoading }: ContractsTableProps) {
  const [search, setSearch] = useState("")
  const [threeMonths, setThreeMonths] = useState(false)
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set())

  // Инициализация отделов при загрузке данных
  useEffect(() => {
    if (departments.length > 0 && selectedDepts.size === 0) {
      setSelectedDepts(new Set(departments))
    }
  }, [departments])

  // Filter by department and search
  const baseFiltered = useMemo(() => {
    if (selectedDepts.size === 0) return []
    return contracts.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.position.toLowerCase().includes(search.toLowerCase())
      const matchesDept = selectedDepts.has(c.department)
      return matchesSearch && matchesDept
    })
  }, [contracts, search, selectedDepts])

  // Apply month filter
  const filtered = useMemo(() => {
    if (!threeMonths) return baseFiltered
    return contractsInMonthRange(baseFiltered, 3)
  }, [baseFiltered, threeMonths])

  const toggleDept = (dept: string) => {
    setSelectedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  // Group by month for display
  const grouped = useMemo(() => {
    const groups: Map<string, ContractExpiring[]> = new Map()
    const noDate: ContractExpiring[] = []

    filtered.forEach((c) => {
      if (!c.contract_end) {
        noDate.push(c)
        return
      }
      const key = getMonthKey(c.contract_end)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    })

    return { groups, noDate }
  }, [filtered])

  // Sort group keys
  const sortedKeys = useMemo(() => {
    return Array.from(grouped.groups.keys()).sort()
  }, [grouped.groups])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-48" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Контракты
          </CardTitle>
          <Badge variant="outline">{filtered.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Фильтры */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или должности..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Все фильтры в одну строку */}
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setThreeMonths(!threeMonths)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  threeMonths
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {departments.map((dept) => {
              const active = selectedDepts.has(dept)
              return (
                <button
                  key={dept}
                  onClick={() => toggleDept(dept)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${getDeptButtonClass(dept, active)}`}
                >
                  {dept}
                </button>
              )
            })}
          </div>
        </div>

        {/* Список контрактов с разделителями по месяцам */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Нет контрактов"
            description="Нет контрактов за выбранный период"
          />
        ) : (
          <div className="space-y-4">
            {/* Без даты */}
            {grouped.noDate.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Без даты окончания
                </div>
                <div className="space-y-1.5">
                  {grouped.noDate.map((c) => (
                    <ContractRow key={c.id} contract={c} />
                  ))}
                </div>
              </div>
            )}

            {/* По месяцам */}
            {sortedKeys.map((key) => {
              const items = grouped.groups.get(key)!
              const firstDate = items[0].contract_end!
              return (
                <div key={key}>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {getMonthLabel(firstDate)}
                  </div>
                  <div className="space-y-1.5">
                    {items.map((c) => (
                      <ContractRow key={c.id} contract={c} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ContractRow({ contract }: { contract: ContractExpiring }) {
  const isExpired = contract.days_left !== null && contract.days_left < 0
  const isExpiringSoon = contract.days_left !== null && contract.days_left >= 0 && contract.days_left <= 30

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border border-l-4 ${getDeptBorderClass(contract.department)} bg-card hover:bg-accent/50 transition-colors`}>
      <div>
        <p className="font-medium text-sm">{contract.name}</p>
        <p className="text-xs text-muted-foreground">
          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${getDeptDotClass(contract.department)}`} />
          {contract.department} · {contract.position}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium">
          {contract.contract_end
            ? new Date(contract.contract_end).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "—"}
        </p>
        <p
          className={`text-xs ${
            isExpired
              ? "text-destructive font-semibold"
              : isExpiringSoon
              ? "text-amber-600 font-medium"
              : "text-muted-foreground"
          }`}
        >
          {contract.days_left === null
            ? "бессрочный"
            : isExpired
            ? `просрочен (${Math.abs(contract.days_left)} дн.)`
            : contract.days_left === 0
            ? "сегодня"
            : `${contract.days_left} дн.`}
        </p>
      </div>
    </div>
  )
}
