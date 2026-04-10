import { useQuery } from "@tanstack/react-query"
import { departmentApi } from "./api"

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: departmentApi.fetchAll,
  })
}
