export type SickLeaveStatus = 'active' | 'cancelled' | 'deleted';

export interface SickLeave {
  id: number;
  employee_id: number;
  employee_name: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: SickLeaveStatus;
  created_by: number;
  created_at: string;
  updated_by: number | null;
  comment: string | null;
}

export interface SickLeaveCreate {
  employee_id: number;
  start_date: string;
  end_date: string;
  comment?: string | null;
}

export interface SickLeaveUpdate {
  start_date?: string;
  end_date?: string;
  comment?: string | null;
}

export interface SickLeaveListResponse {
  items: SickLeave[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface SickLeaveSummary {
  employee_id: number;
  employee_name: string;
  department: string | null;
  total_sick_days: number;
  sick_leaves_count: number;
}
