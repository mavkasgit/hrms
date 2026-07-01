import { useQuery } from "@tanstack/react-query"
import { SHIFT_TYPE_CATALOG } from "@/shared/config/shiftTypes"

export function useShiftTypes(_includeInactive = false) {
  return useQuery({
    queryKey: ["shift-types"],
    queryFn: async () => SHIFT_TYPE_CATALOG,
    staleTime: Infinity,
  })
}
