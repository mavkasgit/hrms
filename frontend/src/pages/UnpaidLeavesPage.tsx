import { AbsenceOrdersPage, unpaidLeavesConfig } from "@/features/absence-orders"

/** «Отпуск за свой счёт» — рендерится через общий каркас страниц отсутствий (Ref #78). */
export function UnpaidLeavesPage() {
  return <AbsenceOrdersPage config={unpaidLeavesConfig} />
}
