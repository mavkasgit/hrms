import { test, expect, request as pwRequest } from "../fixtures"
import path from "path"
import fs from "fs"

const SAMPLE_XLSX = path.resolve(__dirname, "../fixtures/timesheet-sample.xlsx")

test.describe("Timesheet API", () => {
  test.setTimeout(30_000)

  test("GET /api/shift-types возвращает справочник с дефолтными типами", async ({ request }) => {
    const resp = await request.get("/api/shift-types")
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data.items)).toBe(true)
    const codes = new Set(data.items.map((x: any) => x.code))
    expect(codes.has("day")).toBe(true)
    expect(codes.has("off")).toBe(true)
    expect(codes.has("vacation")).toBe(true)
    expect(codes.has("sick")).toBe(true)
  })

  test("GET /api/timesheet возвращает структуру табеля", async ({ request }) => {
    const resp = await request.get("/api/timesheet", {
      params: { period_start: "2099-01-01", period_end: "2099-01-31" },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.period_start).toBe("2099-01-01")
    expect(data.period_end).toBe("2099-01-31")
    expect(Array.isArray(data.employees)).toBe(true)
  })

  test("GET /api/work-schedules принимает year/month", async ({ request }) => {
    const resp = await request.get("/api/work-schedules", { params: { year: 2099, month: 1 } })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data.items)).toBe(true)
  })

  test("GET /api/timesheet/imports возвращает список", async ({ request }) => {
    const resp = await request.get("/api/timesheet/imports")
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data.items)).toBe(true)
  })

  test("POST /api/timesheet/imports/preview отклоняет неправильный формат", async ({ request }) => {
    const resp = await request.post("/api/timesheet/imports/preview", {
      multipart: {
        file: {
          name: "test.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("plain text"),
        },
      },
    })
    expect(resp.status()).toBe(400)
  })
})
