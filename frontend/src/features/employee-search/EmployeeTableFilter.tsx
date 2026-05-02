import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Input } from "@/shared/ui/input"

interface EmployeeTableFilterProps {
  value: string
  onChange: (query: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

export function EmployeeTableFilter({
  value,
  onChange,
  placeholder = "Поиск по ФИО или таб.№...",
  debounceMs = 300,
  className = "",
}: EmployeeTableFilterProps) {
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(inputValue)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [inputValue, debounceMs, onChange])

  return (
    <div className={`relative ${className}`}>
      <Input
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="w-64 h-9 text-sm pr-8"
      />
      {inputValue && (
        <button
          type="button"
          onClick={() => {
            setInputValue("")
            onChange("")
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
