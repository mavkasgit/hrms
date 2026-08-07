import { type Page } from '@playwright/test'
import { test, expect } from '../fixtures/index'
import {
  dismissOnlyOfficeDialogs,
  saveDraftOrderFromEditor,
} from '../helpers/onlyoffice-editor'

/** ISO date → DD.MM.YYYY for DatePicker */
function toDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function addGroupEmployee(page: Page, name: string) {
  const search = page.getByPlaceholder('Добавить сотрудника...')
  await expect(search).toBeVisible({ timeout: 10_000 })
  await search.click()
  await search.fill(name)
  const option = page.locator('button').filter({ hasText: name }).first()
  await expect(option).toBeVisible({ timeout: 10_000 })
  await option.click()
  await expect(page.getByRole('cell', { name, exact: true }).first()).toBeVisible({
    timeout: 5_000,
  })
}

async function fillOrderNumber(page: Page, orderNumber: string) {
  const input = page.getByLabel(/номер приказа/i)
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.click()
  await input.fill(orderNumber)
  await input.blur()
}

/**
 * Group draft create: wait POST /api/orders/group-drafts + OnlyOffice popup.
 * Does NOT use legacy POST /orders/vacation-unpaid/group or weekend-call/group.
 */
async function createGroupDraftOpenEditor(
  page: Page,
  createButtonName: string | RegExp
): Promise<{ editor: Page; draftId: string | undefined }> {
  const draftRespPromise = page.waitForResponse(
    (r) =>
      r.url().includes('/api/orders/group-drafts') &&
      r.request().method() === 'POST' &&
      !r.url().includes('/commit') &&
      r.status() < 400,
    { timeout: 60_000 }
  )

  const popupPromise = page.waitForEvent('popup', { timeout: 60_000 })
  await page.getByRole('button', { name: createButtonName }).click()
  const editor = await popupPromise
  editor.on('dialog', (d) => d.accept().catch(() => {}))

  // Arm config wait before navigation settles (avoids missing early response)
  const configPromise = editor.waitForResponse(
    (r) =>
      r.url().includes('/onlyoffice/config') &&
      r.url().includes('/drafts/') &&
      r.ok(),
    { timeout: 60_000 }
  )

  await editor.waitForLoadState('domcontentloaded')
  await editor.waitForURL(/\/drafts\/[^/]+\/edit-docx/, { timeout: 60_000 })

  const draftResp = await draftRespPromise
  const draftBody = await draftResp.json().catch(() => ({} as { draft_id?: string }))
  const draftId = draftBody.draft_id as string | undefined
  await configPromise

  return { editor, draftId }
}

/**
 * UI P0: group unpaid / weekend via tab «Групповой приказ»
 * → POST /api/orders/group-drafts → OO draft save → POST .../group-drafts/{id}/commit.
 * Requires: FE, BE, OnlyOffice DS (ONLYOFFICE_PUBLIC_URL, e.g. :8085).
 */
test.describe('Group drafts OnlyOffice @ui', () => {
  test.setTimeout(180_000)

  test('@ui group unpaid: 2 employees → group-drafts → OO save → commit → orders', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const nameA = `e2e-grp-unpaid-${u}-a`
    const nameB = `e2e-grp-unpaid-${u}-b`
    const orderNumber = `E2EG${Date.now().toString().slice(-6)}`
    const vacationStart = tomorrowIso()

    const empA = await apiOps.createEmployee({ name: nameA })
    const empB = await apiOps.createEmployee({ name: nameB })
    expect(empA.id).toBeGreaterThan(0)
    expect(empB.id).toBeGreaterThan(0)

    await page.goto('/unpaid-leaves')
    await expect(
      page.getByRole('heading', { name: 'Отпуск за свой счет', exact: true })
    ).toBeVisible({ timeout: 15_000 })

    // Custom TabsTrigger is a plain button (no role=tab)
    await page.getByRole('button', { name: 'Групповой приказ' }).click()
    await expect(page.getByPlaceholder('Добавить сотрудника...')).toBeVisible({
      timeout: 10_000,
    })

    // order_date is prefilled today; set number + vacation_start
    await fillOrderNumber(page, orderNumber)
    await page.getByLabel(/дата начала отпуска/i).fill(toDisplay(vacationStart))
    await page.getByLabel(/дата начала отпуска/i).blur()

    await addGroupEmployee(page, nameA)
    await addGroupEmployee(page, nameB)

    // Default days = 1 when single-form days empty; leave as-is (schema min 1)
    page.on('dialog', (d) => d.accept().catch(() => {}))

    const { editor, draftId } = await createGroupDraftOpenEditor(page, 'Создать приказ')
    expect(draftId || editor.url()).toBeTruthy()

    await dismissOnlyOfficeDialogs(editor)
    const { orderId } = await saveDraftOrderFromEditor(editor, page, {
      commitPathIncludes: '/api/orders/group-drafts/',
    })
    expect(orderId).toBeTruthy()

    // Group commit creates one is_group order with OrderEmployee rows for both
    const forA = await apiOps.getOrders({ employee_id: empA.id })
    const forB = await apiOps.getOrders({ employee_id: empB.id })
    const foundA = forA.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber)
    )
    const foundB = forB.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber)
    )
    expect(foundA, 'group unpaid order linked to employee A').toBeTruthy()
    expect(foundB, 'group unpaid order linked to employee B').toBeTruthy()
    expect(foundA!.id).toBe(foundB!.id)

    await apiOps.deleteOrder(foundA!.id).catch(() => {})
  })

  test('@ui group weekend: 2 employees → group-drafts → OO save → commit → orders', async ({
    page,
    apiOps,
  }) => {
    const u = apiOps.uid()
    const nameA = `e2e-grp-wknd-${u}-a`
    const nameB = `e2e-grp-wknd-${u}-b`
    const orderNumber = `E2EG${Date.now().toString().slice(-6)}`
    const callDate = tomorrowIso()

    const empA = await apiOps.createEmployee({ name: nameA })
    const empB = await apiOps.createEmployee({ name: nameB })
    expect(empA.id).toBeGreaterThan(0)
    expect(empB.id).toBeGreaterThan(0)

    await page.goto('/weekend-calls')
    await expect(
      page.getByRole('heading', { name: 'Вызовы в выходные дни' })
    ).toBeVisible({ timeout: 15_000 })

    // Custom TabsTrigger is a plain button (no role=tab)
    await page.getByRole('button', { name: 'Групповой приказ' }).click()
    await expect(page.getByPlaceholder('Добавить сотрудника...')).toBeVisible({
      timeout: 10_000,
    })

    // mode defaults to single («Один день»)
    await fillOrderNumber(page, orderNumber)
    await page.getByLabel(/дата вызова/i).fill(toDisplay(callDate))
    await page.getByLabel(/дата вызова/i).blur()

    await addGroupEmployee(page, nameA)
    await addGroupEmployee(page, nameB)

    page.on('dialog', (d) => d.accept().catch(() => {}))

    const { editor, draftId } = await createGroupDraftOpenEditor(
      page,
      'Создать групповой приказ'
    )
    expect(draftId || editor.url()).toBeTruthy()

    await dismissOnlyOfficeDialogs(editor)
    const { orderId } = await saveDraftOrderFromEditor(editor, page, {
      commitPathIncludes: '/api/orders/group-drafts/',
    })
    expect(orderId).toBeTruthy()

    const forA = await apiOps.getOrders({ employee_id: empA.id })
    const forB = await apiOps.getOrders({ employee_id: empB.id })
    const foundA = forA.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber)
    )
    const foundB = forB.find(
      (o) =>
        o.id === orderId ||
        String(o.order_number).includes(orderNumber)
    )
    expect(foundA, 'group weekend order linked to employee A').toBeTruthy()
    expect(foundB, 'group weekend order linked to employee B').toBeTruthy()
    expect(foundA!.id).toBe(foundB!.id)

    await apiOps.deleteOrder(foundA!.id).catch(() => {})
  })
})
