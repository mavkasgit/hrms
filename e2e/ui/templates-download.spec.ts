import { test, expect } from '../fixtures/index'

/**
 * Download regression (Ref #44): file downloads must go through the shared
 * axios instance so the Authorization header (Bearer token) is attached.
 * Previously window.open(url) was a plain navigation — no token → 401.
 *
 * The test intercepts the template-download request and asserts the
 * Authorization header is present, then fulfills with a stub docx.
 * Order-types list is stubbed so a download button is rendered without
 * depending on seeded template files.
 */
test.describe('Templates download @ui', () => {
  test.setTimeout(45_000)

  test('@ui templates: скачивание шаблона шлёт Authorization header', async ({
    page,
  }) => {
    const fakeType = {
      id: 424242,
      code: 'e2e_download',
      name: 'E2E Download',
      is_active: true,
      show_in_orders_page: true,
      template_exists: true,
      template_filename: 'e2e_template.docx',
      display_name: 'e2e_template.docx',
      letter: null,
      field_schema: [],
    }

    let downloadHeaders: Record<string, string> | null = null

    // Stub order-types list so a row with a download button renders.
    await page.route('**/api/order-types', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [fakeType] }),
      })
    })

    // Intercept the actual download request and capture its headers.
    await page.route('**/api/order-types/*/template', async (route) => {
      downloadHeaders = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        headers: {
          'Content-Disposition': 'attachment; filename="e2e_template.docx"',
        },
        body: Buffer.from('PK\x03\x04 e2e fake docx'),
      })
    })

    await page.goto('/templates')

    await expect(
      page.getByRole('heading', { name: 'Шаблоны документов', level: 1 })
    ).toBeVisible({ timeout: 15_000 })

    const downloadButton = page.getByRole('button', { name: 'Скачать шаблон' })
    await expect(downloadButton).toBeVisible({ timeout: 10_000 })
    await downloadButton.click()

    await expect
      .poll(() => downloadHeaders, { timeout: 10_000 })
      .not.toBeNull()

    const authorization = (downloadHeaders!['authorization'] ||
      downloadHeaders!['Authorization']) as string | undefined
    expect(authorization, 'download request must carry Bearer token').toBeTruthy()
    expect(authorization!.startsWith('Bearer ')).toBe(true)
  })
})
