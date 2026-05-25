import { cn } from "@/shared/utils/cn"

type FieldGroupProps = {
  title?: string
  className?: string
  children: React.ReactNode
}

/**
 * Универсальная группа полей с опциональным заголовком.
 * Рендерит children в flex-row с переносом.
 */
export function FieldGroup({ title, className, children }: FieldGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {title && (
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
      )}
      <div className="flex gap-4 flex-wrap items-end">
        {children}
      </div>
    </div>
  )
}
