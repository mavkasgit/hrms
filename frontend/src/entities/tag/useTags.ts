import { useQuery } from "@tanstack/react-query"
import { tagApi } from "./api"

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: tagApi.fetchAll,
  })
}
