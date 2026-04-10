import axios from "axios"
import type { DepartmentListResponse } from "./types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

export const departmentApi = {
  async fetchAll() {
    const { data } = await axios.get<DepartmentListResponse>(`${API_URL}/departments`)
    return data.items
  },
}
