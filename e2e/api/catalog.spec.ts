import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Catalog API @api', () => {
  test.setTimeout(20_000)

  test('@api departments: create → update → delete', async ({
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const created = await apiOps.createDepartment(`e2e-dept-${u}`, {
      short_name: `e2e-s-${u}`.slice(0, 20),
    })
    expect(created.id).toBeGreaterThan(0)
    expect(created.name).toContain('e2e-dept-')

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const editedName = `e2e-dept-${u}-edited`
      const updateResp = await request.patch(`/api/departments/${created.id}`, {
        data: { name: editedName },
      })
      expect(updateResp.status()).toBe(200)
      const updated = await updateResp.json()
      expect(updated.name).toBe(editedName)
    } finally {
      await dispose()
    }

    await apiOps.deleteDepartment(created.id)
  })

  test('@api positions: create → update → delete', async ({
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const created = await apiOps.createPosition(`e2e-pos-${u}`)
    expect(created.id).toBeGreaterThan(0)

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const editedName = `e2e-pos-${u}-edited`
      const updateResp = await request.patch(`/api/positions/${created.id}`, {
        data: { name: editedName },
      })
      expect(updateResp.status()).toBe(200)
      const updated = await updateResp.json()
      expect(updated.name).toBe(editedName)
    } finally {
      await dispose()
    }

    await apiOps.deletePosition(created.id)
  })
})
