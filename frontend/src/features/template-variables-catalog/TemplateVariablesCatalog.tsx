import { useMemo, useState } from "react"
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react"
import type { TemplateVariable } from "@/entities/order/types"
import { categorizeVariables } from "./categorizeVariables"

interface TemplateVariablesCatalogProps {
  variables: TemplateVariable[]
  defaultExpanded?: boolean
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Try the legacy path below when clipboard permissions are blocked.
    }
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.left = "-9999px"
  textarea.style.top = "0"
  document.body.appendChild(textarea)

  try {
    textarea.focus()
    textarea.select()
    const copied = document.execCommand("copy")
    if (!copied) throw new Error("Copy command failed")
  } finally {
    document.body.removeChild(textarea)
  }
}

export function TemplateVariablesCatalog({
  variables,
  defaultExpanded = true,
}: TemplateVariablesCatalogProps) {
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem("templateVariablesCatalog.expanded")
    return saved !== null ? JSON.parse(saved) : defaultExpanded
  })
  const [copiedVar, setCopiedVar] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  const { leftCategories, rightCategories, grouped: groupedVariables } = useMemo(
    () => categorizeVariables(variables),
    [variables]
  )

  const toggleExpanded = () => {
    const newValue = !expanded
    setExpanded(newValue)
    localStorage.setItem("templateVariablesCatalog.expanded", JSON.stringify(newValue))
  }

  const copyVariable = async (name: string) => {
    try {
      await copyText(name)
      setCopyError(null)
      setCopiedVar(name)
      setTimeout(() => setCopiedVar((current) => (current === name ? null : current)), 1200)
    } catch {
      setCopyError("Не удалось скопировать переменную")
      setTimeout(() => setCopyError(null), 3000)
    }
  }

  const renderCategory = (category: string) => {
    const items = groupedVariables[category]
    if (!items?.length) return null
    return (
      <div key={category}>
        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{category}</h4>
        <div className="space-y-2 text-sm">
          {items.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.name}</code>
              <button
                onClick={() => copyVariable(item.name)}
                className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Копировать"
              >
                {copiedVar === item.name ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              <span className="text-muted-foreground">— {item.description}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg bg-card">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <h2 className="text-lg font-semibold">Доступные переменные для шаблонов</h2>
      </button>
      {expanded && (
        <div className="border-t px-4 py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Используйте эти переменные в фигурных скобках в ваших .docx шаблонах. Они будут автоматически заменены на данные при создании документа.
          </p>
          <div className="bg-muted/50 border rounded-md p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Пример:</p>
            <code className="text-xs">
              Уведомление №{"{doc_number}"} от {"{doc_date}"} для {"{short_name}"}
            </code>
          </div>
          {copyError && (
            <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {copyError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">{leftCategories.map(renderCategory)}</div>
            <div className="space-y-4">{rightCategories.map(renderCategory)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
