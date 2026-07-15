import { test, expect } from '../fixtures/index'
import type { Locator, Page } from '@playwright/test'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Full structure lifecycle (dept / position / tag): create → edit all fields → delete.
 * Deeper than smoke/structure (create-only).
 */
const entityRow = (page: Page, name: string): Locator =>
  page.locator('main').getByText(name, { exact: true }).first()

const setOwnColor = async (dialog: Locator, color: string) => {
  const colorInput = dialog.locator('input[type="color"]').first()
  const normalized = color.toLowerCase()
  await expect(colorInput).toBeVisible()
  await colorInput.fill(normalized)
  await expect(colorInput).toHaveValue(normalized)
}

async function openStructure(page: Page) {
  await page.goto('/structure')
  await expect(
    page.getByRole('heading', { name: /структура/i, level: 1 })
  ).toBeVisible({ timeout: 15_000 })
}

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
      await openStructure(page)

      await page.getByRole('button', { name: 'Подразделение' }).first().click()
      const createDialog = page.getByRole('dialog', {
        name: /добавить подразделение/i,
      })
      await expect(createDialog).toBeVisible()
      await createDialog.getByLabel('Название').fill(departmentName)
      await createDialog.getByLabel('Краткое').fill(shortName)
      await createDialog.getByRole('spinbutton').fill(createPriority)
      await createDialog.getByRole('button', { name: createIcon }).click()
      await createDialog.getByRole('button', { name: createColor }).click()
      await createDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(createDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(entityRow(page, departmentName)).toBeVisible({ timeout: 10_000 })

      await entityRow(page, departmentName).click()
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
      await expect(entityRow(page, editedDepartmentName)).toBeVisible()
      await expect(entityRow(page, departmentName)).not.toBeVisible()

      await entityRow(page, editedDepartmentName).click()
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
      await expect(entityRow(page, editedDepartmentName)).not.toBeVisible()
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
      await openStructure(page)
      await page
        .locator('main')
        .getByRole('button', { name: 'Должности', exact: true })
        .first()
        .click()

      await page.getByRole('button', { name: 'Должность' }).first().click()
      const createDialog = page.getByRole('dialog', { name: /добавить должность/i })
      await expect(createDialog).toBeVisible()
      await createDialog.getByLabel('Название').fill(positionName)
      await createDialog.getByRole('button', { name: createIcon }).click()
      await createDialog.getByRole('button', { name: createColor }).click()
      await createDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(createDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(entityRow(page, positionName)).toBeVisible({ timeout: 10_000 })

      await entityRow(page, positionName).click()
      const editDialog = page.getByRole('dialog', {
        name: /редактировать должность/i,
      })
      await expect(editDialog).toBeVisible()
      await editDialog.getByLabel('Название').fill(editedPositionName)
      await editDialog.getByRole('button', { name: editedIcon }).click()
      await editDialog.getByRole('button', { name: editedColor }).click()
      await editDialog.getByRole('button', { name: /сохранить/i }).click()
      await expect(editDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(entityRow(page, editedPositionName)).toBeVisible()
      await expect(entityRow(page, positionName)).not.toBeVisible()

      await entityRow(page, editedPositionName).click()
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
      await expect(entityRow(page, editedPositionName)).not.toBeVisible()
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
      await openStructure(page)
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
      await setOwnColor(createDialog, createColor)
      await createDialog.getByRole('button', { name: 'Создать' }).click()
      await expect(createDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(entityRow(page, tagName)).toBeVisible({ timeout: 10_000 })

      await entityRow(page, tagName).click()
      const editDialog = page.getByRole('dialog', { name: /редактировать тег/i })
      await expect(editDialog).toBeVisible()
      await editDialog.getByLabel('Название').fill(editedTagName)
      await editDialog.getByLabel('Категория').fill(editedCategory)
      await setOwnColor(editDialog, editedColor)
      await expect(editDialog.locator('input[type="color"]').first()).toHaveValue(
        editedColor.toLowerCase()
      )
      await editDialog.getByRole('button', { name: /сохранить/i }).click()
      await expect(editDialog).not.toBeVisible({ timeout: 10_000 })
      await expect(entityRow(page, editedTagName)).toBeVisible()
      await expect(entityRow(page, tagName)).not.toBeVisible()

      await entityRow(page, editedTagName).click()
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
      await expect(entityRow(page, editedTagName)).not.toBeVisible()
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
