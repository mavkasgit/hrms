import { useState, useEffect, useRef } from "react"
import { Check, X } from "lucide-react"
import { Input } from "@/shared/ui/input"
import { useSearchEmployees, useEmployees } from "@/entities/employee/useEmployees"
import type { Employee } from "@/entities/employee/types"
import type { ReactNode } from "react"

interface EmployeeSearchProps {
  value: Employee | null
  onChange: (employee: Employee | null) => void
  label?: string
  required?: boolean
  placeholder?: string
  error?: string
  disabled?: boolean
  width?: string
  className?: string
  renderOptionExtra?: (emp: Employee) => ReactNode
  renderValueExtra?: (emp: Employee) => ReactNode
  showTabNumber?: boolean
}

export function EmployeeSearch({
  value,
  onChange,
  label = "Сотрудник",
  required = false,
  placeholder = "Поиск по ФИО...",
  error,
  disabled = false,
  width = "w-96",
  className = "",
  renderOptionExtra,
  renderValueExtra,
  showTabNumber = true,
}: EmployeeSearchProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Employee[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const { data: searchResult } = useSearchEmployees(searchQuery)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000 })

  useEffect(() => {
    if (searchResult?.items) setSearchResults(searchResult.items)
  }, [searchResult])

  useEffect(() => {
    if (searchOpen && !searchQuery && allEmployees?.items) {
      setSearchResults(allEmployees.items)
    }
  }, [searchOpen, searchQuery, allEmployees])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
        setSearchOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectEmployee = (emp: Employee) => {
    onChange(emp)
    setSearchQuery("")
    setSearchResults([])
    setSearchOpen(false)
  }

  const clearEmployee = () => {
    onChange(null)
    setSearchQuery("")
    setSearchResults([])
  }

  return (
    <div className={`${width} ${className}`} ref={searchRef}>
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {value ? (
        <div className="flex items-center gap-2 border rounded-md px-3 h-10 bg-muted/50">
          <Check className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm flex-1 truncate">
            {value.name}
            {showTabNumber && (
              <span className="text-muted-foreground ml-1">(таб. {value.tab_number ?? "—"})</span>
            )}
          </span>
          {renderValueExtra && (
            <div className="shrink-0">{renderValueExtra(value)}</div>
          )}
          <button
            type="button"
            onClick={clearEmployee}
            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              setSearchOpen(true)
              if (!searchQuery && allEmployees?.items) {
                setSearchResults(allEmployees.items)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults.length > 0) {
                e.preventDefault()
                selectEmployee(searchResults[0])
              }
            }}
            disabled={disabled}
            className={error ? "border-red-500" : ""}
          />
          {searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
              {searchResults.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0 flex items-center justify-between"
                  onClick={() => selectEmployee(emp)}
                >
                  <div className="truncate">
                    <span className="font-medium">{emp.name}</span>
                    {showTabNumber && (
                      <span className="text-muted-foreground ml-2">таб. {emp.tab_number ?? "—"}</span>
                    )}
                  </div>
                  {renderOptionExtra && (
                    <div className="shrink-0 ml-2">{renderOptionExtra(emp)}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
