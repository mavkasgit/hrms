import { useState, useCallback } from "react"
import { Plus, Trash2, Settings2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { PlaceholderAutocomplete, type PlaceholderOption } from "./PlaceholderAutocomplete"

export interface FieldSchemaItem {
  key: string
  label: string
  type: "text" | "date" | "number" | "textarea"
  required: boolean
  enabled?: boolean
  col?: number
  row?: number
  width?: number  // cell width in px (optional, auto if not set)
  quickOptions?: Array<{ label: string; years?: number; months?: number; unit?: string }>
}

interface FieldGridEditorProps {
  fields: FieldSchemaItem[]
  onChange: (fields: FieldSchemaItem[]) => void
  templateVariables: PlaceholderOption[]
  readOnly?: boolean
}

const DEFAULT_COLS = 3

// Плейсхолдеры которые заполняются автоматически — не показываем в палитре
const AUTO_FILLED_PLACEHOLDERS = new Set([
  "full_name", "short_name", "last_name", "first_name", "middle_name",
  "full_name_upper", "full_name_title", "full_name_last_caps",
  "last_name_upper", "initials_before", "last_name_then_initials", "initials",
  "position", "position_cap", "department", "tab_number",
  "hire_date", "contract_start", "oznak", "oznak_gender",
  "doc_number", "doc_date", "doc_title",
  "order_number", "order_date", "order_type_name", "order_type_code", "order_type_lower",
  "hire_order_date",
  "notification_type_name", "notification_type_code",
  "statement_type_name", "statement_type_code",
  "trial_end_months", "contract_end_years", "new_contract_years",
  "old_contract_start", "old_contract_end",
  "employees_block_start", "employees_block_end",
  "applications_block_start", "applications_block_end",
  "index", "notes",
])

/**
 * Визуальный редактор сетки полей.
 */
export function FieldGridEditor({ fields, onChange, templateVariables, readOnly = false }: FieldGridEditorProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [colCount, setColCount] = useState(DEFAULT_COLS)

  const updateField = useCallback((index: number, updates: Partial<FieldSchemaItem>) => {
    onChange(fields.map((f, i) => i === index ? { ...f, ...updates } : f))
  }, [fields, onChange])

  const removeField = useCallback((index: number) => {
    onChange(fields.filter((_, i) => i !== index))
    setEditingCell(null)
  }, [fields, onChange])

  const addFieldAt = useCallback((row: number, col: number, key: string) => {
    const newField: FieldSchemaItem = {
      key,
      label: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      type: "text",
      required: false,
      enabled: true,
      col,
      row,
    }
    const newIdx = fields.length
    onChange([...fields, newField])
    setEditingCell(`${newIdx}`)
    setSelectingCell(null)
  }, [fields, onChange])

  const [posInput, setPosInput] = useState<Record<number, string>>({})

  const swapFieldPosition = useCallback((fromIdx: number, newRow: number, newCol: number) => {
    const targetIdx = fields.findIndex(f => (f.row ?? 0) === newRow && (f.col ?? 0) === newCol)
    if (targetIdx >= 0 && targetIdx !== fromIdx) {
      // Swap: target goes to old position of from
      const oldRow = fields[fromIdx].row ?? 0
      const oldCol = fields[fromIdx].col ?? 0
      const updated = fields.map((f, i) => {
        if (i === fromIdx) return { ...f, row: newRow, col: newCol }
        if (i === targetIdx) return { ...f, row: oldRow, col: oldCol }
        return f
      })
      onChange(updated)
    } else {
      updateField(fromIdx, { row: newRow, col: newCol })
    }
  }, [fields, onChange, updateField])

  const addRow = useCallback(() => {
    const newRow = fields.length > 0 ? Math.max(...fields.map(f => f.row ?? 0)) + 1 : 0
    const newFields = [...fields]
    for (let c = 0; c < colCount; c++) {
      newFields.push({
        key: "",
        label: "",
        type: "text",
        required: false,
        enabled: true,
        col: c,
        row: newRow,
      })
    }
    onChange(newFields)
  }, [fields, colCount, onChange])

  // Build grid: row -> col -> field index
  const maxRow = fields.length > 0 ? Math.max(...fields.map(f => f.row ?? 0)) : 0
  const rowCount = Math.max(maxRow + 1, 1)

  const getFieldAt = (row: number, col: number) => {
    return fields.findIndex(f => (f.row ?? 0) === row && (f.col ?? 0) === col)
  }

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
  const availableForCell = templateVariables.filter(
    tv => {
      const k = tv.key || tv.name.replace(/^\{|\}$/g, "")
      return !fields.some(f => f.key === k) && !AUTO_FILLED_PLACEHOLDERS.has(k)
    }
  )

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Колонок:</span>
          <Select value={String(colCount)} onValueChange={(v) => setColCount(Number(v))}>
            <SelectTrigger className="h-7 w-14 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      <div className="space-y-1.5">
        {(() => {
          const gridTemplateColumns = `repeat(${colCount}, 1fr)`

          return Array.from({ length: rowCount }).map((_, r) => (
          <div key={r}>
            <div className="grid gap-1.5" style={{ gridTemplateColumns }}>
              {Array.from({ length: colCount }).map((_, c) => {
                const fieldIdx = getFieldAt(r, c)
                const field = fieldIdx >= 0 ? fields[fieldIdx] : null
                const isEditing = editingCell === `${fieldIdx}`
                const hasContent = field?.key || field?.label

                return (
                  <div
                    key={`${r}-${c}`}
                    className={`relative rounded-lg border-2 transition-all min-h-[52px] min-w-0 ${
                      isEditing
                        ? "border-primary bg-primary/5 shadow-sm"
                        : field?.enabled === false
                            ? "border-dashed border-muted/40 bg-muted/10 opacity-50"
                            : hasContent
                              ? "border-border bg-background hover:border-primary/30"
                              : "border-dashed border-muted bg-muted/5 hover:border-primary/50 hover:bg-primary/5"
                    }`}
                    onClick={() => {
                      if (!readOnly) {
                        if (fieldIdx >= 0 && hasContent) {
                          setEditingCell(isEditing ? null : `${fieldIdx}`)
                          setSelectingCell(null)
                        } else if (fieldIdx >= 0) {
                          // Empty cell with existing field slot - open edit mode
                          setEditingCell(`${fieldIdx}`)
                          setSelectingCell(null)
                        } else {
                          // Truly empty cell - add field and open edit mode
                          addFieldAt(r, c, "")
                          setSelectingCell(null)
                        }
                      }
                    }}
                  >
                    {field === null && !readOnly ? (
                      /* Empty cell - show plus icon */
                      <div className="h-full flex items-center justify-center">
                        <Plus className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    ) : field ? (
                      isEditing && !readOnly ? (
                        /* Edit mode - displayName dropdown + placeholder text */
                        <div className="p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-start gap-1">
                            <div className="flex-1 space-y-1">
                              <PlaceholderAutocomplete
                                value={field.key}
                                onChange={(value) => {
                                  updateField(fieldIdx, {
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
                              onClick={(e) => { e.stopPropagation(); removeField(fieldIdx) }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={field.type}
                              onValueChange={(v) => updateField(fieldIdx, { type: v as FieldSchemaItem["type"] })}
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
                                onCheckedChange={(v) => updateField(fieldIdx, { required: !!v })}
                                className="h-3 w-3"
                              />
                              req
                            </label>
                            <label className="flex items-center gap-1 text-xs shrink-0">
                              <Checkbox
                                checked={field.enabled !== false}
                                onCheckedChange={(v) => updateField(fieldIdx, { enabled: !!v })}
                                className="h-3 w-3"
                              />
                              вкл
                            </label>
                          </div>
                        </div>
                      ) : (
                        /* Display mode */
                        <div className="p-2 flex items-center gap-1.5">
                          <div className="flex-1 min-w-0">
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
                              {/* Combined position input with auto-slash, 1-based display */}
                              <input
                                type="text"
                                value={posInput[fieldIdx] ?? `${(field.row ?? 0) + 1}/${(field.col ?? 0) + 1}`}
                                className="w-10 h-5 text-[10px] text-center border rounded font-mono bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="r/c"
                                onClick={(e) => { e.stopPropagation(); (e.target as HTMLInputElement).select() }}
                                onFocus={(e) => {
                                  e.stopPropagation()
                                  ;(e.target as HTMLInputElement).select()
                                  if (!posInput[fieldIdx]) setPosInput(prev => ({ ...prev, [fieldIdx]: `${(field.row ?? 0) + 1}/${(field.col ?? 0) + 1}` }))
                                }}
                                onChange={(e) => {
                                  let val = e.target.value.replace(/[^0-9]/g, "") // only digits
                                  if (val.length > 1) {
                                    const row = val[0]
                                    const col = val.slice(1)
                                    val = `${row}/${col}`
                                  }
                                  setPosInput(prev => ({ ...prev, [fieldIdx]: val }))
                                }}
                                onBlur={(e) => {
                                  const val = posInput[fieldIdx] ?? ""
                                  const parts = val.split("/").map(s => parseInt(s.trim()) || 1)
                                  if (parts.length === 2) {
                                    swapFieldPosition(fieldIdx, parts[0] - 1, parts[1] - 1)
                                  }
                                  setPosInput(prev => { const n = { ...prev }; delete n[fieldIdx]; return n })
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === "Enter") {
                                    const val = posInput[fieldIdx] ?? ""
                                    const parts = val.split("/").map(s => parseInt(s.trim()) || 1)
                                    if (parts.length === 2) {
                                      swapFieldPosition(fieldIdx, parts[0] - 1, parts[1] - 1)
                                    }
                                    setPosInput(prev => { const n = { ...prev }; delete n[fieldIdx]; return n })
                                  }
                                }}
                              />
                              {/* Enabled toggle */}
                              <button
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                  field.enabled === false
                                    ? "bg-muted text-muted-foreground hover:bg-muted/80"
                                    : "bg-green-100 text-green-700 hover:bg-green-200"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  updateField(fieldIdx, { enabled: field.enabled === false })
                                }}
                              >
                                {field.enabled === false ? "откл" : "вкл"}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ))
        })()}
      </div>

      {/* Add row */}
      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addRow} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" />
          Добавить строку
        </Button>
      )}
    </div>
  )
}
