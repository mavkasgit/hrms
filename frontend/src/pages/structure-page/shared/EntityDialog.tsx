import { useState, useEffect, useCallback, useRef, type ReactNode } from "react"
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

/* ───────── ColorPicker ───────── */

function isValidHex(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v)
}

function ColorPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const colorInputRef = useRef<HTMLInputElement>(null)

  const openNativePicker = () => {
    colorInputRef.current?.click()
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="size-8 shrink-0 rounded-md border shadow-sm cursor-pointer transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: value }}
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="grid grid-cols-4 gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`size-8 rounded-md cursor-pointer transition-all hover:scale-110 ${
                    value === c ? "ring-2 ring-foreground ring-offset-2" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => onChange(c)}
                  title={c}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <label
          className="relative shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] font-medium cursor-pointer transition-colors whitespace-nowrap hover:bg-accent"
        >
          <input
            ref={colorInputRef}
            type="color"
            value={isValidHex(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <svg className="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="2.5" />
            <path d="M17.5 10.5c2.5 0 4.5 2 4.5 4.5 0 3.5-3.5 7-8 7-1.5 0-3-.5-4-1.5L4 14l3-3 2.5 2.5c.5-1 1.5-2 2.5-3.5" />
            <path d="M2 20l4-4" />
          </svg>
          Свой цвет
        </label>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="size-8 shrink-0 rounded-md border shadow-sm cursor-pointer transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: value }}
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="grid grid-cols-4 gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`size-8 rounded-md cursor-pointer transition-all hover:scale-110 ${
                    value === c ? "ring-2 ring-foreground ring-offset-2" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => onChange(c)}
                  title={c}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <span className="font-mono text-xs text-muted-foreground shrink-0">{isValidHex(value) ? value.toUpperCase() : value}</span>

        <button
          type="button"
          onClick={openNativePicker}
          className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] font-medium cursor-pointer transition-colors whitespace-nowrap hover:bg-accent ${
            !COLOR_PRESETS.includes(value) ? "ring-2 ring-foreground ring-offset-1" : ""
          }`}
        >
          <svg className="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="2.5" />
            <path d="M17.5 10.5c2.5 0 4.5 2 4.5 4.5 0 3.5-3.5 7-8 7-1.5 0-3-.5-4-1.5L4 14l3-3 2.5 2.5c.5-1 1.5-2 2.5-3.5" />
            <path d="M2 20l4-4" />
          </svg>
          Свой цвет
        </button>

        <input
          ref={colorInputRef}
          type="color"
          value={isValidHex(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
      </div>

      <div>
        <div className="text-[11px] text-muted-foreground mb-1.5">Быстрый выбор</div>
        <div className="grid grid-cols-4 gap-1.5">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`h-7 rounded-md cursor-pointer transition-all hover:scale-105 ${
                value === c
                  ? "ring-2 ring-foreground ring-offset-1"
                  : "ring-1 ring-border"
              }`}
              style={{ backgroundColor: c }}
              onClick={() => onChange(c)}
              title={c}
            />
          ))}
        </div>
      </div>
    </div>
  )
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
  const preview = ICON_LIST.slice(0, 12)

  return (
    <div className="flex gap-4">
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground h-4">Иконка</div>
        {iconValue && (
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: colorValue }}>{renderIcon(iconValue)}</span>
            <span className="text-muted-foreground">{iconValue}</span>
          </div>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {preview.map((name) => (
            <button
              key={name}
              type="button"
              className={`flex items-center justify-center size-9 rounded-md transition-all hover:bg-accent ${
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
                      className={`flex items-center justify-center size-9 rounded-md transition-all hover:bg-accent ${
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

      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-2 h-4">Цвет иконки</div>
        <ColorPicker value={colorValue} onChange={onColorChange} />
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
  testId?: string
}

export interface EntityDialogProps {
  fields: Record<string, EntityDialogField>
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "add" | "edit"
  initialValues: Record<string, unknown>
  onSave: (values: Record<string, unknown>) => void | Promise<void>
  onDelete?: () => void
  addTitle: string
  editTitle: string
  addDescription: string
  editDescription: string
  addLabel: string
  saveLabel: string
  isSaving?: boolean
}

export function EntityDialog({
  fields,
  open,
  onOpenChange,
  mode,
  initialValues,
  onSave,
  onDelete,
  addTitle,
  editTitle,
  addDescription,
  editDescription,
  addLabel,
  saveLabel,
  isSaving = false,
}: EntityDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fieldsKey = JSON.stringify(fields)

  useEffect(() => {
    if (!open) return
    setErrors({})
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

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    for (const [key, field] of Object.entries(fields)) {
      if (field.required && !values[key]) {
        next[key] = `${field.label} обязательно`
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    await onSave(values)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!isSaving) handleSave()
    }
  }

  const renderField = (key: string, field: EntityDialogField, val: unknown, compact = false) => {
    const hasError = !!errors[key]

    const inputClasses = hasError ? "border-destructive focus-visible:ring-destructive" : ""

    if (field.type === "text") {
      return (
        <Input
          value={val as string}
          placeholder={field.placeholder ?? ""}
          className={inputClasses}
          onChange={(e) => setValue(key, e.target.value)}
          data-testid={field.testId}
        />
      )
    }

    if (field.type === "number") {
      const min = field.min ?? 0
      return (
        <Input
          type="number"
          value={val as number}
          className={inputClasses}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            setValue(key, isNaN(parsed) ? min : parsed)
          }}
          min={min}
        />
      )
    }

    if (field.type === "color") {
      return <ColorPicker value={(val as string) ?? "#000000"} onChange={(v) => setValue(key, v)} compact={compact} />
    }

    if (field.type === "icon") {
      const iconKey = Object.keys(fields).find((k) => fields[k].type === "icon")
      const colorKey = Object.keys(fields).find((k) => fields[k].type === "color")
      const hasIconColorPair = !!(iconKey && colorKey)

      if (hasIconColorPair) {
        return (
          <IconColorPicker
            iconValue={values[iconKey!] as string}
            colorValue={values[colorKey!] as string}
            onIconChange={(v) => setValue(iconKey!, v)}
            onColorChange={(v) => setValue(colorKey!, v)}
          />
        )
      }

      return (
        <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-auto rounded-md border p-2">
          {ICON_LIST.map((name) => (
            <button
              key={name}
              type="button"
              className={`flex items-center justify-center size-8 rounded-md transition-all hover:bg-accent ${
                val === name ? "ring-2 ring-primary bg-accent" : "text-muted-foreground"
              }`}
              onClick={() => setValue(key, name)}
              title={name}
            >
              {renderIcon(name)}
            </button>
          ))}
        </div>
      )
    }

    return null
  }

  const renderFields = () => {
    const iconKey = Object.keys(fields).find((k) => fields[k].type === "icon")
    const colorKey = Object.keys(fields).find((k) => fields[k].type === "color")
    const hasIconColorPair = !!(iconKey && colorKey)

    const entries = Object.entries(fields)
    const rendered = new Set<string>()
    const result: React.ReactNode[] = []

    for (const [key, field] of entries) {
      if (rendered.has(key)) continue
      if (hasIconColorPair && key === colorKey) continue

      const val = values[key] ?? ""

      if (field.rowGroup) {
        const groupFields = entries.filter(([, f]) => f.rowGroup === field.rowGroup)
        groupFields.forEach(([k]) => rendered.add(k))

        result.push(
          <div key={key} className="flex gap-3">
            {groupFields.map(([gk, gf]) => {
              const gv = values[gk] ?? ""
              const hasError = !!errors[gk]
              return (
                <div key={gk} className="flex-1">
                  <label className="text-sm font-medium">{gf.label}</label>
                  <div className="mt-1">
                    {renderField(gk, gf, gv, true)}
                  </div>
                  {hasError && (
                    <p className="text-xs text-destructive mt-1">{errors[gk]}</p>
                  )}
                </div>
              )
            })}
          </div>
        )
      } else {
        rendered.add(key)
        result.push(
          <div key={key}>
            {!(field.type === "icon" && hasIconColorPair) && (
              <label className="text-sm font-medium">{field.label}</label>
            )}
            <div className="mt-1">
              {renderField(key, field, val)}
            </div>
            {errors[key] && (
              <p className="text-xs text-destructive mt-1">{errors[key]}</p>
            )}
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

        <DialogFooter className="sm:justify-between">
          {mode === "edit" && onDelete && (
            <Button variant="destructive" onClick={onDelete} disabled={isSaving}>
              Удалить
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <L.Loader2 className="mr-2 size-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>{mode === "add" ? addLabel : saveLabel}</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
