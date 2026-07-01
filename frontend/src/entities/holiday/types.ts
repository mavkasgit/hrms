export interface Holiday {
  id: number
  date: string
  name: string | null
  year: number
  is_working_day?: boolean
}
