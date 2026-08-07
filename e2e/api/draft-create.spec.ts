/**
 * Контракт единого create-пайплайна черновиков уведомлений/заявлений (#85).
 *
 * Создание черновика через общий `DocumentDraftService.create_draft` должно:
 * - возвращать 200 с `draft_id` и `notification_id` / `statement_id`;
 * - создавать строку-черновик (`is_draft=true` — видно в GET по id);
 * - показываться в объединённом списке `/drafts`.
 *
 * Переход «черновик → документ» (finalize) через живой OnlyOffice не тащится —
 * покрыт backend pytest (test_draft_lifecycle.py). Здесь — только внешний
 * HTTP-контракт create.
 *
 * Требует ONLYOFFICE_ENABLED=true на бэкенде (как в docker:test / CI e2e-smoke).
 */
import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Draft create contract @api', () => {
  test.setTimeout(60_000)

  async function createDraft(
    kind: 'notification' | 'statement',
    request: import('@playwright/test').APIRequestContext,
    u: string
  ): Promise<{ id: number; draftId: string }> {
    const entity = kind === 'notification' ? 'notifications' : 'statements'
    const title = kind === 'notification' ? `Уведомление ${u}` : `Заявление ${u}`
    const resp = await request.post(`${API_BASE}/api/${entity}/drafts`, {
      data: { title, date: '2026-01-02' },
    })
    expect(resp.status(), `${kind} draft create status`).toBe(200)
    const body = (await resp.json()) as {
      draft_id: string
      notification_id?: number
      statement_id?: number
    }
    expect(body.draft_id, `${kind} draft_id`).toBeTruthy()
    const id = kind === 'notification' ? body.notification_id : body.statement_id
    expect(id, `${kind} entity id`).toBeTruthy()
    return { id: id as number, draftId: body.draft_id }
  }

  test('@api notification draft: POST → 200 with ids, is_draft row, visible in /drafts', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      const { id: notifId } = await createDraft('notification', request, u)
      id = notifId

      // GET по id подтверждает, что строка создана как черновик.
      const getResp = await request.get(`${API_BASE}/api/notifications/${notifId}`)
      expect(getResp.status()).toBe(200)
      const row = (await getResp.json()) as { is_draft?: boolean }
      expect(row.is_draft).toBe(true)

      // Черновик виден в объединённом списке /drafts под `notification:{id}`.
      const drafts = (await request
        .get(`${API_BASE}/api/drafts`)
        .then((r) => r.json())) as Array<{ draft_id: string }>
      expect(drafts.map((d) => d.draft_id)).toContain(`notification:${notifId}`)
    } finally {
      if (id) await request.delete(`${API_BASE}/api/notifications/${id}`).catch(() => {})
      await dispose()
    }
  })

  test('@api statement draft: POST → 200 with ids, is_draft row, visible in /drafts', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let id: number | undefined
    try {
      const { id: stmtId } = await createDraft('statement', request, u)
      id = stmtId

      const getResp = await request.get(`${API_BASE}/api/statements/${stmtId}`)
      expect(getResp.status()).toBe(200)
      const row = (await getResp.json()) as { is_draft?: boolean }
      expect(row.is_draft).toBe(true)

      const drafts = (await request
        .get(`${API_BASE}/api/drafts`)
        .then((r) => r.json())) as Array<{ draft_id: string }>
      expect(drafts.map((d) => d.draft_id)).toContain(`statement:${stmtId}`)
    } finally {
      if (id) await request.delete(`${API_BASE}/api/statements/${id}`).catch(() => {})
      await dispose()
    }
  })
})
