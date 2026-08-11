/**
 * ADR-0006: единый HTTP-маппинг OnlyOffice-колбэков (onlyoffice_callback_pipeline).
 *
 * Через реальный HTTP-стек (без живой Document Server) проверяется поведение
 * callback-пайплайна:
 * - status 6 + недостижимый url → download-failure → 500 {"error": 1} — единый
 *   маппинг для всех видов (notification, order-draft, statement);
 * - status 6 + url на несуществующем order → missing-target (resolve_target=None)
 *   → ACK 200 {"error": 0} (запись/файл не найдены — ретрай не поможет);
 * - status 3/7 → FAILED (не скачиваем) → 200 {"error": 0};
 * - status 4/прочие → IGNORE (ACK без strategy/tracker) → 200 {"error": 0};
 * - status 2/6 + достижимый url → successful download → 200 {"error": 0}
 *   (в качестве файла-источника — собственный /api/health бэкенда, без mock-сервера);
 * - request_forcesave: document_key с неверным префиксом → 422,
 *   неизвестный ключ → 502 (OnlyOffice не принял команду).
 *
 * Callback-токен подписывается тем же JWT-секретом, что и бэкенд
 * (ONLYOFFICE_JWT_SECRET): значение обязано быть задано (см. e2e/.env.example)
 * и совпадать с secret'ом backend-окружения под тестом (dev / test / CI).
 * Требует ONLYOFFICE_ENABLED=true (docker:test / CI e2e-smoke).
 *
 * Test 1 устойчив к окружению: если у черновика уведомления нет file_path
 * (шаблон/файл не создан), pipeline вернёт ACK 200 error:0 (target_not_found),
 * а не 500 — такой кейс аккуратно пропускается (skip), а не падает.
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'
import { onlyOfficeToken } from '../helpers/onlyoffice-token'

/**
 * URL, по которому бэкенд сам для себя скачивает файл при успешном download
 * (status 2/6). Каноническое test-окружение — docker:test, где бэкенд доступен
 * сам себе по compose-имени http://backend:8000 (как BACKEND_INTERNAL_CALLBACK_URL).
 * Нативный dev-бэкенд (порт E2E_API_URL) — переопределяется E2E_OO_DOWNLOAD_URL.
 */
const OO_DOWNLOAD_BASE = process.env.E2E_OO_DOWNLOAD_URL ?? 'http://backend:8000'

// OnlyOffice callback statuses (ADR-0006): 2/6 → PERSISTED (скачиваем),
// 3/7 → FAILED (не скачиваем даже с url), 4 → IGNORE (ACK 0 без strategy/tracker),
// прочие → IGNORE (ACK 0).
const OO_SAVE = 6 // «сохранение» → PERSISTED: скачиваем файл
const OO_SAVE_ALT = 2 // второй status сохранения → PERSISTED
const OO_FAILED = 3 // ошибка сохранения → FAILED, без скачивания
const OO_FAILED_ALT = 7 // вторая ошибка → FAILED, без скачивания
const OO_IGNORE = 4 // «закрыт без изменений» → IGNORE, ACK 0

const FAILED_STATUSES = [OO_FAILED, OO_FAILED_ALT]
const IGNORE_STATUSES = [OO_IGNORE, 1, 5, 'garbage']
const SAVE_STATUSES = [OO_SAVE_ALT, OO_SAVE]

test.describe('OnlyOffice callback unified mapping @api', () => {
  test.setTimeout(60_000)

  test('@api notification callback download-failure → 500 error:1', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    const createResp = await request.post('/api/notifications/drafts', {
      data: { title: `Уведомление ${u}`, date: '2026-01-02' },
    })
    expect(createResp.status()).toBe(200)
    const created = (await createResp.json()) as { notification_id?: number }
    expect(created.notification_id, 'notification draft id').toBeTruthy()
    const notifId = created.notification_id as number
    apiOps.trackNotification(notifId)

    // POST /api/notifications/drafts отдаёт только {draft_id, notification_id} —
    // наличие файла проверяем GET-ом черновика. Если file_path нет (шаблон/файл
    // не создан в окружении), callback вернёт ACK 200 error:0 (target_not_found),
    // а не download-failure — такой кейс пропускаем, а не падаем.
    const getResp = await request.get(`/api/notifications/${notifId}`)
    expect(getResp.status()).toBe(200)
    const notif = (await getResp.json()) as { file_path?: string | null }
    test.skip(
      !notif.file_path,
      'у черновика уведомления нет file_path — callback вернёт ACK 200 error:0, а не 500',
    )

    try {
      const token = onlyOfficeToken({ status: OO_SAVE })
      const resp = await request.post(`/api/notifications/${notifId}/onlyoffice/callback`, {
        data: { status: OO_SAVE, url: 'http://127.0.0.1:1/unreachable.docx', token },
      })
      expect(resp.status()).toBe(500)
      const body = (await resp.json()) as { error?: number }
      expect(body.error).toBe(1)
    } finally {
      await dispose()
    }
  })

  test('@api callback status 6 missing order → ACK 200 error:0', async ({
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const token = onlyOfficeToken({ status: OO_SAVE })
      const resp = await request.post('/api/orders/999999/onlyoffice/callback', {
        data: { status: OO_SAVE, url: 'http://127.0.0.1:1/unreachable.docx', token },
      })
      // resolve_target=None (запись не найдена) → ACK 200 {"error":0} — ретрай не поможет.
      expect(resp.status()).toBe(200)
      const body = (await resp.json()) as { error?: number }
      expect(body.error).toBe(0)
    } finally {
      await dispose()
    }
  })

  test('@api order-draft callback download-failure → 500 error:1', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let orderDraftId: string | undefined
    let empId: number | undefined
    try {
      const emp = await apiOps.createEmployee({ name: `e2e-cb-ord-${u}` })
      empId = emp.id
      const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })
      const createResp = await request.post('/api/orders/drafts', {
        data: {
          employee_id: emp.id,
          order_type_id: typeId,
          order_date: '2026-01-01',
          order_number: `E2ECB${Date.now().toString().slice(-6)}`,
        },
      })
      expect(createResp.status()).toBe(200)
      orderDraftId = (await createResp.json()).draft_id as string
      expect(orderDraftId, 'order draft id').toBeTruthy()

      const token = onlyOfficeToken({ status: OO_SAVE })
      const resp = await request.post(
        `/api/orders/drafts/${orderDraftId}/onlyoffice/callback`,
        {
          data: { status: OO_SAVE, url: 'http://127.0.0.1:1/unreachable.docx', token },
        }
      )
      expect(resp.status()).toBe(500)
      const body = (await resp.json()) as { error?: number }
      expect(body.error).toBe(1)
    } finally {
      if (orderDraftId) {
        await request.delete(`/api/orders/drafts/${orderDraftId}`).catch(() => {})
      }
      if (empId) await apiOps.deleteEmployee(empId).catch(() => {})
      await dispose()
    }
  })

  test('@api statement callback download-failure → 500 error:1', async ({
    playwright,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    let stmtId: number | undefined
    try {
      const createResp = await request.post('/api/statements/drafts', {
        data: { title: `Заявление ${u}`, date: '2026-01-02' },
      })
      expect(createResp.status()).toBe(200)
      const created = (await createResp.json()) as { statement_id?: number }
      stmtId = created.statement_id as number
      expect(stmtId, 'statement draft id').toBeTruthy()

      const token = onlyOfficeToken({ status: OO_SAVE })
      const resp = await request.post(`/api/statements/${stmtId}/onlyoffice/callback`, {
        data: { status: OO_SAVE, url: 'http://127.0.0.1:1/unreachable.docx', token },
      })
      expect(resp.status()).toBe(500)
      const body = (await resp.json()) as { error?: number }
      expect(body.error).toBe(1)
    } finally {
      if (stmtId) {
        await request.delete(`/api/statements/${stmtId}`).catch(() => {})
      }
      await dispose()
    }
  })

  for (const status of FAILED_STATUSES) {
    test(`@api callback status ${status} (FAILED) → 200 error:0`, async ({
      playwright,
    }) => {
      const { request, dispose } = await createAuthenticatedRequest(playwright)

      try {
        const token = onlyOfficeToken({ status })
        const resp = await request.post('/api/orders/999999/onlyoffice/callback', {
          data: { status, url: 'http://127.0.0.1:1/unreachable.docx', token },
        })
        // FAILED: не скачиваем (даже с url) → http_error=0 → 200 {"error":0}.
        expect(resp.status()).toBe(200)
        const body = (await resp.json()) as { error?: number }
        expect(body.error).toBe(0)
      } finally {
        await dispose()
      }
    })
  }

  for (const status of IGNORE_STATUSES) {
    test(`@api callback status ${String(status)} (IGNORE) → 200 error:0`, async ({
      playwright,
    }) => {
      const { request, dispose } = await createAuthenticatedRequest(playwright)

      try {
        const token = onlyOfficeToken({ status })
        const resp = await request.post('/api/orders/999999/onlyoffice/callback', {
          data: { status, token },
        })
        // IGNORE: ACK 0 без strategy/tracker → 200 {"error":0}.
        expect(resp.status()).toBe(200)
        const body = (await resp.json()) as { error?: number }
        expect(body.error).toBe(0)
      } finally {
        await dispose()
      }
    })
  }

  for (const status of SAVE_STATUSES) {
    test(`@api callback status ${status} successful download → 200 error:0`, async ({
      playwright,
      apiOps,
    }) => {
      const u = apiOps.uid()
      const { request, dispose } = await createAuthenticatedRequest(playwright)

      let orderDraftId: string | undefined
      let empId: number | undefined
      try {
        const emp = await apiOps.createEmployee({ name: `e2e-cb-ok-${status}-${u}` })
        empId = emp.id
        const typeId = await apiOps.getOrderTypeId({ code: 'transfer', visibleOnly: true })
        const createResp = await request.post('/api/orders/drafts', {
          data: {
            employee_id: emp.id,
            order_type_id: typeId,
            order_date: '2026-01-01',
            order_number: `E2ECB${status}${Date.now().toString().slice(-6)}`,
          },
        })
        expect(createResp.status()).toBe(200)
        orderDraftId = (await createResp.json()).draft_id as string
        expect(orderDraftId, 'order draft id').toBeTruthy()

        const token = onlyOfficeToken({ status })
        const resp = await request.post(
          `/api/orders/drafts/${orderDraftId}/onlyoffice/callback`,
          {
            data: { status, url: `${OO_DOWNLOAD_BASE}/api/health`, token },
          }
        )
        // PERSISTED: download успешен → http_error=0 → 200 {"error":0}.
        expect(resp.status()).toBe(200)
        const body = (await resp.json()) as { error?: number }
        expect(body.error).toBe(0)
      } finally {
        if (orderDraftId) {
          await request.delete(`/api/orders/drafts/${orderDraftId}`).catch(() => {})
        }
        if (empId) await apiOps.deleteEmployee(empId).catch(() => {})
        await dispose()
      }
    })
  }

  test('@api forcesave: неверный префикс document_key → 422', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const resp = await request.post('/api/orders/1/onlyoffice/forcesave', {
        data: { document_key: 'not-order-1-x', save_id: 'sid' },
      })
      expect(resp.status()).toBe(422)
      const body = (await resp.json()) as { error_code?: string }
      expect(body.error_code).toBe('invalid_onlyoffice_key')
    } finally {
      await dispose()
    }
  })

  test('@api forcesave: неизвестный ключ → 502 onlyoffice_forcesave_failed', async ({
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const resp = await request.post('/api/orders/1/onlyoffice/forcesave', {
        data: { document_key: 'order-1-unknown-key', save_id: 'sid' },
      })
      // DS не знает ключ (или недоступен) → force_save бросает → 502.
      expect(resp.status()).toBe(502)
      const body = (await resp.json()) as { error_code?: string }
      expect(body.error_code).toBe('onlyoffice_forcesave_failed')
    } finally {
      await dispose()
    }
  })
})
