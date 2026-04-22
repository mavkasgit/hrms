import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { departmentApi } from "./api"
import type {
  DepartmentCreate,
  DepartmentUpdate,
  DepartmentLinkCreate,
  DepartmentTagAssign,
} from "./types"

/* Граф */
export function useDepartmentGraph() {
  return useQuery({
    queryKey: ["departments-graph"],
    queryFn: departmentApi.fetchGraph,
  })
}

/* Плоский список */
export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: departmentApi.fetchAll,
  })
}

/* CRUD */
export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DepartmentCreate) => departmentApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] })
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
    },
  })
}

export function useUpdateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DepartmentUpdate }) =>
      departmentApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] })
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
      qc.invalidateQueries({ queryKey: ["dashboard-birthdays"] })
      qc.invalidateQueries({ queryKey: ["dashboard-contracts"] })
      qc.invalidateQueries({ queryKey: ["dashboard-departments"] })
    },
  })
}

export function useDeleteDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => departmentApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] })
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
    },
  })
}

/* Связи */
export function useCreateDepartmentLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ headId, data }: { headId: number; data: DepartmentLinkCreate }) =>
      departmentApi.createLink(headId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
    },
  })
}

export function useDeleteDepartmentLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ headId, childId }: { headId: number; childId: number }) =>
      departmentApi.deleteLink(headId, childId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
    },
  })
}

/* Теги подразделений */
export function useAssignDepartmentTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deptId, data }: { deptId: number; data: DepartmentTagAssign }) =>
      departmentApi.assignTag(deptId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
      qc.invalidateQueries({ queryKey: ["dashboard-birthdays"] })
      qc.invalidateQueries({ queryKey: ["dashboard-contracts"] })
    },
  })
}

export function useUnassignDepartmentTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deptId, tagId }: { deptId: number; tagId: number }) =>
      departmentApi.unassignTag(deptId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
      qc.invalidateQueries({ queryKey: ["dashboard-birthdays"] })
      qc.invalidateQueries({ queryKey: ["dashboard-contracts"] })
    },
  })
}

/* Обратная совместимость — старый fetchTree больше не работает,
   возвращаем пустой массив. Лучше убрать при обновлении потребителей. */
export function useDepartmentsTree() {
  return useQuery({
    queryKey: ["departments-tree"],
    queryFn: async () => [],
    staleTime: Infinity,
  })
}
