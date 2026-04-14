import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import * as L from "lucide-react"

const COLOR_PRESETS = [
  "#065F46", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6B7280", "#1D4ED8",
]

const ICON_LIST = [
  "Building2","Briefcase","Building","Hospital","School","Factory",
  "Store","Warehouse","Landmark","Hotel","Home","BriefcaseBusiness",
  "Users","User","UserCog","UserCheck","UserPlus","UsersRound","UserRound",
  "IdCard","Contact","GraduationCap","Target","Award","Shield","ShieldCheck",
  "Verified","BadgeCheck","Medal","Trophy","Crown","Gem","Star",
  "ChartBar","ChartLine","ChartPie","BarChart3","TrendingUp","TrendingDown",
  "Activity","PieChart","Percent","FileText","FileCheck","FileCode",
  "FileBarChart","Folder","FolderOpen","Archive","Notebook","BookOpen",
  "Clipboard","Mail","Phone","MessageSquare","Bell","BellRing","Send",
  "Megaphone","Radio","Globe","MapPin","Navigation","Compass","Link",
  "Share2","Search","Settings","Wrench","Cog","Key","Lock","Eye",
  "Edit","Trash2","Copy","Plus","Save","RefreshCw","Upload",
  "DollarSign","CreditCard","Wallet","Receipt","Package","Truck","Box","Tag",
]

const LUCIDE = L as unknown as Record<string, React.ComponentType<{ className?: string }>>

export function renderIcon(name: string, className = "h-4 w-4"): ReactNode | null {
  const Icon = LUCIDE[name]
  return Icon ? <Icon className={className} /> : null
}

/* ───────── IconColorPicker ───────── */

function IconColorPicker({
  iconValue,
  colorValue,
  onIconChange,
  onColorChange,
}: {
  iconValue: string
  colorValue: string
  onIconChange: (v: string) => void
  onColorChange: (v: string) => void
}) {
  const [allOpen, setAllOpen] = useState(false)
  const preview = ICON_LIST.slice(0, 16)

  return (
    <div className="flex gap-4">
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Иконка</div>
        {iconValue && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-primary">{renderIcon(iconValue)}</span>
            <span className="text-muted-foreground">{iconValue}</span>
          </div>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {preview.map((name) => (
            <button
              key={name}
              type="button"
              className={`flex items-center justify-center h-9 w-9 rounded-md transition-all hover:bg-accent ${
                iconValue === name ? "ring-2 ring-primary bg-accent" : "text-muted-foreground"
              }`}
              onClick={() => onIconChange(name)}
              title={name}
            >
              {renderIcon(name)}
            </button>
          ))}
          <div className="col-span-4 flex justify-center pt-0.5">
            <Popover open={allOpen} onOpenChange={setAllOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <span>Все иконки</span>
                  <span className="font-mono text-[10px]">({ICON_LIST.length})</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[620px] p-3" align="center">
                <h4 className="text-sm font-semibold mb-2">Все иконки</h4>
                <div className="grid grid-cols-12 gap-1 rounded-md p-1">
                  {ICON_LIST.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`flex items-center justify-center h-9 w-9 rounded-md transition-all hover:bg-accent ${
                        iconValue === name ? "ring-2 ring-primary bg-accent" : "text-muted-foreground"
                      }`}
                      onClick={() => { onIconChange(name); setAllOpen(false) }}
                      title={name}
                    >
                      {renderIcon(name)}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="flex-1 pt-5">
        <div className="text-xs text-muted-foreground mb-1.5">
          Цвет иконки {colorValue && <span className="font-mono">[{colorValue}]</span>}
        </div>
        <div className="space-y-1.5">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-1.5">
              {COLOR_PRESETS.slice(row * 6, row * 6 + 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-8 flex-1 rounded-md cursor-pointer transition-all ring-2 ring-transparent hover:ring-foreground/30 hover:scale-105"
                  style={{
                    backgroundColor: c,
                    boxShadow: colorValue === c ? `0 0 0 2px var(--background), 0 0 0 4px ${c}` : undefined,
                  }}
                  onClick={() => onColorChange(c)}
                  title={c}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ───────── EntityDialog ───────── */

export interface EntityDialogField {
  type: "text" | "number" | "color" | "icon"
  label: string
  placeholder?: string
  required?: boolean
  min?: number
  rowGroup?: string
}

export interface EntityDialogProps {
  fields: Record<string, EntityDialogField>
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "add" | "edit"
  initialValues: Record<string, unknown>
  onSave: (values: Record<string, unknown>) => void
  addTitle: string
  editTitle: string
  addDescription: string
  editDescription: string
  addLabel: string
  saveLabel: string
}

export function EntityDialog({
  fields,
  open,
  onOpenChange,
  mode,
  initialValues,
  onSave,
  addTitle,
  editTitle,
  addDescription,
  editDescription,
  addLabel,
  saveLabel,
}: EntityDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>({})

  const fieldsKey = JSON.stringify(fields)

  useEffect(() => {
    if (!open) return
    if (mode === "edit") {
      setValues({ ...initialValues })
    } else {
      const defaults: Record<string, unknown> = {}
      for (const key in fields) {
        const f = fields[key]
        if (f.type === "number") defaults[key] = f.min ?? 1
        else if (f.type === "color") defaults[key] = COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]
        else defaults[key] = initialValues[key] ?? ""
      }
      setValues(defaults)
    }
  }, [open, mode, initialValues, fieldsKey])

  const hasBothIconAndColor = useMemo(
    () => !!(fields.icon && fields.color),
    [fieldsKey]
  )

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = () => {
    onSave(values)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const hasEmptyRequired = Object.entries(fields).some(
        ([key, f]) => f.required && !values[key]
      )
      if (!hasEmptyRequired) handleSave()
    }
  }

  const renderFields = () => {
    const entries = Object.entries(fields)
      .filter(([, field]) => {
        if (field.type === "icon" && hasBothIconAndColor && field === fields.icon) return false
        if (field.type === "color" && hasBothIconAndColor && field === fields.color) return false
        return true
      })

    const rendered = new Set<string>()
    const result: React.ReactNode[] = []

    for (const [key, field] of entries) {
      if (rendered.has(key)) continue
      const val = values[key] ?? ""

      if (field.rowGroup) {
        const groupFields = entries.filter(([, f]) => f.rowGroup === field.rowGroup)
        groupFields.forEach(([k]) => rendered.add(k))

        result.push(
          <div key={key} className="flex gap-3">
            {groupFields.map(([gk, gf]) => {
              const gv = values[gk] ?? ""
              return (
                <div key={gk} className="flex-1">
                  <label className="text-sm font-medium">{gf.label}</label>
                  <div className="mt-1">
                    {gf.type === "text" && (
                      <Input
                        value={gv as string}
                        placeholder={gf.placeholder ?? ""}
                        onChange={(e) => setValue(gk, e.target.value)}
                      />
                    )}
                    {gf.type === "number" && (
                      <Input
                        type="number"
                        value={gv as number}
                        onChange={(e) => setValue(gk, parseInt(e.target.value, 10) || (gf.min ?? 1))}
                        min={gf.min}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      } else {
        rendered.add(key)
        result.push(
          <div key={key}>
            {!(field.type === "icon" && hasBothIconAndColor) && (
              <label className="text-sm font-medium">{field.label}</label>
            )}
            <div className="mt-1">
              {field.type === "text" && (
                <Input
                  value={val as string}
                  placeholder={field.placeholder ?? ""}
                  onChange={(e) => setValue(key, e.target.value)}
                />
              )}
              {field.type === "number" && (
                <Input
                  type="number"
                  value={val as number}
                  onChange={(e) => setValue(key, parseInt(e.target.value, 10) || (field.min ?? 1))}
                  min={field.min}
                />
              )}
              {field.type === "icon" && hasBothIconAndColor && (
                <IconColorPicker
                  iconValue={values.icon as string}
                  colorValue={values.color as string}
                  onIconChange={(v) => setValue("icon", v)}
                  onColorChange={(v) => setValue("color", v)}
                />
              )}
              {field.type === "icon" && !hasBothIconAndColor && (
                <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-auto rounded-md border p-2">
                  {ICON_LIST.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`flex items-center justify-center h-8 w-8 rounded-md transition-all hover:bg-accent ${
                        val === name ? "ring-2 ring-primary bg-accent" : "text-muted-foreground"
                      }`}
                      onClick={() => setValue(key, name)}
                      title={name}
                    >
                      {renderIcon(name)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      }
    }
    return result
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? addTitle : editTitle}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? addDescription : editDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {renderFields()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave}>{mode === "add" ? addLabel : saveLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
