import axios from "axios"
import type { Tag } from "./types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

export const tagApi = {
  async fetchAll() {
    const { data } = await axios.get<Tag[]>(`${API_URL}/tags`)
    return data
  },
}
