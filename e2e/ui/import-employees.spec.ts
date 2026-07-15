import { deflateRawSync } from 'node:zlib'
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'
import { EmployeesPage } from '../pages/EmployeesPage'

/**
 * Employees import UI happy-path:
 * open modal → upload xlsx → mapping → confirm → employee in list.
 *
 * Cleanup: search by name → hard delete employee + best-effort dept/pos.
 * Product import creates dept/pos by name (not tracked by apiOps.create*).
 */

// ---------------------------------------------------------------------------
// Minimal XLSX builder (no exceljs dep — OOXML zip via store/deflate)
// Column layout matches FE autoMapColumns indices (template-like).
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function zipFiles(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const compressed = deflateRawSync(file.data)
    const useDeflate = compressed.length < file.data.length
    const payload = useDeflate ? compressed : file.data
    const method = useDeflate ? 8 : 0
    const crc = crc32(file.data)

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0, 12) // date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra
    nameBuf.copy(local, 30)

    const localFull = Buffer.concat([local, payload])
    locals.push(localFull)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)
    centrals.push(central)

    offset += localFull.length
  }

  const centralDir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralDir, end])
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build minimal xlsx with headers at template column indices:
 * 0 empty, 1 tab_number, 2 name, 3 department, 4 position
 */
function buildImportXlsx(params: {
  name: string
  department: string
  position: string
}): Buffer {
  const headers = ['', 'Таб. №', 'ФИО', 'Подразделение', 'Должность']
  const row = ['', '', params.name, params.department, params.position]
  const shared = [...headers, ...row]
  const sharedXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">`,
    ...shared.map((s) => `<si><t>${xmlEscape(s)}</t></si>`),
    '</sst>',
  ].join('')

  const cellRef = (col: number, rowNum: number) =>
    `${String.fromCharCode(65 + col)}${rowNum}`

  const sheetRows = [headers, row]
    .map((cells, rIdx) => {
      const rowNum = rIdx + 1
      const cXml = cells
        .map((_, cIdx) => {
          const sstIdx = rIdx * headers.length + cIdx
          return `<c r="${cellRef(cIdx, rowNum)}" t="s"><v>${sstIdx}</v></c>`
        })
        .join('')
      return `<row r="${rowNum}">${cXml}</row>`
    })
    .join('')

  const sheetXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetData>${sheetRows}</sheetData>`,
    '</worksheet>',
  ].join('')

  const workbookXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets><sheet name="Сотрудники" sheetId="1" r:id="rId1"/></sheets>',
    '</workbook>',
  ].join('')

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    '</Types>',
  ].join('')

  const rootRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join('')

  const wbRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
    '</Relationships>',
  ].join('')

  return zipFiles([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(wbRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sharedXml, 'utf8') },
  ])
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe('Employees import @ui', () => {
  test.setTimeout(90_000)

  test('@ui employees: import xlsx happy-path creates employee', async ({
    page,
    apiOps,
    playwright,
  }) => {
    const u = apiOps.uid()
    const empName = `e2e-imp-emp-${u}`
    const deptName = `e2e-imp-dept-${u}`
    const posName = `e2e-imp-pos-${u}`

    const xlsx = buildImportXlsx({
      name: empName,
      department: deptName,
      position: posName,
    })

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    let employeeId: number | undefined
    let positionId: number | undefined
    let departmentId: number | undefined

    try {
      const empPage = new EmployeesPage(page)
      await empPage.goto()
      await empPage.openImportModal()

      const dialog = page.getByRole('dialog')
      await expect(
        dialog.getByRole('heading', { name: /импорт сотрудников из excel/i })
      ).toBeVisible()

      const fileInput = dialog.locator('input[type="file"]')

      const parseWait = page.waitForResponse(
        (resp) => {
          const url = resp.url()
          return (
            resp.request().method() === 'POST' &&
            url.includes('/api/import/excel') &&
            !url.includes('/confirm') &&
            !url.includes('/preview')
          )
        },
        { timeout: 30_000 }
      )

      await fileInput.setInputFiles({
        name: `e2e-import-${u}.xlsx`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: xlsx,
      })

      const parseResp = await parseWait
      expect(parseResp.ok()).toBeTruthy()

      // mapping step: auto-map by template column indices
      await expect(dialog.getByText(/найдено\s+\d+\s+строк/i)).toBeVisible({
        timeout: 10_000,
      })
      // mapping ready: required fields auto-mapped → import enabled
      const importBtn = dialog.getByRole('button', { name: /^импортировать$/i })
      await expect(importBtn).toBeEnabled()

      // FE onImportComplete → window.location.reload(); CDP drops response body after nav
      const confirmWait = page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          resp.url().includes('/api/import/excel/confirm'),
        { timeout: 30_000 }
      )

      await importBtn.click()
      const confirmResp = await confirmWait
      expect(confirmResp.ok()).toBeTruthy()
      // body via resp.json() is unreliable after reload — assert create via UI/API below

      await page.waitForLoadState('domcontentloaded')
      await expect(
        page.getByRole('heading', { name: /сотрудники/i, level: 1 })
      ).toBeVisible({ timeout: 15_000 })

      await empPage.searchEmployee(empName)
      await empPage.expectEmployeeInTable(empName)

      const found = await apiOps.searchEmployees(empName)
      employeeId = found[0]?.id
      expect(employeeId).toBeTruthy()
      if (employeeId) {
        const full = await apiOps.getEmployee(employeeId)
        departmentId = full.department_id
        positionId = full.position_id
      }
    } finally {
      if (employeeId) {
        await request
          .delete(`/api/employees/${employeeId}?hard=true&confirm=true`)
          .catch(() => {})
      }
      if (positionId) {
        await request.delete(`/api/positions/${positionId}`).catch(() => {})
      }
      if (departmentId) {
        await request.delete(`/api/departments/${departmentId}`).catch(() => {})
      }
      await dispose()
    }
  })
})
