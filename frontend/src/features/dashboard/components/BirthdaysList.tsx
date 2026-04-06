import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { EmptyState } from "@/shared/ui/empty-state"
import { Skeleton } from "@/shared/ui/skeleton"
import type { Birthday } from "../types"
import { Cake, Building2, Factory } from "lucide-react"

interface BirthdaysListProps {
  birthdays: Birthday[]
  isLoading?: boolean
}

function getDeptIcon(dept: string, className: string) {
  if (dept === "Завод КТМ") return <Factory className={className} />
  return <Building2 className={className} />
}

function getDeptIconBg(dept: string): string {
  if (dept === "Завод КТМ") return "bg-sky-100"
  return "bg-emerald-100"
}

function getDeptIconColor(dept: string): string {
  if (dept === "Завод КТМ") return "text-sky-600"
  return "text-emerald-600"
}

export function BirthdaysList({ birthdays, isLoading }: BirthdaysListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-40" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!birthdays || birthdays.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ближайшие дни рождения</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Cake}
            title="Нет дней рождений"
            description="В ближайшие 30 дней нет дней рождений"
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Ближайшие дни рождения</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {birthdays.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full ${getDeptIconBg(b.department)} flex items-center justify-center shrink-0`}>
                  {getDeptIcon(b.department, `h-4 w-4 ${getDeptIconColor(b.department)}`)}
                </div>
                <div>
                  <p className="font-medium text-sm leading-tight">{b.name}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{b.department}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-sm font-medium leading-tight">
                  {new Date(b.birth_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </p>
                <p className="text-xs text-muted-foreground leading-tight">
                  {b.days_until === 0 ? "Сегодня!" : `${b.days_until} дн.`} · {b.age} лет
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
