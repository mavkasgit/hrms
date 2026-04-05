import { useState, useRef, KeyboardEvent } from "react"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Calendar } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ru } from "date-fns/locale"
import { format, parse, isValid } from "date-fns"
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/ui/popover"
import "react-day-picker/style.css"

// ─── Variant 1: Native date input with large icon ───
function Variant1() {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-2">
      <div className="relative inline-block">
        <Input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pr-10"
          style={{ WebkitAppearance: "none", MozAppearance: "textfield" } as React.CSSProperties}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          onClick={() => inputRef.current?.showPicker?.()}
        >
          <Calendar className="h-5 w-5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Нативный пикер с увеличенной иконкой календаря.</p>
      <p className="text-sm">Значение: {value || "—"}</p>
    </div>
  )
}

// ─── Variant 2: Auto-format DD.MM.YYYY with native picker ───
function Variant2() {
  const [text, setText] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (value: string) => {
    const digits = value.replace(/[^\d]/g, "")
    let formatted = ""
    for (let i = 0; i < digits.length && i < 8; i++) {
      if (i === 2 || i === 4) formatted += "."
      formatted += digits[i]
    }
    setText(formatted)

    if (formatted.length === 10) {
      const parsed = parse(formatted, "dd.MM.yyyy", new Date())
      if (isValid(parsed)) setDate(parsed)
    } else {
      setDate(undefined)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder="дд.мм.гггг"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={10}
          className="w-[160px]"
        />
        <Input
          type="date"
          value={date ? format(date, "yyyy-MM-dd") : ""}
          onChange={(e) => {
            if (e.target.value) {
              const d = new Date(e.target.value + "T00:00:00")
              setDate(d)
              setText(format(d, "dd.MM.yyyy"))
            }
          }}
          className="w-[160px]"
        />
      </div>
      <p className="text-xs text-muted-foreground">Текст с маской + нативный пикер. Вводишь в текст или выбираешь дату.</p>
      <p className="text-sm">Значение: {text || "—"}</p>
    </div>
  )
}

// ─── Variant 3: Segmented input (DD | MM | YYYY) ───
function Variant3() {
  const [day, setDay] = useState("")
  const [month, setMonth] = useState("")
  const [year, setYear] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const dayRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)

  const buildDate = (d: string, m: string, y: string) => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      const str = `${d}.${m}.${y}`
      const parsed = parse(str, "dd.MM.yyyy", new Date())
      if (isValid(parsed)) {
        setDate(parsed)
        return
      }
    }
    setDate(undefined)
  }

  const handleDay = (v: string) => {
    const digits = v.replace(/[^\d]/g, "").slice(0, 2)
    setDay(digits)
    if (digits.length === 2) monthRef.current?.focus()
    buildDate(digits, month, year)
  }

  const handleMonth = (v: string) => {
    const digits = v.replace(/[^\d]/g, "").slice(0, 2)
    setMonth(digits)
    if (digits.length === 2) yearRef.current?.focus()
    buildDate(day, digits, year)
  }

  const handleYear = (v: string) => {
    const digits = v.replace(/[^\d]/g, "").slice(0, 4)
    setYear(digits)
    buildDate(day, month, digits)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, field: "day" | "month" | "year") => {
    if (e.key === "Backspace") {
      if (field === "month" && !day) {
        e.preventDefault()
        dayRef.current?.focus()
      }
      if (field === "year" && !month) {
        e.preventDefault()
        monthRef.current?.focus()
      }
    }
    if (e.key === "." || e.key === "/" || e.key === "-") {
      e.preventDefault()
      if (field === "day") monthRef.current?.focus()
      if (field === "month") yearRef.current?.focus()
    }
  }

  const fullText = [day.padEnd(2, "_"), month.padEnd(2, "_"), year.padEnd(4, "_")].join(".")

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Input
          ref={dayRef}
          value={day}
          onChange={(e) => handleDay(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "day")}
          placeholder="дд"
          maxLength={2}
          className="w-[52px] text-center"
        />
        <span className="text-muted-foreground">.</span>
        <Input
          ref={monthRef}
          value={month}
          onChange={(e) => handleMonth(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "month")}
          placeholder="мм"
          maxLength={2}
          className="w-[52px] text-center"
        />
        <span className="text-muted-foreground">.</span>
        <Input
          ref={yearRef}
          value={year}
          onChange={(e) => handleYear(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "year")}
          placeholder="гггг"
          maxLength={4}
          className="w-[72px] text-center"
        />
        <Input
          type="date"
          value={date ? format(date, "yyyy-MM-dd") : ""}
          onChange={(e) => {
            if (e.target.value) {
              const d = new Date(e.target.value + "T00:00:00")
              setDate(d)
              setDay(format(d, "dd"))
              setMonth(format(d, "MM"))
              setYear(format(d, "yyyy"))
            }
          }}
          className="w-[160px]"
        />
      </div>
      <p className="text-xs text-muted-foreground">Сегментированный ввод: дд . мм . гггг. Автопереход между полями. + нативный пикер.</p>
      <p className="text-sm">Значение: {fullText}</p>
    </div>
  )
}

// ─── Variant 4: Single input with auto-format + popover calendar ───
function Variant4() {
  const [text, setText] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [open, setOpen] = useState(false)

  const handleChange = (value: string) => {
    const digits = value.replace(/[^\d]/g, "")
    let formatted = ""
    for (let i = 0; i < digits.length && i < 8; i++) {
      if (i === 2 || i === 4) formatted += "."
      formatted += digits[i]
    }
    setText(formatted)
    if (formatted.length === 10) {
      const parsed = parse(formatted, "dd.MM.yyyy", new Date())
      if (isValid(parsed)) setDate(parsed)
    } else {
      setDate(undefined)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <Input
          placeholder="дд.мм.гггг"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={10}
          className="w-[160px]"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon">
              <Calendar className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <DayPicker
              mode="single"
              selected={date}
              onSelect={(d) => {
                if (d) {
                  setDate(d)
                  setText(format(d, "dd.MM.yyyy"))
                }
                setOpen(false)
              }}
              locale={ru}
              showOutsideDays
              fixedWeeks
              classNames={{
                months: "flex flex-col sm:flex-row gap-4",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                day: "h-9 w-9 p-0 font-normal hover:bg-muted rounded-md",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "text-muted-foreground opacity-50",
                day_disabled: "text-muted-foreground opacity-50",
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-xs text-muted-foreground">Ввод с маской + календарь в popover. Автоформат DD.MM.YYYY.</p>
      <p className="text-sm">Значение: {text || "—"}</p>
    </div>
  )
}

// ─── Variant 5: Single input with auto-format + inline calendar below ───
function Variant5() {
  const [text, setText] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [showCalendar, setShowCalendar] = useState(false)

  const handleChange = (value: string) => {
    const digits = value.replace(/[^\d]/g, "")
    let formatted = ""
    for (let i = 0; i < digits.length && i < 8; i++) {
      if (i === 2 || i === 4) formatted += "."
      formatted += digits[i]
    }
    setText(formatted)
    if (formatted.length === 10) {
      const parsed = parse(formatted, "dd.MM.yyyy", new Date())
      if (isValid(parsed)) setDate(parsed)
    } else {
      setDate(undefined)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <Input
          placeholder="дд.мм.гггг"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={10}
          className="w-[160px]"
          onFocus={() => setShowCalendar(true)}
        />
        <Input
          type="date"
          value={date ? format(date, "yyyy-MM-dd") : ""}
          onChange={(e) => {
            if (e.target.value) {
              const d = new Date(e.target.value + "T00:00:00")
              setDate(d)
              setText(format(d, "dd.MM.yyyy"))
            }
          }}
          className="w-[160px]"
        />
      </div>
      {showCalendar && (
        <div className="flex justify-start">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                setDate(d)
                setText(format(d, "dd.MM.yyyy"))
              }
            }}
            locale={ru}
            showOutsideDays
            fixedWeeks
            classNames={{
              months: "flex flex-col sm:flex-row gap-4",
              month: "space-y-4",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
              row: "flex w-full mt-2",
              cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
              day: "h-9 w-9 p-0 font-normal hover:bg-muted rounded-md",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              day_today: "bg-accent text-accent-foreground",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
            }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Ввод с маской + нативный пикер + inline календарь при фокусе. Максимум вариантов.</p>
      <p className="text-sm">Значение: {text || "—"}</p>
    </div>
  )
}

export function DevPage() {
  return (
    <div className="space-y-8 p-8 max-w-4xl">
      <h1 className="text-2xl font-bold">Dev: Варианты ввода даты</h1>

      <div className="space-y-8">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>1</Badge>
            <h3 className="font-semibold">Нативный input type="date"</h3>
          </div>
          <Variant1 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>2</Badge>
            <h3 className="font-semibold">Маска DD.MM.YYYY + нативный пикер рядом</h3>
          </div>
          <Variant2 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>3</Badge>
            <h3 className="font-semibold">Сегменты: дд . мм . гггг + нативный пикер</h3>
          </div>
          <Variant3 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>4</Badge>
            <h3 className="font-semibold">Маска + календарь в popover</h3>
          </div>
          <Variant4 />
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge>5</Badge>
            <h3 className="font-semibold">Маска + нативный пикер + inline календарь</h3>
          </div>
          <Variant5 />
        </div>
      </div>
    </div>
  )
}
