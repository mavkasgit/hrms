import { type Page, expect } from '@playwright/test'

/**
 * Dismiss OnlyOffice onboarding / co-edit name dialogs inside iframe(s).
 * Shared by order create/edit OO e2e flows.
 */
export async function dismissOnlyOfficeDialogs(editor: Page): Promise<void> {
  for (const frame of editor.frames()) {
    const ok = frame.getByRole('button', { name: /^OK$/i })
    if (await ok.isVisible().catch(() => false)) {
      await ok.click().catch(() => {})
    }
    // prefer OK on name prompt
    const nameOk = frame.locator('button').filter({ hasText: /^OK$/i }).first()
    if (await nameOk.isVisible().catch(() => false)) {
      await nameOk.click().catch(() => {})
    }
  }
  // Top-level OK if any
  const topOk = editor.getByRole('button', { name: /^OK$/i })
  if (await topOk.first().isVisible().catch(() => false)) {
    await topOk.first().click().catch(() => {})
  }
}

/**
 * Click «Сохранить приказ» in draft editor: forcesave (with retry) → parent commit.
 * @param editor Draft OO popup page
 * @param parentPage Opener page that performs POST .../commit
 * @param options.commitPathIncludes URL substring for commit wait
 *   (default single draft `/api/orders/drafts/`; group: `/api/orders/group-drafts/`)
 * @returns committed order id
 */
export async function saveDraftOrderFromEditor(
  editor: Page,
  parentPage: Page,
  options?: { commitPathIncludes?: string }
): Promise<{ orderId: number }> {
  const commitPathIncludes = options?.commitPathIncludes ?? '/api/orders/drafts/'
  const saveBtn = editor.getByRole('button', { name: 'Сохранить приказ' })
  await expect(saveBtn).toBeVisible({ timeout: 90_000 })

  await dismissOnlyOfficeDialogs(editor)
  // OO dialogs may appear shortly after config load
  await editor.waitForTimeout(1500)
  await dismissOnlyOfficeDialogs(editor)

  // Commit on opener after successful forceSave + postMessage
  const commitPromise = parentPage.waitForResponse(
    (r) =>
      r.url().includes(commitPathIncludes) &&
      r.url().includes('/commit') &&
      r.request().method() === 'POST',
    { timeout: 120_000 }
  )

  // Retry save: forcesave may 502 while Document Server warms up
  let forceSaveOk = false
  for (let attempt = 1; attempt <= 4; attempt++) {
    await dismissOnlyOfficeDialogs(editor)
    const forcePromise = editor.waitForResponse(
      (r) =>
        r.url().includes('/onlyoffice/forcesave') && r.request().method() === 'POST',
      { timeout: 45_000 }
    )
    await saveBtn.click()
    const forceResp = await forcePromise.catch(() => null)
    if (forceResp && forceResp.ok()) {
      forceSaveOk = true
      break
    }
    // Wait DS / retry
    await editor.waitForTimeout(2000 * attempt)
  }
  expect(forceSaveOk, 'OnlyOffice forcesave should succeed (is DS on :8085?)').toBeTruthy()

  const commitResp = await commitPromise
  expect(commitResp.ok(), `commit status ${commitResp.status()}`).toBeTruthy()
  const committed = await commitResp.json()
  const orderId = committed?.id as number | undefined
  expect(orderId, 'committed order id').toBeTruthy()

  await editor.waitForEvent('close', { timeout: 30_000 }).catch(() => {
    /* may already be closed */
  })

  return { orderId: orderId as number }
}

/**
 * Click «Сохранить приказ» on **existing** order editor (`/orders/:id/edit-docx`).
 * Forcesave only — **no** draft commit (order already persisted).
 * Accepts forcesave HTTP ok; optional save-status success|no_changes is handled by the page.
 */
export async function saveExistingOrderFromEditor(editor: Page): Promise<void> {
  const saveBtn = editor.getByRole('button', { name: 'Сохранить приказ' })
  await expect(saveBtn).toBeVisible({ timeout: 90_000 })

  await dismissOnlyOfficeDialogs(editor)
  // OO dialogs may appear shortly after config load
  await editor.waitForTimeout(1500)
  await dismissOnlyOfficeDialogs(editor)

  // Editor enables save only after DocsAPI ready
  await expect(saveBtn).toBeEnabled({ timeout: 90_000 })

  // Existing order forcesave: /api/orders/{id}/onlyoffice/forcesave (not /drafts/)
  let forceSaveOk = false
  for (let attempt = 1; attempt <= 4; attempt++) {
    await dismissOnlyOfficeDialogs(editor)
    const forcePromise = editor.waitForResponse(
      (r) =>
        r.url().includes('/onlyoffice/forcesave') &&
        r.url().includes('/orders/') &&
        !r.url().includes('/drafts/') &&
        r.request().method() === 'POST',
      { timeout: 45_000 }
    )
    await saveBtn.click()
    const forceResp = await forcePromise.catch(() => null)
    if (forceResp && forceResp.ok()) {
      // message: save_requested | no_changes — both are success for existing order
      forceSaveOk = true
      break
    }
    await editor.waitForTimeout(2000 * attempt)
  }
  expect(
    forceSaveOk,
    'OnlyOffice forcesave for existing order should succeed (is DS on :8085?)'
  ).toBeTruthy()

  // OrderEditorPage closes after successful save (incl. no_changes)
  await editor.waitForEvent('close', { timeout: 30_000 }).catch(() => {
    /* may already be closed or stay open if soft error */
  })
}
