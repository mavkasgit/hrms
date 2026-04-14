import axios from "axios"
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

const API_URL = import.meta.env.VITE_API_URL || "/api"

export const departmentApi = {
  /* Граф */
  async fetchGraph(): Promise<DepartmentGraphResponse> {
    const { data } = await axios.get<DepartmentGraphResponse>(`${API_URL}/departments/graph`)
    return data
  },

  /* Плоский список */
  async fetchAll(): Promise<FlatDepartmentNode[]> {
    const { data } = await axios.get<FlatDepartmentNode[]>(`${API_URL}/departments`)
    return data
  },

  /* Один department */
  async fetchOne(id: number): Promise<FlatDepartmentNode> {
    const { data } = await axios.get<FlatDepartmentNode>(`${API_URL}/departments/${id}`)
    return data
  },

  /* CRUD */
  async create(data: DepartmentCreate): Promise<FlatDepartmentNode> {
    const { data: result } = await axios.post<FlatDepartmentNode>(`${API_URL}/departments`, data)
    return result
  },

  async update(id: number, data: DepartmentUpdate): Promise<FlatDepartmentNode> {
    const { data: result } = await axios.patch<FlatDepartmentNode>(`${API_URL}/departments/${id}`, data)
    return result
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    const { data } = await axios.delete<{ ok: boolean }>(`${API_URL}/departments/${id}`)
    return data
  },

  /* Связи (links) */
  async createLink(headId: number, data: DepartmentLinkCreate): Promise<DepartmentLinkResponse> {
    const { data: result } = await axios.post<DepartmentLinkResponse>(
      `${API_URL}/departments/${headId}/links`,
      data,
    )
    return result
  },

  async deleteLink(headId: number, childId: number): Promise<{ ok: boolean }> {
    const { data } = await axios.delete<{ ok: boolean }>(
      `${API_URL}/departments/${headId}/links/${childId}`,
    )
    return data
  },

  async getLinks(deptId: number): Promise<DepartmentLinkResponse[]> {
    const { data } = await axios.get<DepartmentLinkResponse[]>(
      `${API_URL}/departments/${deptId}/links`,
    )
    return data
  },

  /* Теги подразделений */
  async assignTag(deptId: number, data: DepartmentTagAssign): Promise<DepartmentTagResponse> {
    const { data: result } = await axios.post<DepartmentTagResponse>(
      `${API_URL}/departments/${deptId}/tags`,
      data,
    )
    return result
  },

  async unassignTag(deptId: number, tagId: number): Promise<{ ok: boolean }> {
    const { data } = await axios.delete<{ ok: boolean }>(
      `${API_URL}/departments/${deptId}/tags/${tagId}`,
    )
    return data
  },

  async getTags(deptId: number): Promise<TagRef[]> {
    const { data } = await axios.get<TagRef[]>(`${API_URL}/departments/${deptId}/tags`)
    return data
  },
}
