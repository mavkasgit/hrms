import { useState, useEffect, useMemo, useRef, type UIEvent } from "react"
import { Search, X, Check } from "lucide-react"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { useVacations } from "@/entities/vacation"
import { getVacations } from "@/entities/vacation/api"
import type { Vacation } from "@/entities/vacation/types"
import { useQuery } from "@tanstack/react-query"
import { formatDate } from "@/shared/utils/date"

const TABLE_PAGE_SIZE = 25

interface VacationSelectorProps {
  selectedVacation?: Vacation | null
  onSelect: (vacation: Vacation | null) => void
  showEmployeeColumn?: boolean
  children?: React.ReactNode
}

export function VacationSelector({
  selectedVacation,
  onSelect,
  showEmployeeColumn = true,
  children,
}: VacationSelectorProps) {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [isShowAllMode, setIsShowAllMode] = useState(false)
  const [tablePage, setTablePage] = useState(1)
  const [tableRows, setTableRows] = useState<Vacation[]>([])
  const [tableTotal, setTableTotal] = useState(0)
  const loadingNextPageRef = useRef(false)

  // Sync search with selected vacation
  useEffect(() => {
    if (selectedVacation && selectedVacation.start_date && selectedVacation.end_date) {
      setSearch(`${selectedVacation.employee_name} • ${formatDate(selectedVacation.start_date)} — ${formatDate(selectedVacation.end_date)}`)
    }
  }, [selectedVacation])

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const searchQuery = debouncedSearch.trim()
  const searchEmployeeId = selectedVacation?.employee_id

  const {
    data: tablePageData,
    isLoading: isLoadingTableFirstPage,
    isFetching: isFetchingTablePage,
  } = useVacations({
    page: tablePage,
    per_page: TABLE_PAGE_SIZE,
    vacation_type: "Трудовой",
  })

  const {
    data: searchData,
    isLoading: isSearching,
  } = useQuery({
    queryKey: ["vacation-selector-search", searchQuery, searchEmployeeId],
    enabled: searchQuery.length > 0,
    queryFn: () =>
      getVacations({
        q: searchQuery,
        employee_id: searchEmployeeId,
        vacation_type: "Трудовой",
        page: 1,
        per_page: searchEmployeeId ? 1000 : 100,
      }),
  })

  useEffect(() => {
    const items = tablePageData?.items || []
    setTableTotal(tablePageData?.total || 0)
    setTableRows((prev) => {
      const merged = tablePage === 1 ? items : [...prev, ...items]
      const seen = new Set<number>()
      return merged.filter((v) => {
        if (seen.has(v.id)) return false
        seen.add(v.id)
        return true
      })
    })
  }, [tablePageData, tablePage])

  useEffect(() => {
    loadingNextPageRef.current = false
  }, [tablePageData?.page, isFetchingTablePage])

  const hasMoreTableRows = tableRows.length < tableTotal
  const isLoading = isLoadingTableFirstPage && tableRows.length === 0

  const dropdownVacations = useMemo(() => {
    if (searchQuery.length > 0) return searchData?.items || []
    return tableRows
  }, [searchQuery, searchData, tableRows])

  const tableVacations = useMemo(() => {
    if (selectedVacation) return [selectedVacation]
    return tableRows
  }, [selectedVacation, tableRows])

  const handleSelect = (v: Vacation) => {
    setSearch(`${v.employee_name} • ${formatDate(v.start_date)} — ${formatDate(v.end_date)}`)
    onSelect(v)
    setShowDropdown(false)
  }

  const handleClear = () => {
    setSearch("")
    setDebouncedSearch("")
    onSelect(null)
  }

  const handleTableScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!isShowAllMode || selectedVacation) return
    if (!hasMoreTableRows || isFetchingTablePage || loadingNextPageRef.current) return
    const target = event.currentTarget
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 48
    if (!nearBottom) return
    loadingNextPageRef.current = true
    setTablePage((prev) => prev + 1)
  }

  return (
    <div>
      {/* Searchbar */}
      <div className="relative" style={{ width: 500 }}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по сотруднику, типу отпуска, приказу..."
          value={search}
          onChange={(e) => {
            if (selectedVacation && e.target.value !== search) {
              onSelect(null)
            }
            setSearch(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          className="pl-8 h-9 text-sm pr-8"
          style={{ width: 500 }}
        />
        {(search || selectedVacation) && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Dropdown */}
        {showDropdown && (dropdownVacations.length > 0 || isSearching) && (
          <div
            className="absolute z-50 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto"
            style={{ width: 500 }}
            onMouseDown={(e) => e.preventDefault()}
            onBlur={() => setShowDropdown(false)}
          >
            {isSearching && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Поиск отпусков...</div>
            )}
            {!isSearching && dropdownVacations.slice(0, 10).map((v) => (
              <div
                key={v.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm ${
                  selectedVacation?.id === v.id ? "bg-blue-50" : ""
                }`}
                onClick={() => handleSelect(v)}
              >
                {selectedVacation?.id === v.id && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {showEmployeeColumn ? v.employee_name : ""}
                    {!showEmployeeColumn && `${formatDate(v.start_date)} — ${formatDate(v.end_date)}`}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {showEmployeeColumn && (
                      <span>{formatDate(v.start_date)} — {formatDate(v.end_date)}</span>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{v.vacation_type}</Badge>
                    {v.order_number && <span>№{v.order_number}</span>}
                    <span className="tabular-nums">{v.days_count} дн.</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Children (form) */}
      {children}

      {/* Table */}
      <div className="mt-4">
        {isLoading ? (
          <div className="px-6 py-6 text-sm text-muted-foreground"><Skeleton className="h-32 w-full" /></div>
        ) : tableVacations.length === 0 ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">Нет отпусков</div>
        ) : (
          <>
            {!selectedVacation && !isShowAllMode && tableTotal > TABLE_PAGE_SIZE && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-700"
                  onClick={() => setIsShowAllMode(true)}
                >
                  Показать все
                </button>
              </div>
            )}
            <div
              className={isShowAllMode && !selectedVacation ? "max-h-[460px] overflow-auto border rounded-md" : ""}
              onScroll={handleTableScroll}
            >
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {showEmployeeColumn && <th className="text-left px-4 py-3 font-medium">Сотрудник</th>}
                    <th className="text-left px-4 py-3 font-medium">Начало</th>
                    <th className="text-left px-4 py-3 font-medium">Конец</th>
                    <th className="text-left px-4 py-3 font-medium">Тип</th>
                    <th className="text-left px-4 py-3 font-medium">Приказ</th>
                    <th className="text-left px-4 py-3 font-medium">Дней</th>
                    <th className="w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {tableVacations.map((v) => (
                    <tr
                      key={v.id}
                      className={`border-t cursor-pointer hover:bg-muted/30 ${selectedVacation?.id === v.id ? "bg-blue-50" : ""}`}
                      onClick={() => handleSelect(v)}
                    >
                      {showEmployeeColumn && <td className="px-4 py-3 font-medium">{v.employee_name || "—"}</td>}
                      <td className="px-4 py-3">{formatDate(v.start_date)}</td>
                      <td className="px-4 py-3">{formatDate(v.end_date)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{v.vacation_type}</Badge>
                      </td>
                      <td className="px-4 py-3">{v.order_number || "—"}</td>
                      <td className="px-4 py-3">{v.days_count}</td>
                      <td className="px-4 py-3">
                        {selectedVacation?.id === v.id && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isShowAllMode && !selectedVacation && (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  {isFetchingTablePage && hasMoreTableRows
                    ? "Загрузка следующих отпусков..."
                    : hasMoreTableRows
                      ? "Прокрутите вниз для подгрузки"
                      : "Загружены все отпуска"}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
