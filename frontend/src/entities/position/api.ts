import axios from "axios"
import type { PositionListResponse } from "./types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

export const positionApi = {
  async fetchAll() {
    const { data } = await axios.get<PositionListResponse>(`${API_URL}/positions`)
    return data.items
  },
}
