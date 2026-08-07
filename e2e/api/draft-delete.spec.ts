/**
 * Контракт удаления черновиков/документов пары «уведомление/заявление» (#84).
 *
 * Удаление любого документа (черновик или финал) должно:
 * - возвращать 204 No Content (а не 200 + `{"message": ...}`);
 * - удалять DB-строку: повторный GET → 404;
 * - убирать черновик из объединённого списка `/drafts`.
 *
 * Физическое удаление файла доказано на backend pytest (test_draft_delete.py);
 * здесь — только внешний HTTP-контракт.
 *
 * Требует ONLYOFFICE_ENABLED=true на бэкенде (как в docker:test / CI e2e-smoke).
 */
import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Draft delete contract @api', () => {
  test.setTimeout(60_000)

  async function createDraft(
    kind: 'notification' | 'statement',
    request: import('@playwright/test').APIRequestContext,
    u: string
  ): Promise<number> {
    const entity = kind === 'notification' ? 'notifications' : 'statements'
    const title = kind === 'notification' ? `Уведомление ${u}` : `Заявление ${u}`
    const resp = await request.post(`${API_BASE}/api/${entity}/drafts`, {
      data: { title, date: '2026-01-02' },
    })
    expect(resp.status(), `${kind} draft create status`).toBe(200)
    const body = (await resp.json()) as { draft_id?: string; notification_id?: number; statement_id?: number }
    const id = kind === 'notification' ? body.notification_id : body.statement_id
    expect(id, `${kind} draft id`).toBeTruthy()
    return id as number
  }

  async function assertDeleted(
    kind: 'notification' | 'statement',
    request: import('@playwright/test').APIRequestContext,
    id: number
  ): Promise<void> {
    const entity = kind === 'notification' ? 'notifications' : 'statements'

    // Повторный GET → 404 (строка удалена).
    const getResp = await request.get(`${API_BASE}/api/${entity}/${id}`)
    expect(getResp.status(), `${kind} GET after delete`).toBe(404)

    // Черновик отсутствует в объединённом списке `/drafts`.
    const drafts = (await request
      .get(`${API_BASE}/api/drafts`)
      .then((r) => r.json())) as Array<{ draft_id: string }>
    expect(drafts.map((d) => d.draft_id)).not.toContain(`${kind}:${id}`)
  }

  test('@api notification draft: DELETE → 204, row gone, absent from /drafts', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      id = await createDraft('notification', request, u)

      const draftsBefore = (await request
        .get(`${API_BASE}/api/drafts`)
        .then((r) => r.json())) as Array<{ draft_id: string }>
      expect(draftsBefore.map((d) => d.draft_id)).toContain(`notification:${id}`)

      const delResp = await request.delete(`${API_BASE}/api/notifications/${id}`)
      expect(delResp.status(), 'DELETE status must be 204').toBe(204)

      await assertDeleted('notification', request, id)
      id = undefined
    } finally {
      if (id) await request.delete(`${API_BASE}/api/notifications/${id}`).catch(() => {})
      await dispose()
    }
  })

  test('@api statement draft: DELETE → 204, row gone, absent from /drafts', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      id = await createDraft('statement', request, u)

      const draftsBefore = (await request
        .get(`${API_BASE}/api/drafts`)
        .then((r) => r.json())) as Array<{ draft_id: string }>
      expect(draftsBefore.map((d) => d.draft_id)).toContain(`statement:${id}`)

      const delResp = await request.delete(`${API_BASE}/api/statements/${id}`)
      expect(delResp.status(), 'DELETE status must be 204').toBe(204)

      await assertDeleted('statement', request, id)
      id = undefined
    } finally {
      if (id) await request.delete(`${API_BASE}/api/statements/${id}`).catch(() => {})
      await dispose()
    }
  })

  test('@api order draft: DELETE → 204', async ({ playwright, apiOps }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let orderDraftId: string | undefined
    try {
      const emp = await apiOps.createEmployee({ name: `e2e-del-ord-${u}` })
      const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })
      const orderNumber = `E2EDO${Date.now().toString().slice(-6)}`

      const createResp = await request.post(`${API_BASE}/api/orders/drafts`, {
        data: {
          employee_id: emp.id,
          order_type_id: typeId,
          order_date: '2026-01-01',
          order_number: orderNumber,
        },
      })
      expect(createResp.status(), 'order draft create status').toBe(200)
      orderDraftId = (await createResp.json()).draft_id as string
      expect(orderDraftId).toBeTruthy()

      const delResp = await request.delete(`${API_BASE}/api/orders/drafts/${orderDraftId}`)
      expect(delResp.status(), 'DELETE order draft must be 204').toBe(204)

      const drafts = (await request
        .get(`${API_BASE}/api/drafts`)
        .then((r) => r.json())) as Array<{ draft_id: string }>
      expect(drafts.map((d) => d.draft_id)).not.toContain(orderDraftId)
      orderDraftId = undefined
    } finally {
      if (orderDraftId) {
        await request.delete(`${API_BASE}/api/orders/drafts/${orderDraftId}`).catch(() => {})
      }
      await dispose()
    }
  })
})
