import { useCallback, useEffect, useState } from "react"
import {
  TIMESHEET_ACTIVE_FILTER_ID_KEY,
  TIMESHEET_FILTERS_STORAGE_KEY,
  type TimesheetFilter,
} from "./types"

function migrateFilter(raw: any): TimesheetFilter | null {
  if (!raw || typeof raw !== "object") return null
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null
  const departments = Array.isArray(raw.departments)
    ? raw.departments.filter((v: unknown): v is string => typeof v === "string")
    : []
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((v: unknown): v is string => typeof v === "string")
    : []
  if (departments.length === 0 && tags.length === 0) return null
  return {
    id: raw.id,
    name: raw.name,
    departments,
    tags,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  }
}

function readFiltersFromStorage(): TimesheetFilter[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(TIMESHEET_FILTERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(migrateFilter)
      .filter((f): f is TimesheetFilter => f !== null)
  } catch (err) {
    console.warn("Не удалось прочитать фильтры табеля из localStorage:", err)
    return []
  }
}

function writeFiltersToStorage(filters: TimesheetFilter[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(TIMESHEET_FILTERS_STORAGE_KEY, JSON.stringify(filters))
  } catch (err) {
    console.warn("Не удалось сохранить фильтры табеля в localStorage:", err)
  }
}

function readActiveFilterId(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(TIMESHEET_ACTIVE_FILTER_ID_KEY)
  } catch {
    return null
  }
}

function writeActiveFilterId(id: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (id) {
      window.localStorage.setItem(TIMESHEET_ACTIVE_FILTER_ID_KEY, id)
    } else {
      window.localStorage.removeItem(TIMESHEET_ACTIVE_FILTER_ID_KEY)
    }
  } catch (err) {
    console.warn("Не удалось сохранить активный фильтр табеля:", err)
  }
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `filter_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  for (const v of b) {
    if (!sa.has(v)) return false
  }
  return true
}

export interface UseTimesheetFiltersResult {
  filters: TimesheetFilter[]
  isReady: boolean
  activeFilterId: string | null
  isFilterActive: (
    filter: TimesheetFilter,
    current: { departments: Set<string>; tags: Set<string> }
  ) => boolean
  saveFilter: (name: string, departments: string[], tags: string[]) => TimesheetFilter | null
  deleteFilter: (id: string) => void
  renameFilter: (id: string, name: string) => void
  setActiveFilterId: (id: string | null) => void
}

export function useTimesheetFilters(): UseTimesheetFiltersResult {
  const [filters, setFilters] = useState<TimesheetFilter[]>([])
  const [activeFilterId, setActiveFilterIdState] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setFilters(readFiltersFromStorage())
    setActiveFilterIdState(readActiveFilterId())
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (!isReady) return
    writeFiltersToStorage(filters)
  }, [filters, isReady])

  useEffect(() => {
    if (!isReady) return
    writeActiveFilterId(activeFilterId)
  }, [activeFilterId, isReady])

  const saveFilter = useCallback(
    (name: string, departments: string[], tags: string[]): TimesheetFilter | null => {
      const trimmed = name.trim()
      if (!trimmed) return null
      const total = departments.length + tags.length
      if (total === 0) return null
      const filter: TimesheetFilter = {
        id: makeId(),
        name: trimmed,
        departments: Array.from(new Set(departments)),
        tags: Array.from(new Set(tags)),
        createdAt: new Date().toISOString(),
      }
      setFilters((prev) => [...prev, filter])
      return filter
    },
    []
  )

  const deleteFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id))
    setActiveFilterIdState((prev) => (prev === id ? null : prev))
  }, [])

  const renameFilter = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)))
  }, [])

  const setActiveFilterId = useCallback((id: string | null) => {
    setActiveFilterIdState(id)
  }, [])

  const isFilterActive = useCallback(
    (
      filter: TimesheetFilter,
      current: { departments: Set<string>; tags: Set<string> }
    ): boolean => {
      return (
        sameStringSet(filter.departments, Array.from(current.departments)) &&
        sameStringSet(filter.tags, Array.from(current.tags))
      )
    },
    []
  )

  return {
    filters,
    isReady,
    activeFilterId,
    isFilterActive,
    saveFilter,
    deleteFilter,
    renameFilter,
    setActiveFilterId,
  }
}
