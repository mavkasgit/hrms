import type { QueryClient } from "@tanstack/react-query"

/**
 * Полный набор кэшей, затрагиваемых созданием/изменением/удалением приказа
 * (в т.ч. через редактор OnlyOffice). Единая точка инвалидации: мутации
 * (`useOrders`/`useOnlyOffice`) и глобальный слушатель сохранения в `Layout`
 * используют один и тот же набор, чтобы таблицы и балансы не расходились.
 */
export function invalidateOrderQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["vacation-periods"], refetchType: "all" })
  queryClient.invalidateQueries({ queryKey: ["vacation-history"], refetchType: "all" })
  queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
  queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
  queryClient.invalidateQueries({ queryKey: ["vacations"], refetchType: "all" })
  queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
  queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
  queryClient.invalidateQueries({ queryKey: ["next-order-number"] })
  queryClient.invalidateQueries({ queryKey: ["order-drafts"] })
  queryClient.invalidateQueries({ queryKey: ["order-years"] })
}
