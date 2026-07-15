import { useState, useCallback } from "react"
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { PlaceholderAutocomplete } from "./PlaceholderAutocomplete"
import type { TemplateVariable } from "@/entities/order/types"

export interface FieldSchemaItem {
  key: string
  label: string
  type: "text" | "date" | "number" | "textarea"
  required: boolean
  enabled?: boolean
  quickOptions?: Array<{ label: string; years?: number; months?: number; unit?: string }>
}

interface FieldGridEditorProps {
  fields: FieldSchemaItem[]
  onChange: (fields: FieldSchemaItem[]) => void
  templateVariables: TemplateVariable[]
  readOnly?: boolean
}

/**
 * Визуальный редактор полей (плоский список).
 */
export function FieldGridEditor({ fields, onChange, templateVariables, readOnly = false }: FieldGridEditorProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  const updateField = useCallback((index: number, updates: Partial<FieldSchemaItem>) => {
    onChange(fields.map((f, i) => i === index ? { ...f, ...updates } : f))
  }, [fields, onChange])

  const removeField = useCallback((index: number) => {
    onChange(fields.filter((_, i) => i !== index))
    setEditingIdx(null)
  }, [fields, onChange])

  const addField = useCallback(() => {
    const newField: FieldSchemaItem = {
      key: "",
      label: "",
      type: "text",
      required: false,
      enabled: true,
    }
    const newIdx = fields.length
    onChange([...fields, newField])
    setEditingIdx(newIdx)
  }, [fields, onChange])

  const moveField = useCallback((index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= fields.length) return
    const newFields = [...fields]
    ;[newFields[index], newFields[targetIdx]] = [newFields[targetIdx], newFields[index]]
    onChange(newFields)
    setEditingIdx(targetIdx)
  }, [fields, onChange])

  const typeColors: Record<string, string> = {
    date: "bg-blue-100 text-blue-700",
    text: "bg-gray-100 text-gray-700",
    number: "bg-green-100 text-green-700",
    textarea: "bg-purple-100 text-purple-700",
  }

  // Build lookup maps from placeholder key to displayName and description
  const keyToDisplayName = new Map<string, string>()
  const keyToDescription = new Map<string, string>()
  for (const tv of templateVariables) {
    const k = tv.key || tv.name.replace(/^\{|\}$/g, "")
    keyToDisplayName.set(k, tv.displayName)
    keyToDescription.set(k, tv.description)
  }

  return (
    <div className="space-y-2">
      {/* Fields list */}
      {fields.map((field, idx) => {
        const isEditing = editingIdx === idx
        const hasContent = field.key || field.label

        return (
          <div
            key={idx}
            className={`flex items-start gap-2 rounded-lg border-2 p-2 transition-all ${
              isEditing
                ? "border-primary bg-primary/5 shadow-sm"
                : field.enabled === false
                  ? "border-dashed border-muted/40 bg-muted/10 opacity-50"
                  : "border-border bg-background"
            }`}
          >
            {isEditing && !readOnly ? (
              <div className="flex-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-1">
                  <div className="flex-1 space-y-1">
                    <PlaceholderAutocomplete
                      value={field.key}
                      onChange={(value) => {
                        updateField(idx, {
                          key: value,
                          label: field.label || value.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
                        })
                      }}
                      options={templateVariables}
                      placeholder="—"
                    />
                    <div className="h-7 text-xs px-2 border rounded bg-muted/30 flex items-center font-mono text-muted-foreground">
                      {field.key ? "{" + field.key + "}" : "—"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={(e) => { e.stopPropagation(); removeField(idx) }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={field.type}
                    onValueChange={(v) => updateField(idx, { type: v as FieldSchemaItem["type"] })}
                  >
                    <SelectTrigger className="h-6 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="date">date</SelectItem>
                      <SelectItem value="number">number</SelectItem>
                      <SelectItem value="textarea">textarea</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-xs shrink-0">
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(v) => updateField(idx, { required: !!v })}
                      className="h-3 w-3"
                    />
                    req
                  </label>
                  <label className="flex items-center gap-1 text-xs shrink-0">
                    <Checkbox
                      checked={field.enabled !== false}
                      onCheckedChange={(v) => updateField(idx, { enabled: !!v })}
                      className="h-3 w-3"
                    />
                    вкл
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0" onClick={() => !readOnly && hasContent && setEditingIdx(isEditing ? null : idx)}>
                  <span className="text-xs font-medium truncate block">
                    {keyToDisplayName.get(field.key) || field.key || "—"}
                  </span>
                  {keyToDescription.has(field.key) && (
                    <span className="text-[10px] text-muted-foreground truncate block">
                      {keyToDescription.get(field.key)}
                    </span>
                  )}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[10px] px-1 rounded font-mono ${typeColors[field.type] || "bg-gray-100 text-gray-700"}`}>
                      {field.type}
                    </span>
                    {field.key && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {"{" + field.key + "}"}
                      </span>
                    )}
                    {field.required && (
                      <span className="text-[10px] text-red-500">*</span>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Move up/down */}
                    <button
                      className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); moveField(idx, "up") }}
                      disabled={idx === 0}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); moveField(idx, "down") }}
                      disabled={idx === fields.length - 1}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    {/* Enabled toggle */}
                    <button
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        field.enabled === false
                          ? "bg-muted text-muted-foreground hover:bg-muted/80"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateField(idx, { enabled: field.enabled === false })
                      }}
                    >
                      {field.enabled === false ? "откл" : "вкл"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {/* Add field button */}
      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addField} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" />
          Добавить поле
        </Button>
      )}
    </div>
  )
}
