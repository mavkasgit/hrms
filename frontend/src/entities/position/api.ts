import api from "@/shared/api/axios"
import type { Position, PositionCreate, PositionUpdate } from "./types"

export const positionApi = {
  async fetchAll(): Promise<Position[]> {
    const { data } = await api.get<Position[]>(`/positions`)
    return data
  },

  async create(data: PositionCreate): Promise<Position> {
    const { data: result } = await api.post<Position>(`/positions`, data)
    return result
  },

  async update(id: number, data: PositionUpdate): Promise<Position> {
    const { data: result } = await api.patch<Position>(`/positions/${id}`, data)
    return result
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    const { data } = await api.delete<{ ok: boolean }>(`/positions/${id}`)
    return data
  },

  async getUsage(id: number): Promise<{ employee_count: number }> {
    const { data } = await api.get<{ employee_count: number }>(`/positions/${id}/usage`)
    return data
  },
}
