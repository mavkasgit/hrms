import api from "@/shared/api/axios"
import type { Tag, TagCreate, TagUpdate } from "./types"

export const tagApi = {
  async fetchAll(): Promise<Tag[]> {
    const { data } = await api.get<Tag[]>(`/tags`)
    return data
  },

  async create(data: TagCreate): Promise<Tag> {
    const { data: result } = await api.post<Tag>(`/tags`, data)
    return result
  },

  async update(id: number, data: TagUpdate): Promise<Tag> {
    const { data: result } = await api.patch<Tag>(`/tags/${id}`, data)
    return result
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    const { data } = await api.delete<{ ok: boolean }>(`/tags/${id}`)
    return data
  },

  async assignTag(employeeId: number, tagId: number): Promise<{ ok: boolean }> {
    const { data } = await api.post<{ ok: boolean }>(
      `/tags/assign?employee_id=${employeeId}&tag_id=${tagId}`
    )
    return data
  },

  async unassignTag(employeeId: number, tagId: number): Promise<{ ok: boolean }> {
    const { data } = await api.delete<{ ok: boolean }>(
      `/tags/unassign?employee_id=${employeeId}&tag_id=${tagId}`
    )
    return data
  },

  async getUsage(id: number): Promise<{ employee_count: number; department_count: number }> {
    const { data } = await api.get<{ employee_count: number; department_count: number }>(`/tags/${id}/usage`)
    return data
  },
}
