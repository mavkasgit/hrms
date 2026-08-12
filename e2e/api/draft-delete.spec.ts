/**
 * Контракт удаления черновиков/документов пары «уведомление/заявление» (#84, #98).
 *
 * delete_draft (черновик, is_draft=True):
 * - DELETE /notifications/{id} | /statements/{id} → 204, строка удалена, GET → 404,
 *   черновик исчез из `/drafts`;
 * - DELETE на уже созданный документ (is_draft=False) → 409, строка цела.
 *
 * delete_document (отдельный use-case, #98):
 * - DELETE /notifications/{id}/document | /statements/{id}/document → 204 на документе;
 * - на черновике → 409.
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

  async function commitDraft(
    kind: 'notification' | 'statement',
    request: import('@playwright/test').APIRequestContext,
    id: number
  ): Promise<void> {
    const entity = kind === 'notification' ? 'notifications' : 'statements'
    const resp = await request.post(`${API_BASE}/api/${entity}/${id}/commit`)
    expect(resp.status(), `${kind} commit status`).toBe(200)
  }

  async function createCommittedDraft(
    kind: 'notification' | 'statement',
    request: import('@playwright/test').APIRequestContext,
    u: string
  ): Promise<number> {
    const id = await createDraft(kind, request, u)
    await commitDraft(kind, request, id)
    return id
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

  // ── Guard #98: delete_draft не удаляет созданный документ (is_draft=False) ─

  test('@api committed notification: DELETE (draft route) → 409, row preserved', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      id = await createCommittedDraft('notification', request, u)

      const delResp = await request.delete(`${API_BASE}/api/notifications/${id}`)
      expect(delResp.status(), 'DELETE committed via draft route must be 409').toBe(409)

      const getResp = await request.get(`${API_BASE}/api/notifications/${id}`)
      expect(getResp.status(), 'committed notification must be preserved').toBe(200)
    } finally {
      if (id) await request.delete(`${API_BASE}/api/notifications/${id}/document`).catch(() => {})
      await dispose()
    }
  })

  test('@api committed statement: DELETE (draft route) → 409, row preserved', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      id = await createCommittedDraft('statement', request, u)

      const delResp = await request.delete(`${API_BASE}/api/statements/${id}`)
      expect(delResp.status(), 'DELETE committed via draft route must be 409').toBe(409)

      const getResp = await request.get(`${API_BASE}/api/statements/${id}`)
      expect(getResp.status(), 'committed statement must be preserved').toBe(200)
    } finally {
      if (id) await request.delete(`${API_BASE}/api/statements/${id}/document`).catch(() => {})
      await dispose()
    }
  })

  // ── delete_document: отдельный use-case (#98) ─────────────────────────────

  test('@api notification document: DELETE /document → 204, row gone', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      id = await createCommittedDraft('notification', request, u)

      const delResp = await request.delete(`${API_BASE}/api/notifications/${id}/document`)
      expect(delResp.status(), 'DELETE document must be 204').toBe(204)

      const getResp = await request.get(`${API_BASE}/api/notifications/${id}`)
      expect(getResp.status(), 'GET after document delete must be 404').toBe(404)
      id = undefined
    } finally {
      if (id) await request.delete(`${API_BASE}/api/notifications/${id}/document`).catch(() => {})
      await dispose()
    }
  })

  test('@api statement document: DELETE /document → 204, row gone', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      id = await createCommittedDraft('statement', request, u)

      const delResp = await request.delete(`${API_BASE}/api/statements/${id}/document`)
      expect(delResp.status(), 'DELETE document must be 204').toBe(204)

      const getResp = await request.get(`${API_BASE}/api/statements/${id}`)
      expect(getResp.status(), 'GET after document delete must be 404').toBe(404)
      id = undefined
    } finally {
      if (id) await request.delete(`${API_BASE}/api/statements/${id}/document`).catch(() => {})
      await dispose()
    }
  })

  test('@api notification draft: DELETE /document → 409, row preserved', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      id = await createDraft('notification', request, u)

      const delResp = await request.delete(`${API_BASE}/api/notifications/${id}/document`)
      expect(delResp.status(), 'DELETE /document on draft must be 409').toBe(409)

      const getResp = await request.get(`${API_BASE}/api/notifications/${id}`)
      expect(getResp.status(), 'draft must be preserved').toBe(200)
    } finally {
      if (id) await request.delete(`${API_BASE}/api/notifications/${id}`).catch(() => {})
      await dispose()
    }
  })
})
