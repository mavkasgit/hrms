import { AbsenceOrdersPage, weekendCallsConfig } from "@/features/absence-orders"

/** «Вызовы в выходные дни» — рендерится через общий каркас страниц отсутствий (Ref #78). */
export function WeekendCallsPage() {
  return <AbsenceOrdersPage config={weekendCallsConfig} />
}
