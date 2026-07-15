import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Order type letter: standard types locked, custom types editable.
 * Legacy: ui/order-type-letter.spec.ts (API-only despite path).
 */
test.describe('Order type letter @api', () => {
  test.setTimeout(30_000)

  test('@api order-types: standard type letter cannot be changed', async ({
    playwright,
  }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const typesResp = await request.get('/api/order-types')
      expect(typesResp.status()).toBe(200)
      const typesData = await typesResp.json()
      const contractExtension = (typesData.items || []).find(
        (t: { code?: string; letter?: string | null; id?: number }) =>
          t.code === 'contract_extension'
      )
      expect(contractExtension).toBeTruthy()
      const originalLetter = contractExtension.letter
      // Attempt to flip letter — standard types must stay locked
      const attemptedLetter = originalLetter === 'к' ? 'л' : 'к'

      const updateResp = await request.put(`/api/order-types/${contractExtension.id}`, {
        data: { letter: attemptedLetter },
      })
      expect(updateResp.status()).toBe(403)
      const errorData = await updateResp.json()
      expect(errorData.detail).toContain('Нельзя изменить стандартный тип приказа')

      const getResp = await request.get('/api/order-types')
      const getData = await getResp.json()
      const found = (getData.items || []).find(
        (t: { id?: number; letter?: string | null }) => t.id === contractExtension.id
      )
      expect(found.letter).toBe(originalLetter)
    } finally {
      await dispose()
    }
  })

  test('@api order-types: custom type letter can be updated and reset', async ({
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const name = `e2e-order-type-${u}`
    const code = `e2e_custom_${u.replace(/[^a-z0-9_]/gi, '').slice(0, 20)}`
    let createdId: number | undefined

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const createResp = await request.post('/api/order-types', {
        data: {
          code,
          name,
          letter: 'л',
          show_in_orders_page: true,
          field_schema: [],
        },
      })
      expect([200, 201]).toContain(createResp.status())
      const created = await createResp.json()
      createdId = created.id
      expect(created.letter).toBe('л')

      const updateResp = await request.put(`/api/order-types/${created.id}`, {
        data: { letter: 'к' },
      })
      expect([200, 201]).toContain(updateResp.status())
      const updated = await updateResp.json()
      expect(updated.letter).toBe('к')

      const getResp = await request.get('/api/order-types')
      const getData = await getResp.json()
      const found = (getData.items || []).find(
        (t: { id?: number; letter?: string }) => t.id === created.id
      )
      expect(found.letter).toBe('к')

      const resetResp = await request.put(`/api/order-types/${created.id}`, {
        data: { letter: null },
      })
      expect(resetResp.status()).toBe(200)
      const resetData = await resetResp.json()
      expect(resetData.letter).toBeNull()
    } finally {
      if (createdId) {
        await request.delete(`/api/order-types/${createdId}`).catch(() => {})
      }
      await dispose()
    }
  })
})
