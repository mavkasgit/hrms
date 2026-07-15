import { test, expect } from '../fixtures/index'
import { StructurePage } from '../pages/StructurePage'

/**
 * Structure smoke: create department + position via UI; optional tag.
 * Cleanup via apiOps (tags/dept/pos), not full DB wipe.
 */
test.describe('Structure @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke structure: create department and position', async ({ page, apiOps }) => {
    const u = apiOps.uid()
    const deptName = `e2e-dept-${u}`
    const posName = `e2e-pos-${u}`
    const tagName = `e2e-tag-${u}`

    const structure = new StructurePage(page)
    await structure.goto()

    await structure.createDepartment(deptName)
    // Track for teardown if we resolve ids; prefer apiOps after create via list
    // Create via UI — cleanup by name via API helpers on apiOps
    const depts = await apiOps.listDepartments()
    const dept = depts.find((d) => d.name === deptName)
    if (dept?.id) await apiOps.trackDepartment(dept.id)

    await structure.openPositionsTab()
    await structure.createPosition(posName)
    const positions = await apiOps.listPositions()
    const pos = positions.find((p) => p.name === posName)
    if (pos?.id) await apiOps.trackPosition(pos.id)

    const createdTag = await structure.tryCreateTag(tagName)
    if (createdTag) {
      const tags = await apiOps.listTags()
      const tag = tags.find((t) => t.name === tagName)
      if (tag?.id) await apiOps.trackTag(tag.id)
    }

    // Positions tab is active — dept list is not shown
    await expect(structure.entityRow(posName)).toBeVisible()
  })
})
