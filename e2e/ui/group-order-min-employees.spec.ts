import { type Page } from '@playwright/test'
import { test, expect, API_BASE } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

/** ISO date → DD.MM.YYYY for DatePicker display assert. */
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

/** Посчитать POST-запросы создания группового черновика (без commit). */
function countGroupDraftPosts(page: Page): () => number {
  let posts = 0
  page.on('request', (req) => {
    if (
      req.method() === 'POST' &&
      req.url().includes('/api/orders/group-drafts') &&
      !req.url().includes('/commit')
    ) {
      posts++
    }
  })
  return () => posts
}

/**
 * #88: групповой приказ требует минимум двух сотрудников.
 *
 * На странице «Отпуск за свой счет» и «Вызовы в выходные дни»:
 * - с одним сотрудником «Создать» блокируется инлайн-ошибкой с подсказкой
 *   про одиночную форму, запрос создания черновика не уходит;
 * - после добавления второго сотрудника создание проходит.
 */
test.describe('Group order minimum two employees @ui', () => {
  test.setTimeout(120_000)

  test('@ui unpaid: 1 employee blocked inline, 2 employees create draft', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const nameA = `e2e-grp-min-${u}-a`
    const nameB = `e2e-grp-min-${u}-b`
    const orderNumber = `E2EM${Date.now().toString().slice(-6)}`
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

    await fillOrderNumber(page, orderNumber)
    await page.getByLabel(/дата начала отпуска/i).fill(toDisplay(vacationStart))
    await page.getByLabel(/дата начала отпуска/i).blur()

    const groupDraftPosts = countGroupDraftPosts(page)

    // Один сотрудник → блокирующая ошибка, без запроса создания черновика.
    await addGroupEmployee(page, nameA)
    await page.getByRole('button', { name: 'Создать приказ' }).click()
    await expect(
      page.getByText('Для приказа на одного сотрудника используйте одиночную форму')
    ).toBeVisible({ timeout: 10_000 })
    expect(groupDraftPosts(), 'no draft POST with a single employee').toBe(0)

    // Второй сотрудник → создание проходит (POST /api/orders/group-drafts).
    await addGroupEmployee(page, nameB)

    const draftRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/orders/group-drafts') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/commit') &&
        r.status() < 400,
      { timeout: 60_000 }
    )
    page.on('popup', (popup) => popup.close().catch(() => {}))
    await page.getByRole('button', { name: 'Создать приказ' }).click()

    const draftResp = await draftRespPromise
    const draftBody = (await draftResp.json().catch(() => ({}))) as { draft_id?: string }
    expect(draftBody.draft_id, 'group draft created with two employees').toBeTruthy()

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    await request
      .delete(`${API_BASE}/api/orders/drafts/${draftBody.draft_id}`)
      .catch(() => {})
    await dispose()
  })

  test('@ui weekend: 1 employee blocked inline, 2 employees create draft', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const nameA = `e2e-grp-min-wk-${u}-a`
    const nameB = `e2e-grp-min-wk-${u}-b`
    const orderNumber = `E2EM${Date.now().toString().slice(-6)}`
    const callDate = tomorrowIso()

    const empA = await apiOps.createEmployee({ name: nameA })
    const empB = await apiOps.createEmployee({ name: nameB })
    expect(empA.id).toBeGreaterThan(0)
    expect(empB.id).toBeGreaterThan(0)

    await page.goto('/weekend-calls')
    await expect(
      page.getByRole('heading', { name: 'Вызовы в выходные дни' })
    ).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Групповой приказ' }).click()
    await expect(page.getByPlaceholder('Добавить сотрудника...')).toBeVisible({
      timeout: 10_000,
    })

    await fillOrderNumber(page, orderNumber)
    await page.getByLabel(/дата вызова/i).fill(toDisplay(callDate))
    await page.getByLabel(/дата вызова/i).blur()

    const groupDraftPosts = countGroupDraftPosts(page)

    await addGroupEmployee(page, nameA)
    await page.getByRole('button', { name: 'Создать групповой приказ' }).click()
    await expect(
      page.getByText('Для приказа на одного сотрудника используйте одиночную форму')
    ).toBeVisible({ timeout: 10_000 })
    expect(groupDraftPosts(), 'no draft POST with a single employee').toBe(0)

    await addGroupEmployee(page, nameB)

    const draftRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/orders/group-drafts') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/commit') &&
        r.status() < 400,
      { timeout: 60_000 }
    )
    page.on('popup', (popup) => popup.close().catch(() => {}))
    await page.getByRole('button', { name: 'Создать групповой приказ' }).click()

    const draftResp = await draftRespPromise
    const draftBody = (await draftResp.json().catch(() => ({}))) as { draft_id?: string }
    expect(draftBody.draft_id, 'group draft created with two employees').toBeTruthy()

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    await request
      .delete(`${API_BASE}/api/orders/drafts/${draftBody.draft_id}`)
      .catch(() => {})
    await dispose()
  })
})
