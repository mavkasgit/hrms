import axios from "axios"
import type { Tag, TagCreate, TagUpdate } from "./types"

const API_URL = import.meta.env.VITE_API_URL || "/api"

export const tagApi = {
  async fetchAll(): Promise<Tag[]> {
    const { data } = await axios.get<Tag[]>(`${API_URL}/tags`)
    return data
  },

  async create(data: TagCreate): Promise<Tag> {
    const { data: result } = await axios.post<Tag>(`${API_URL}/tags`, data)
    return result
  },

  async update(id: number, data: TagUpdate): Promise<Tag> {
    const { data: result } = await axios.patch<Tag>(`${API_URL}/tags/${id}`, data)
    return result
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    const { data } = await axios.delete<{ ok: boolean }>(`${API_URL}/tags/${id}`)
    return data
  },

  async assignTag(employeeId: number, tagId: number): Promise<{ ok: boolean }> {
    const { data } = await axios.post<{ ok: boolean }>(
      `${API_URL}/tags/assign?employee_id=${employeeId}&tag_id=${tagId}`
    )
    return data
  },

  async unassignTag(employeeId: number, tagId: number): Promise<{ ok: boolean }> {
    const { data } = await axios.delete<{ ok: boolean }>(
      `${API_URL}/tags/unassign?employee_id=${employeeId}&tag_id=${tagId}`
    )
    return data
  },
}
