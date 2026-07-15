import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

/**
 * Settings holidays UI happy-path:
 * /settings/holidays → add → visible in table → delete (cleanup).
 *
 * Does NOT seed standard holidays or «Очистить все».
 */
test.describe('Settings holidays @ui', () => {
  test.setTimeout(60_000)

  test('@ui settings holidays: add → visible → delete', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const holidayName = `e2e-holiday-${u}`
    // Far from typical state seeds; year must match year Select (default 2026 → pick 2027)
    const year = 2027
    const isoDate = `${year}-12-28`
    const displayDate = `28.12.${year}`

    let holidayId: number | undefined
    const { request, dispose } = await createAuthenticatedRequest(playwright)

    try {
      await page.goto('/settings/holidays')
      await expect(
        page.getByRole('heading', { name: /праздники/i, level: 1 })
      ).toBeVisible({ timeout: 15_000 })

      // Year select must match the date year (Radix Select)
      const yearTrigger = page.getByRole('combobox').first()
      await expect(yearTrigger).toBeVisible()
      await yearTrigger.click()
      await page.getByRole('option', { name: String(year), exact: true }).click()
      await expect(yearTrigger).toHaveText(String(year))

      await page.getByRole('button', { name: 'Добавить', exact: true }).click()

      const nameInput = page.getByPlaceholder('Название')
      await expect(nameInput).toBeVisible()
      await nameInput.fill(holidayName)

      const dateInput = page.getByLabel('ДД.ММ.ГГГГ')
      await expect(dateInput).toBeVisible()
      await dateInput.click()
      await dateInput.fill(displayDate)
      await dateInput.blur()

      const postPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/references/holidays') &&
          resp.request().method() === 'POST' &&
          [200, 201].includes(resp.status())
      )

      await page.getByRole('button', { name: 'Создать', exact: true }).click()

      const postResp = await postPromise
      const body = (await postResp.json()) as { id?: number }
      if (typeof body.id === 'number') holidayId = body.id

      await expect(page.getByText('✓ Праздник добавлен')).toBeVisible({
        timeout: 10_000,
      })

      const row = page.locator('table tbody tr').filter({ hasText: holidayName })
      await expect(row).toBeVisible({ timeout: 10_000 })
      await expect(row).toContainText(displayDate)

      // Cleanup via row trash (AlertDialog)
      await row.getByRole('button').click()
      const confirm = page.getByRole('alertdialog')
      await expect(confirm).toBeVisible()
      await expect(confirm.getByText(/удалить праздник/i)).toBeVisible()

      const deletePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/references/holidays/') &&
          resp.request().method() === 'DELETE' &&
          [200, 204].includes(resp.status())
      )
      await confirm.getByRole('button', { name: 'Удалить', exact: true }).click()
      await deletePromise

      await expect(confirm).not.toBeVisible()
      await expect(
        page.locator('table tbody tr').filter({ hasText: holidayName })
      ).not.toBeVisible({ timeout: 10_000 })
      holidayId = undefined
    } finally {
      // Residual cleanup if UI delete failed mid-test
      if (holidayId != null) {
        await request
          .delete(`/api/references/holidays/${holidayId}`)
          .catch(() => {})
      } else {
        const listResp = await request.get('/api/references/holidays', {
          params: { year: String(year) },
        })
        if (listResp.ok()) {
          const list = (await listResp.json()) as Array<{
            id?: number
            name?: string | null
          }>
          const found = list.find((h) => h.name === holidayName)
          if (found?.id) {
            await request
              .delete(`/api/references/holidays/${found.id}`)
              .catch(() => {})
          }
        }
      }
      await dispose()
    }
  })
})
