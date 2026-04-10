import { FileX, LucideIcon } from "lucide-react"

interface EmptyStateProps {
  title?: string
  message?: string
  description?: string
  icon?: LucideIcon
}

export function EmptyState({ title, message, description, icon: Icon }: EmptyStateProps) {
  const displayTitle = title || message
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {Icon ? (
        <Icon className="h-12 w-12 text-muted-foreground mb-4" />
      ) : (
        <FileX className="h-12 w-12 text-muted-foreground mb-4" />
      )}
      <h3 className="text-lg font-semibold">{displayTitle}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  )
}
