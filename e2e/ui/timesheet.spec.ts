import { test, expect } from '../fixtures/index'
import { TimesheetPage } from '../pages/TimesheetPage'

/**
 * Timesheet UI beyond smoke/timesheet-open (page shell):
 * sidebar, mode tabs, import modal, import history, legend, month nav.
 */
test.describe('Timesheet @ui', () => {
  test.setTimeout(45_000)

  test('@ui timesheet: page heading visible', async ({ page }) => {
    const ts = new TimesheetPage(page)
    await ts.goto()
  })

  test('@ui timesheet: sidebar link present', async ({ page }) => {
    const ts = new TimesheetPage(page)
    await ts.expectSidebarLink()
  })

  test('@ui timesheet: switch План / Факт / Совмещённый tabs', async ({ page }) => {
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.switchModeTabs()
  })

  test('@ui timesheet: import button opens turnstile modal', async ({ page }) => {
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.openImportModal()
  })

  test('@ui timesheet: month navigation controls respond', async ({ page }) => {
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.navigateMonth()
  })

  test('@ui timesheet: import history dialog opens', async ({ page }) => {
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.openImportHistory()
  })

  test('@ui timesheet: color legend is present', async ({ page }) => {
    const ts = new TimesheetPage(page)
    await ts.goto()
    await ts.expectLegend()
  })
})
