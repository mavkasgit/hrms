import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Structure smoke: create department + position via UI; optional tag.
 * Cleanup via API (names e2e-*), not full DB wipe.
 */
test.describe('Structure @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke structure: create department and position', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const deptName = `e2e-dept-${u}`
    const posName = `e2e-pos-${u}`
    const tagName = `e2e-tag-${u}`

    let deptId: number | undefined
    let posId: number | undefined
    let tagId: number | undefined

    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      await page.goto('/structure')
      await expect(
        page.getByRole('heading', { name: /Структура компании/i, level: 1 })
      ).toBeVisible({ timeout: 15_000 })

      // --- Department ---
      await page.getByRole('button', { name: 'Подразделение' }).first().click()
      const deptDialog = page.getByRole('dialog', {
        name: /добавить подразделение/i,
      })
      await expect(deptDialog).toBeVisible()
      await deptDialog.getByLabel('Название').fill(deptName)
      await deptDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(deptDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(page.locator('main').getByText(deptName, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      })

      // --- Position tab (custom TabsTrigger = plain button, not role=tab) ---
      await page.getByRole('button', { name: 'Должности' }).click()
      await expect(page.getByText(/Должности —/i)).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Должность', exact: true }).first().click()
      const posDialog = page.getByRole('dialog', { name: /добавить должность/i })
      await expect(posDialog).toBeVisible()
      await posDialog.getByLabel('Название').fill(posName)
      await posDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(posDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(page.locator('main').getByText(posName, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      })

      // --- Optional tag (panel «Добавить») ---
      const addTagBtn = page
        .locator('h3')
        .filter({ hasText: 'Теги' })
        .locator('..')
        .getByRole('button', { name: 'Добавить' })
      if (await addTagBtn.isVisible().catch(() => false)) {
        await addTagBtn.click()
        const tagDialog = page.getByRole('dialog')
        await expect(tagDialog).toBeVisible()
        const nameField = tagDialog.getByLabel(/название/i)
        if (await nameField.isVisible().catch(() => false)) {
          await nameField.fill(tagName)
          await tagDialog.getByRole('button', { name: /создать|сохранить/i }).click()
          await expect(tagDialog).not.toBeVisible({ timeout: 10_000 }).catch(() => {})
          await expect(page.getByText(tagName, { exact: true }).first())
            .toBeVisible({ timeout: 8_000 })
            .catch(() => {})
        } else {
          await page.keyboard.press('Escape')
        }
      }

      // Resolve ids for cleanup
      const deptsResp = await request.get('/api/departments')
      expect(deptsResp.ok()).toBeTruthy()
      const depts = await deptsResp.json()
      const deptList = Array.isArray(depts) ? depts : depts.items || depts.nodes || []
      const foundDept = deptList.find((d: { name?: string }) => d.name === deptName)
      if (foundDept?.id) deptId = foundDept.id

      // departments graph endpoint may return nested structure
      if (!deptId) {
        const graphResp = await request.get('/api/departments/graph')
        if (graphResp.ok()) {
          const graph = await graphResp.json()
          const nodes = graph.nodes || []
          const node = nodes.find((n: { name?: string }) => n.name === deptName)
          if (node?.id) deptId = node.id
        }
      }

      const posResp = await request.get('/api/positions')
      if (posResp.ok()) {
        const positions = await posResp.json()
        const posList = Array.isArray(positions) ? positions : positions.items || []
        const foundPos = posList.find((p: { name?: string }) => p.name === posName)
        if (foundPos?.id) posId = foundPos.id
      }

      const tagsResp = await request.get('/api/tags')
      if (tagsResp.ok()) {
        const tags = await tagsResp.json()
        const tagList = Array.isArray(tags) ? tags : tags.items || []
        const foundTag = tagList.find((t: { name?: string }) => t.name === tagName)
        if (foundTag?.id) tagId = foundTag.id
      }
    } finally {
      if (tagId) await request.delete(`/api/tags/${tagId}`).catch(() => {})
      if (posId) await request.delete(`/api/positions/${posId}`).catch(() => {})
      if (deptId) await request.delete(`/api/departments/${deptId}`).catch(() => {})
      await dispose()
    }
  })
})
