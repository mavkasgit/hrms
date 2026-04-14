import axios from "axios"
import type { Position, PositionCreate, PositionUpdate } from "./types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

export const positionApi = {
  async fetchAll(): Promise<Position[]> {
    const { data } = await axios.get<Position[]>(`${API_URL}/positions`)
    return data
  },

  async create(data: PositionCreate): Promise<Position> {
    const { data: result } = await axios.post<Position>(`${API_URL}/positions`, data)
    return result
  },

  async update(id: number, data: PositionUpdate): Promise<Position> {
    const { data: result } = await axios.patch<Position>(`${API_URL}/positions/${id}`, data)
    return result
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    const { data } = await axios.delete<{ ok: boolean }>(`${API_URL}/positions/${id}`)
    return data
  },
}
