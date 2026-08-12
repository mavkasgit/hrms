/**
 * Отпуск через draft_id защищён от реплея (#104/#96).
 *
 * Контракт (ADR-0009, #109): один POST /vacations с draft_id создаёт ровно одну
 * запись отпуска и один приказ (провенанс source_draft_id). Повторный POST с тем
 * же draft_id → 201 с тем ЖЕ отпуском и тем же приказом (идемпотентный контракт
 * durable UNIQUE(source_draft_id) + `find_by_source_draft_id`), дубль НЕ создаётся.
 * Бэкенд-механика (source_draft_created_by, admin-only commit) покрыта
 * backend pytest (test_draft_provenance_commit_authz.py).
 *
 * Требует ONLYOFFICE_ENABLED=true на бэкенде (как в docker:test / CI e2e-smoke).
 */
import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Vacation via draft_id protected from replay @api', () => {
  test.setTimeout(90_000)

  test('@api POST /vacations with draft_id → 1 vacation + 1 order; replay → same vacation', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    const emp = await apiOps.createEmployee({
      name: `e2e-vac-draft-${u}`,
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })
    const paidTypeId = await apiOps.getOrderTypeId({ code: 'vacation_paid' })
    const orderNumber = `E2EVDR${Date.now().toString().slice(-6)}`

    let createdOrderId: number | undefined
    let draftId: string | undefined
    try {
      const draft = await apiOps.createOrderDraft({
        employee_id: emp.id,
        order_type_id: paidTypeId,
        order_date: '2024-05-25',
        order_number: orderNumber,
        extra_fields: {
          vacation_start: '2024-06-01',
          vacation_end: '2024-06-05',
          vacation_type: 'Трудовой',
        },
      })
      draftId = draft.draft_id
      expect(draftId, 'draft_id must be generated').toBeTruthy()

      const payload = {
        employee_id: emp.id,
        start_date: '2024-06-01',
        end_date: '2024-06-05',
        vacation_type: 'Трудовой',
        order_date: '2024-05-25',
        draft_id: draftId,
      }

      // Первый POST: создаётся ровно один отпуск + один приказ (draft consumed).
      const first = await request.post('/api/vacations', { data: payload })
      expect([200, 201]).toContain(first.status())
      const vac = await first.json()
      expect(vac.id, 'vacation must be created').toBeTruthy()
      expect(vac.order_id, 'linked order must be created').toBeTruthy()
      createdOrderId = vac.order_id

      const listResp = await request.get('/api/vacations', {
        params: { employee_id: emp.id, per_page: 100 },
      })
      expect(listResp.status()).toBe(200)
      const list = await listResp.json()
      expect(list.total).toBe(1)
      expect(list.items[0].employee_id).toBe(emp.id)

      // Replay с тем же draft_id → 201 с тем ЖЕ отпуском и приказом (идемпотентный
      // контракт, durable UNIQUE(source_draft_id), ADR-0009): дубль не создаётся.
      const replay = await request.post('/api/vacations', { data: payload })
      expect([200, 201]).toContain(replay.status())
      const replayVac = await replay.json()
      expect(replayVac.id, 'replay returns the SAME vacation').toBe(vac.id)
      expect(replayVac.order_id, 'replay returns the SAME order').toBe(vac.order_id)

      const listAfter = await request.get('/api/vacations', {
        params: { employee_id: emp.id, per_page: 100 },
      })
      expect(listAfter.status()).toBe(200)
      expect((await listAfter.json()).total).toBe(1)
    } finally {
      if (createdOrderId) await apiOps.deleteOrder(createdOrderId).catch(() => {})
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })
})
