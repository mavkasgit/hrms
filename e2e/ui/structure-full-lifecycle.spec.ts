import { test, expect, type Locator, type Page } from '@playwright/test'

const uniqueSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const entityRow = (page: Page, name: string): Locator => {
  return page.locator('main').getByText(name, { exact: true }).first()
}

const openStructure = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Структура' }).click()
  await expect(page.getByRole('heading', { name: /структура/i, level: 1 })).toBeVisible()
}

const setOwnColor = async (dialog: Locator, color: string) => {
  const colorInput = dialog.locator('input[type="color"]').first()
  const normalized = color.toLowerCase()
  await expect(colorInput).toBeVisible()
  await colorInput.fill(normalized)
  await expect(colorInput).toHaveValue(normalized)
}

test.describe('Структура: полный цикл подразделений, должностей и тегов', () => {
  test.setTimeout(45000)

  test('подразделение: создание → редактирование всех полей → удаление', async ({ page }) => {
    const u = uniqueSuffix()
    const departmentName = `Тест-Отдел-${u}`
    const editedDepartmentName = `${departmentName}-изменено`
    const shortName = 'Отд'
    const editedShortName = 'Отд-изм'
    const createPriority = '1'
    const editedPriority = '7'
    const createIcon = 'School'
    const editedIcon = 'Factory'
    const createColor = '#EC4899'
    const editedColor = '#06B6D4'

    await test.step('1. Переход в раздел структуры', async () => {
      await openStructure(page)
    })

    await test.step('2. Создание подразделения', async () => {
      await page.getByRole('button', { name: 'Подразделение' }).click()

      const createDialog = page.getByRole('dialog', { name: /добавить подразделение/i })
      await expect(createDialog).toBeVisible()

      await createDialog.getByLabel('Название').fill(departmentName)
      await createDialog.getByLabel('Краткое').fill(shortName)
      await createDialog.getByRole('spinbutton').fill(createPriority)
      await createDialog.getByRole('button', { name: createIcon }).click()
      await createDialog.getByRole('button', { name: createColor }).click()
      await createDialog.getByRole('button', { name: 'Создать' }).click()

      await expect(createDialog).not.toBeVisible()
      await expect(entityRow(page, departmentName)).toBeVisible({ timeout: 10000 })
    })

    await test.step('3. Редактирование всех полей подразделения', async () => {
      await entityRow(page, departmentName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать подразделение/i })
      await expect(editDialog).toBeVisible()

      await editDialog.getByLabel('Название').fill(editedDepartmentName)
      await editDialog.getByLabel('Краткое').fill(editedShortName)
      await editDialog.getByRole('spinbutton').fill(editedPriority)
      await editDialog.getByRole('button', { name: editedIcon }).click()
      await editDialog.getByRole('button', { name: editedColor }).click()
      await editDialog.getByRole('button', { name: /сохранить/i }).click()

      await expect(editDialog).not.toBeVisible()
      await expect(entityRow(page, editedDepartmentName)).toBeVisible()
      await expect(entityRow(page, departmentName)).not.toBeVisible()
    })

    await test.step('4. Проверка сохраненных изменений подразделения', async () => {
      await entityRow(page, editedDepartmentName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать подразделение/i })
      await expect(editDialog).toBeVisible()

      await expect(editDialog.getByLabel('Название')).toHaveValue(editedDepartmentName)
      await expect(editDialog.getByLabel('Краткое')).toHaveValue(editedShortName)
      await expect(editDialog.getByRole('spinbutton')).toHaveValue(editedPriority)
      await expect(editDialog.getByText(editedIcon, { exact: true })).toBeVisible()
      await expect(editDialog.getByText(editedColor, { exact: true })).toBeVisible()

      await editDialog.getByRole('button', { name: /отмена/i }).click()
      await expect(editDialog).not.toBeVisible()
    })

    await test.step('5. Удаление подразделения', async () => {
      await entityRow(page, editedDepartmentName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать подразделение/i })
      await expect(editDialog).toBeVisible()
      await editDialog.getByRole('button', { name: /удалить/i }).click()

      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: /удалить/i }).click()

      await expect(confirmDialog).not.toBeVisible()
      await expect(editDialog).not.toBeVisible()
      await expect(entityRow(page, editedDepartmentName)).not.toBeVisible()
    })
  })

  test('должность: создание → редактирование всех полей → удаление', async ({ page }) => {
    const u = uniqueSuffix()
    const positionName = `Тест-Должность-${u}`
    const editedPositionName = `${positionName}-изменено`
    const createIcon = 'School'
    const editedIcon = 'Factory'
    const createColor = '#EC4899'
    const editedColor = '#06B6D4'

    await test.step('1. Переход в раздел структуры и вкладку Должности', async () => {
      await openStructure(page)
      await page.locator('main').getByRole('button', { name: 'Должности', exact: true }).first().click()
    })

    await test.step('2. Создание должности', async () => {
      await page.getByRole('button', { name: 'Должность' }).click()

      const createDialog = page.getByRole('dialog', { name: /добавить должность/i })
      await expect(createDialog).toBeVisible()

      await createDialog.getByLabel('Название').fill(positionName)
      await createDialog.getByRole('button', { name: createIcon }).click()
      await createDialog.getByRole('button', { name: createColor }).click()
      await createDialog.getByRole('button', { name: 'Создать' }).click()

      await expect(createDialog).not.toBeVisible()
      await expect(entityRow(page, positionName)).toBeVisible({ timeout: 10000 })
    })

    await test.step('3. Редактирование всех полей должности', async () => {
      await entityRow(page, positionName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать должность/i })
      await expect(editDialog).toBeVisible()

      await editDialog.getByLabel('Название').fill(editedPositionName)
      await editDialog.getByRole('button', { name: editedIcon }).click()
      await editDialog.getByRole('button', { name: editedColor }).click()
      await editDialog.getByRole('button', { name: /сохранить/i }).click()

      await expect(editDialog).not.toBeVisible()
      await expect(entityRow(page, editedPositionName)).toBeVisible()
      await expect(entityRow(page, positionName)).not.toBeVisible()
    })

    await test.step('4. Проверка сохраненных изменений должности', async () => {
      await entityRow(page, editedPositionName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать должность/i })
      await expect(editDialog).toBeVisible()

      await expect(editDialog.getByLabel('Название')).toHaveValue(editedPositionName)
      await expect(editDialog.getByText(editedIcon, { exact: true })).toBeVisible()
      await expect(editDialog.getByText(editedColor, { exact: true })).toBeVisible()

      await editDialog.getByRole('button', { name: /отмена/i }).click()
      await expect(editDialog).not.toBeVisible()
    })

    await test.step('5. Удаление должности', async () => {
      await entityRow(page, editedPositionName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать должность/i })
      await expect(editDialog).toBeVisible()
      await editDialog.getByRole('button', { name: /удалить/i }).click()

      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: /удалить/i }).click()

      await expect(confirmDialog).not.toBeVisible()
      await expect(editDialog).not.toBeVisible()
      await expect(entityRow(page, editedPositionName)).not.toBeVisible()
    })
  })

  test('тег: создание → редактирование всех полей → удаление', async ({ page }) => {
    const u = uniqueSuffix()
    const tagName = `Тест-Тег-${u}`
    const editedTagName = `${tagName}-изменено`
    const category = 'Навык'
    const editedCategory = 'Роль'
    const createColor = '#84CC16'
    const editedColor = '#F97316'

    await test.step('1. Переход в раздел структуры', async () => {
      await openStructure(page)
      await expect(page.locator('main').getByRole('button', { name: 'Добавить', exact: true }).first()).toBeVisible()
    })

    await test.step('2. Создание тега', async () => {
      await page.locator('main').getByRole('button', { name: 'Добавить', exact: true }).first().click()

      const createDialog = page.getByRole('dialog', { name: /новый тег/i })
      await expect(createDialog).toBeVisible()

      await createDialog.getByLabel('Название').fill(tagName)
      await createDialog.getByLabel('Категория').fill(category)
      await setOwnColor(createDialog, createColor)
      await createDialog.getByRole('button', { name: 'Создать' }).click()

      await expect(createDialog).not.toBeVisible()
      await expect(entityRow(page, tagName)).toBeVisible({ timeout: 10000 })
    })

    await test.step('3. Редактирование всех полей тега', async () => {
      await entityRow(page, tagName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать тег/i })
      await expect(editDialog).toBeVisible()

      await editDialog.getByLabel('Название').fill(editedTagName)
      await editDialog.getByLabel('Категория').fill(editedCategory)
      await setOwnColor(editDialog, editedColor)
      await expect(editDialog.locator('input[type="color"]').first()).toHaveValue(editedColor.toLowerCase())
      await editDialog.getByRole('button', { name: /сохранить/i }).click()

      await expect(editDialog).not.toBeVisible()
      await expect(entityRow(page, editedTagName)).toBeVisible()
      await expect(entityRow(page, tagName)).not.toBeVisible()
    })

    await test.step('4. Проверка сохраненных изменений тега', async () => {
      await entityRow(page, editedTagName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать тег/i })
      await expect(editDialog).toBeVisible()

      await expect(editDialog.getByLabel('Название')).toHaveValue(editedTagName)
      await expect(editDialog.getByLabel('Категория')).toHaveValue(editedCategory)
      await expect(editDialog.locator('input[type="color"]').first()).toHaveValue(editedColor.toLowerCase())

      await editDialog.getByRole('button', { name: /отмена/i }).click()
      await expect(editDialog).not.toBeVisible()
    })

    await test.step('5. Удаление тега', async () => {
      await entityRow(page, editedTagName).click()

      const editDialog = page.getByRole('dialog', { name: /редактировать тег/i })
      await expect(editDialog).toBeVisible()
      await editDialog.getByRole('button', { name: /удалить/i }).click()

      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: /удалить/i }).click()

      await expect(confirmDialog).not.toBeVisible()
      await expect(editDialog).not.toBeVisible()
      await expect(entityRow(page, editedTagName)).not.toBeVisible()
    })
  })
})
