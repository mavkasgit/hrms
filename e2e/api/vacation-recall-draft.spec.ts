/**
 * Отзыв из отпуска через черновик: редактор коммитит черновик (#31), затем
 * родительский вызов /vacations/{id}/recall с тем же draft_id.
 *
 * Баг #109: отпускной сервис повторно вызывал create_order(draft_id), файлы
 * черновика уже удалены self-commit'ом → 404 «Черновик не найден»; отпуск
 * не отзывался. Фикс: переиспользуем закоммиченный приказ (source_draft_id).
 *
 * Требует ONLYOFFICE_ENABLED=true на бэкенде (как draft-commit-idempotent).
 */
import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Vacation recall via committed draft @api', () => {
  test.setTimeout(90_000)

  test('@api recall after editor commit: single order + vacation recalled', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    const emp = await apiOps.createEmployee({ name: `e2e-recall-draft-${u}` })
    let recallOrderId: number | undefined
    let draftId: string | undefined
    try {
      const vac = await apiOps.createVacation(emp.id, {
        start_date: '2026-08-01',
        end_date: '2026-08-14',
        order_date: '2026-07-25',
      })

      const typeId = await apiOps.getOrderTypeId({ code: 'vacation_recall' })
      const orderNumber = `E2ERC${Date.now().toString().slice(-6)}`

      // Черновик отзыва (как в форме UI) → commit как редактор (#31).
      const draft = await apiOps.createOrderDraft({
        employee_id: emp.id,
        order_type_id: typeId,
        order_date: '2026-08-12',
        order_number: orderNumber,
        extra_fields: {
          recall_date: '2026-08-07',
          old_vacation_start: '2026-08-01',
          old_vacation_end: '2026-08-14',
          old_vacation_days: 14,
        },
      })
      draftId = draft.draft_id
      expect(draftId).toBeTruthy()

      const committed = (await apiOps.commitOrderDraft(draftId)) as { id: number }
      expect(committed.id, 'editor commit returns a real order').toBeGreaterThan(0)
      recallOrderId = committed.id

      // Родительский вызов с тем же draft_id (#109) — не создаёт второй приказ.
      const resp = await request.post(`${API_BASE}/api/vacations/${vac.id}/recall`, {
        data: {
          recall_date: '2026-08-07',
          order_date: '2026-08-12',
          order_number: orderNumber,
          draft_id: draftId,
        },
      })
      expect(resp.status()).toBe(200)
      const result = await resp.json()
      expect(result.recall_order_id).toBe(committed.id)
      expect(result.recall_order_number).toBe(orderNumber)

      // Приказ один — без дубля от второго create_order.
      const orders = await apiOps.getOrders({ order_number: orderNumber })
      const matching = orders.filter((o) => o.order_number === orderNumber)
      expect(matching.length).toBe(1)
    } finally {
      if (recallOrderId) await apiOps.deleteOrder(recallOrderId).catch(() => {})
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })
})
