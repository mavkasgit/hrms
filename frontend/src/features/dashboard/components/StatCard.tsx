import { Card, CardContent } from "@/shared/ui/card"
import { cn } from "@/shared/utils/cn"

interface StatCardProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  className?: string
}

export function StatCard({ title, value, icon, className }: StatCardProps) {
  return (
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {icon && <div className="text-muted-foreground shrink-0 h-5 w-5">{icon}</div>}
          <div>
            <p className="text-xl font-bold leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
