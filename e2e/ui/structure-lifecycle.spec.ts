import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'
import { StructurePage } from '../pages/StructurePage'

/**
 * Full structure lifecycle (dept / position / tag): create → edit all fields → delete.
 * Deeper than smoke/structure (create-only).
 */

test.describe('Structure full lifecycle @ui', () => {
  test.setTimeout(60_000)

  test('@ui structure: department create → edit all fields → delete', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const departmentName = `e2e-dept-${u}`
    const editedDepartmentName = `${departmentName}-edit`
    const shortName = 'e2e'
    const editedShortName = 'e2e-e'
    const createPriority = '1'
    const editedPriority = '7'
    const createIcon = 'School'
    const editedIcon = 'Factory'
    const createColor = '#EC4899'
    const editedColor = '#06B6D4'

    let leftoverId: number | undefined
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const structure = new StructurePage(page)
      await structure.goto()

      const createDialog = await structure.openCreateDepartment()
      await createDialog.getByLabel('Название').fill(departmentName)
      await createDialog.getByLabel('Краткое').fill(shortName)
      await createDialog.getByRole('spinbutton').fill(createPriority)
      await createDialog.getByRole('button', { name: createIcon }).click()
      await createDialog.getByRole('button', { name: createColor }).click()
      await createDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(createDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(structure.entityRow(departmentName)).toBeVisible({ timeout: 10_000 })

      await structure.entityRow(departmentName).click()
      const editDialog = page.getByRole('dialog', {
        name: /редактировать подразделение/i,
      })
      await expect(editDialog).toBeVisible()
      await editDialog.getByLabel('Название').fill(editedDepartmentName)
      await editDialog.getByLabel('Краткое').fill(editedShortName)
      await editDialog.getByRole('spinbutton').fill(editedPriority)
      await editDialog.getByRole('button', { name: editedIcon }).click()
      await editDialog.getByRole('button', { name: editedColor }).click()
      await editDialog.getByRole('button', { name: /сохранить/i }).click()
      await expect(editDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(structure.entityRow(editedDepartmentName)).toBeVisible()
      await expect(structure.entityRow(departmentName)).not.toBeVisible()

      await structure.entityRow(editedDepartmentName).click()
      await expect(editDialog).toBeVisible()
      await expect(editDialog.getByLabel('Название')).toHaveValue(editedDepartmentName)
      await expect(editDialog.getByLabel('Краткое')).toHaveValue(editedShortName)
      await expect(editDialog.getByRole('spinbutton')).toHaveValue(editedPriority)
      await expect(editDialog.getByText(editedIcon, { exact: true })).toBeVisible()
      await expect(editDialog.getByText(editedColor, { exact: true })).toBeVisible()

      await editDialog.getByRole('button', { name: /удалить/i }).click()
      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: /удалить/i }).click()
      await expect(confirmDialog).not.toBeVisible()
      await expect(editDialog).not.toBeVisible()
      await expect(structure.entityRow(editedDepartmentName)).not.toBeVisible()
    } finally {
      // Residual cleanup if UI delete failed mid-test
      const deptsResp = await request.get('/api/departments')
      if (deptsResp.ok()) {
        const depts = await deptsResp.json()
        const list = Array.isArray(depts) ? depts : depts.items || []
        for (const name of [editedDepartmentName, departmentName]) {
          const found = list.find((d: { name?: string; id?: number }) => d.name === name)
          if (found?.id) leftoverId = found.id
          if (found?.id) await request.delete(`/api/departments/${found.id}`).catch(() => {})
        }
      }
      void leftoverId
      await dispose()
    }
  })

  test('@ui structure: position create → edit all fields → delete', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const positionName = `e2e-pos-${u}`
    const editedPositionName = `${positionName}-edit`
    const createIcon = 'School'
    const editedIcon = 'Factory'
    const createColor = '#EC4899'
    const editedColor = '#06B6D4'

    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const structure = new StructurePage(page)
      await structure.goto()
      await structure.openPositionsTab()

      const createDialog = await structure.openCreatePosition()
      await createDialog.getByLabel('Название').fill(positionName)
      await createDialog.getByRole('button', { name: createIcon }).click()
      await createDialog.getByRole('button', { name: createColor }).click()
      await createDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(createDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(structure.entityRow(positionName)).toBeVisible({ timeout: 10_000 })

      await structure.entityRow(positionName).click()
      const editDialog = page.getByRole('dialog', {
        name: /редактировать должность/i,
      })
      await expect(editDialog).toBeVisible()
      await editDialog.getByLabel('Название').fill(editedPositionName)
      await editDialog.getByRole('button', { name: editedIcon }).click()
      await editDialog.getByRole('button', { name: editedColor }).click()
      await editDialog.getByRole('button', { name: /сохранить/i }).click()
      await expect(editDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(structure.entityRow(editedPositionName)).toBeVisible()
      await expect(structure.entityRow(positionName)).not.toBeVisible()

      await structure.entityRow(editedPositionName).click()
      await expect(editDialog).toBeVisible()
      await expect(editDialog.getByLabel('Название')).toHaveValue(editedPositionName)
      await expect(editDialog.getByText(editedIcon, { exact: true })).toBeVisible()
      await expect(editDialog.getByText(editedColor, { exact: true })).toBeVisible()

      await editDialog.getByRole('button', { name: /удалить/i }).click()
      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: /удалить/i }).click()
      await expect(confirmDialog).not.toBeVisible()
      await expect(editDialog).not.toBeVisible()
      await expect(structure.entityRow(editedPositionName)).not.toBeVisible()
    } finally {
      const posResp = await request.get('/api/positions')
      if (posResp.ok()) {
        const positions = await posResp.json()
        const list = Array.isArray(positions) ? positions : positions.items || []
        for (const name of [editedPositionName, positionName]) {
          const found = list.find((p: { name?: string; id?: number }) => p.name === name)
          if (found?.id) await request.delete(`/api/positions/${found.id}`).catch(() => {})
        }
      }
      await dispose()
    }
  })

  test('@ui structure: tag create → edit all fields → delete', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const tagName = `e2e-tag-${u}`
    const editedTagName = `${tagName}-edit`
    const category = 'Навык'
    const editedCategory = 'Роль'
    const createColor = '#84CC16'
    const editedColor = '#F97316'

    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      const structure = new StructurePage(page)
      await structure.goto()
      await expect(
        page.locator('main').getByRole('button', { name: 'Добавить', exact: true }).first()
      ).toBeVisible()

      await page
        .locator('main')
        .getByRole('button', { name: 'Добавить', exact: true })
        .first()
        .click()
      const createDialog = page.getByRole('dialog', { name: /новый тег/i })
      await expect(createDialog).toBeVisible()
      await createDialog.getByLabel('Название').fill(tagName)
      await createDialog.getByLabel('Категория').fill(category)
      await structure.setOwnColor(createDialog, createColor)
      await createDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(createDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(structure.entityRow(tagName)).toBeVisible({ timeout: 10_000 })

      await structure.entityRow(tagName).click()
      const editDialog = page.getByRole('dialog', { name: /редактировать тег/i })
      await expect(editDialog).toBeVisible()
      await editDialog.getByLabel('Название').fill(editedTagName)
      await editDialog.getByLabel('Категория').fill(editedCategory)
      await structure.setOwnColor(editDialog, editedColor)
      await expect(editDialog.locator('input[type="color"]').first()).toHaveValue(
        editedColor.toLowerCase()
      )
      await editDialog.getByRole('button', { name: /сохранить/i }).click()
      await expect(editDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(structure.entityRow(editedTagName)).toBeVisible()
      await expect(structure.entityRow(tagName)).not.toBeVisible()

      await structure.entityRow(editedTagName).click()
      await expect(editDialog).toBeVisible()
      await expect(editDialog.getByLabel('Название')).toHaveValue(editedTagName)
      await expect(editDialog.getByLabel('Категория')).toHaveValue(editedCategory)
      await expect(editDialog.locator('input[type="color"]').first()).toHaveValue(
        editedColor.toLowerCase()
      )

      await editDialog.getByRole('button', { name: /удалить/i }).click()
      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: /удалить/i }).click()
      await expect(confirmDialog).not.toBeVisible()
      await expect(editDialog).not.toBeVisible()
      await expect(structure.entityRow(editedTagName)).not.toBeVisible()
    } finally {
      const tagsResp = await request.get('/api/tags')
      if (tagsResp.ok()) {
        const tags = await tagsResp.json()
        const list = Array.isArray(tags) ? tags : tags.items || []
        for (const name of [editedTagName, tagName]) {
          const found = list.find((t: { name?: string; id?: number }) => t.name === name)
          if (found?.id) await request.delete(`/api/tags/${found.id}`).catch(() => {})
        }
      }
      await dispose()
    }
  })
})
