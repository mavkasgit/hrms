import { test, expect, type Page } from '@playwright/test'

test.describe('Архивация сотрудника', () => {
  test.setTimeout(60000)

  test('архивация активного сотрудника', async ({ page }) => {
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')

    // Берём первого активного сотрудника из таблицы
    const firstEmployeeRow = page.locator('tbody tr').first()
    await expect(firstEmployeeRow).toBeVisible({ timeout: 10000 })

    // Запоминаем имя сотрудника (ячейка ФИО - вторая колонка, индекс 1)
    const nameCell = firstEmployeeRow.locator('td').nth(1)
    const empName = await nameCell.innerText()
    console.log(`[TEST] Архивируем сотрудника: "${empName}"`)

    // 1. Открываем сотрудника на редактирование (клик по строке)
    await firstEmployeeRow.click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible({ timeout: 10000 })
    console.log('[TEST] Диалог редактирования открыт')

    // 2. Ищем кнопку "Уволить (в архив)"
    const archiveBtn = editDialog.getByRole('button', { name: /уволить.*архив/i })
    await expect(archiveBtn).toBeVisible({ timeout: 5000 })

    // 3. Нажимаем "Уволить (в архив)"
    await archiveBtn.click()

    // 4. Подтверждаем в AlertDialog
    const archiveDialog = page.getByRole('alertdialog')
    await expect(archiveDialog).toBeVisible()
    await archiveDialog.getByRole('button', { name: /уволить/i }).click()

    // 5. Проверяем что AlertDialog закрылся
    await expect(archiveDialog).not.toBeVisible({ timeout: 5000 })

    // 6. Проверяем что edit dialog закрылся
    await expect(editDialog).not.toBeVisible({ timeout: 5000 })

    // 7. Проверяем что сотрудник исчез из active списка (ищем в таблице)
    const activeTable = page.locator('table tbody')
    await expect(activeTable.getByText(empName)).not.toBeVisible({ timeout: 5000 })

    // 8. Переключаемся на "В архиве"
    await page.getByRole('button', { name: 'Фильтры' }).click()
    await page.getByText('В архиве').click()
    await page.waitForTimeout(500)

    // 9. Проверяем что сотрудник появился в архиве
    const archivedTable = page.locator('table tbody')
    await expect(archivedTable.getByText(empName)).toBeVisible({ timeout: 5000 })

    // 10. Открываем и проверяем бейдж "В архиве"
    await archivedTable.getByText(empName).first().click()
    const archivedDialog = page.getByRole('dialog')
    await expect(archivedDialog).toBeVisible()
    await expect(archivedDialog.getByText(/в архиве/i)).toBeVisible()
    console.log('[TEST] Бейдж "В архиве" подтверждён')

    console.log(`[TEST] ✅ Сотрудник "${empName}" успешно архивирован`)

    await page.keyboard.press('Escape')
  })
})
