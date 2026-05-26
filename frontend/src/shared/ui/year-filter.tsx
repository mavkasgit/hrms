import { useState, useEffect, useRef } from "react"
import { X, ChevronDown } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

interface YearFilterProps {
  value: number | undefined
  onChange: (year: number | undefined) => void
  years: number[] | undefined
}

export function YearFilter({ value, onChange, years }: YearFilterProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  const sortedYears = [...(years ?? [])].sort((a, b) => b - a)
  const visibleYears = sortedYears.slice(0, 3)
  const extraYears = sortedYears.slice(3)

  const filteredExtraYears = extraYears.filter((y) =>
    y.toString().includes(search)
  )

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Reset search when dropdown closes
  useEffect(() => {
    if (!dropdownOpen) setSearch("")
  }, [dropdownOpen])

  return (
    <div className="flex gap-1 items-center">
      <Button
        variant={value === undefined ? "default" : "outline"}
        size="sm"
        onClick={() => onChange(undefined)}
      >
        Все года
      </Button>

      {visibleYears.map((y) => {
        const isSelected = value === y
        return (
          <Button
            key={y}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(isSelected ? undefined : y)}
            className="flex items-center gap-1"
          >
            {y}
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(undefined)
                }}
                className="ml-0.5 hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Button>
        )
      })}

      {extraYears.length > 0 && (
        <div ref={dropdownRef} className="relative">
          <Button
            variant={value !== undefined && !visibleYears.includes(value) ? "default" : "outline"}
            size="sm"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            Ещё
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>

          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-40 border rounded-md bg-popover shadow-md">
              <div className="p-2 border-b">
                <Input
                  placeholder="Поиск года..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredExtraYears.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                    onClick={() => {
                      onChange(value === y ? undefined : y)
                      setDropdownOpen(false)
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
