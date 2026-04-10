import { useQuery } from "@tanstack/react-query"
import { positionApi } from "./api"

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: positionApi.fetchAll,
  })
}
