/**
 * Идемпотентный commit приказа из черновика (#94 single, #95 group).
 *
 * Контракт (ADR-0009): повторный commit одного draft возвращает 200 с тем же
 * сериализованным Order (а не message-объект `{"duplicate": true}`).
 * Здесь — внешний HTTP-контракт double-commit для single и group черновиков.
 * Механика crash-recovery / stale lock покрыта backend pytest
 * (test_draft_commit_idempotent.py).
 *
 * Требует ONLYOFFICE_ENABLED=true на бэкенде (как в docker:test / CI e2e-smoke).
 */
import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Draft commit idempotency @api', () => {
  test.setTimeout(90_000)

  test('@api single draft: double commit returns the same order id', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    const emp = await apiOps.createEmployee({ name: `e2e-idem-single-${u}` })
    const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })
    const orderNumber = `E2EIDS${Date.now().toString().slice(-6)}`

    let committedOrderId: number | undefined
    let draftId: string | undefined
    try {
      const draft = await apiOps.createOrderDraft({
        employee_id: emp.id,
        order_type_id: typeId,
        order_date: '2026-01-05',
        order_number: orderNumber,
      })
      draftId = draft.draft_id
      expect(draftId).toBeTruthy()

      const first = (await apiOps.commitOrderDraft(draftId)) as { id: number }
      expect(first.id, 'first commit returns a real order').toBeGreaterThan(0)
      committedOrderId = first.id

      const second = (await apiOps.commitOrderDraft(draftId)) as { id: number }
      expect(second.id, 'second commit must return the SAME order').toBe(first.id)
    } finally {
      if (committedOrderId) await apiOps.deleteOrder(committedOrderId).catch(() => {})
      if (draftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${draftId}`).catch(() => {})
      }
      await dispose()
    }
  })

  test('@api group draft: double commit returns the same order id', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    const empA = await apiOps.createEmployee({ name: `e2e-idem-grp-${u}-a` })
    const empB = await apiOps.createEmployee({ name: `e2e-idem-grp-${u}-b` })
    const orderNumber = `E2EIDG${Date.now().toString().slice(-6)}`

    let committedOrderId: number | undefined
    let draftId: string | undefined
    try {
      const draft = await apiOps.createGroupDraft({
        order_type_code: 'vacation_unpaid_group',
        order_date: '2026-01-05',
        order_number: orderNumber,
        employees: [
          { employee_id: empA.id, vacation_days: 1 },
          { employee_id: empB.id, vacation_days: 1 },
        ],
        vacation_start: '2026-01-06',
      })
      draftId = draft.draft_id
      expect(draftId).toBeTruthy()

      const first = (await apiOps.commitGroupDraft(draftId)) as { id: number }
      expect(first.id, 'first commit returns a real order').toBeGreaterThan(0)
      committedOrderId = first.id

      const second = (await apiOps.commitGroupDraft(draftId)) as { id: number }
      expect(second.id, 'second commit must return the SAME order').toBe(first.id)
    } finally {
      if (committedOrderId) await apiOps.deleteOrder(committedOrderId).catch(() => {})
      if (draftId) {
        await request
          .delete(`${API_BASE}/api/orders/group-drafts/${draftId}`)
          .catch(() => {})
      }
      await dispose()
    }
  })
})
