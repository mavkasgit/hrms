import api from "@/shared/api/axios"
import type {
  DepartmentGraphResponse,
  FlatDepartmentNode,
  DepartmentCreate,
  DepartmentUpdate,
  DepartmentLinkCreate,
  DepartmentLinkResponse,
  DepartmentTagAssign,
  DepartmentTagResponse,
  TagRef,
} from "./types"

export const departmentApi = {
  /* Граф */
  async fetchGraph(): Promise<DepartmentGraphResponse> {
    const { data } = await api.get<DepartmentGraphResponse>(`/departments/graph`)
    return data
  },

  /* Плоский список */
  async fetchAll(): Promise<FlatDepartmentNode[]> {
    const { data } = await api.get<FlatDepartmentNode[]>(`/departments`)
    return data
  },

  /* Один department */
  async fetchOne(id: number): Promise<FlatDepartmentNode> {
    const { data } = await api.get<FlatDepartmentNode>(`/departments/${id}`)
    return data
  },

  /* CRUD */
  async create(data: DepartmentCreate): Promise<FlatDepartmentNode> {
    const { data: result } = await api.post<FlatDepartmentNode>(`/departments`, data)
    return result
  },

  async update(id: number, data: DepartmentUpdate): Promise<FlatDepartmentNode> {
    const { data: result } = await api.patch<FlatDepartmentNode>(`/departments/${id}`, data)
    return result
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    const { data } = await api.delete<{ ok: boolean }>(`/departments/${id}`)
    return data
  },

  /* Связи (links) */
  async createLink(headId: number, data: DepartmentLinkCreate): Promise<DepartmentLinkResponse> {
    const { data: result } = await api.post<DepartmentLinkResponse>(
      `/departments/${headId}/links`,
      data,
    )
    return result
  },

  async deleteLink(headId: number, childId: number): Promise<{ ok: boolean }> {
    const { data } = await api.delete<{ ok: boolean }>(
      `/departments/${headId}/links/${childId}`,
    )
    return data
  },

  async getLinks(deptId: number): Promise<DepartmentLinkResponse[]> {
    const { data } = await api.get<DepartmentLinkResponse[]>(
      `/departments/${deptId}/links`,
    )
    return data
  },

  /* Теги подразделений */
  async assignTag(deptId: number, data: DepartmentTagAssign): Promise<DepartmentTagResponse> {
    const { data: result } = await api.post<DepartmentTagResponse>(
      `/departments/${deptId}/tags`,
      data,
    )
    return result
  },

  async unassignTag(deptId: number, tagId: number): Promise<{ ok: boolean }> {
    const { data } = await api.delete<{ ok: boolean }>(
      `/departments/${deptId}/tags/${tagId}`,
    )
    return data
  },

  async getTags(deptId: number): Promise<TagRef[]> {
    const { data } = await api.get<TagRef[]>(`/departments/${deptId}/tags`)
    return data
  },

  async getUsage(id: number): Promise<{ employee_count: number; links_count: number; tags_count: number }> {
    const { data } = await api.get<{ employee_count: number; links_count: number; tags_count: number }>(`/departments/${id}/usage`)
    return data
  },
}
