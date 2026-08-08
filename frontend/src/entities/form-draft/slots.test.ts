// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { FORM_DRAFT_SLOTS, formDraftRecoverUrl, formDraftSlotForRoute, getFormDraftSlot, readAllFormDrafts } from "./slots"

const SLOT_COUNT = 12

describe("getFormDraftSlot", () => {
  it("возвращает слот по таргету", () => {
    const slot = getFormDraftSlot("vacations:recall")
    expect(slot.storageKey).toBe("hrms_vacation_recall_form_draft")
    expect(slot.label).toBe("формы отзыва из отпуска")
  })

  it("бросает ошибку для неизвестного таргета", () => {
    expect(() => getFormDraftSlot("nope")).toThrow()
  })
})

describe("FORM_DRAFT_SLOTS", () => {
  it("перечисляет все 12 слотов таблицы", () => {
    expect(FORM_DRAFT_SLOTS).toHaveLength(SLOT_COUNT)
  })

  it("уникальные таргеты и ключи storageKey", () => {
    const targets = FORM_DRAFT_SLOTS.map((s) => s.target)
    const keys = FORM_DRAFT_SLOTS.map((s) => s.storageKey)
    expect(new Set(targets).size).toBe(targets.length)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("у каждого слота есть маршрут восстановления со своим query-параметром", () => {
    for (const slot of FORM_DRAFT_SLOTS) {
      const url = formDraftRecoverUrl(slot)
      expect(url).toContain(slot.route)
      const param = slot.recoverParam ?? "recover"
      expect(url).toMatch(new RegExp(`(\\?|&)${param}=1$`))
    }
  })
})

describe("readAllFormDrafts", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("собирает только слоты с сохранённым черновиком", () => {
    localStorage.setItem("hrms_order_form_draft", JSON.stringify({ saved_at: "2026-01-10T00:00:00.000Z" }))
    localStorage.setItem("hrms_vacation_form_draft", JSON.stringify({ saved_at: "2026-02-10T00:00:00.000Z" }))

    const entries = readAllFormDrafts()
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.slot.target)).toEqual(["orders", "vacations"])
  })

  it("игнорирует слоты с пустым/битым JSON", () => {
    localStorage.setItem("hrms_order_form_draft", "not json")
    expect(readAllFormDrafts()).toHaveLength(0)
  })
})

describe("formDraftSlotForRoute (#87)", () => {
  it("базовые маршруты однозначно определяют слот", () => {
    expect(formDraftSlotForRoute("/vacations", "")?.target).toBe("vacations")
    expect(formDraftSlotForRoute("/vacations/recall", "")?.target).toBe("vacations:recall")
    expect(formDraftSlotForRoute("/orders/notifications", "")?.target).toBe("notifications")
    expect(formDraftSlotForRoute("/orders/statements", "")?.target).toBe("statements")
    expect(formDraftSlotForRoute("/weekend-calls", "")?.target).toBe("weekend-calls")
  })

  it("неизвестный маршрут возвращает null", () => {
    expect(formDraftSlotForRoute("/employees", "")).toBeNull()
    expect(formDraftSlotForRoute("/drafts", "")).toBeNull()
  })

  it("orders:general определяется по ?tab=general", () => {
    expect(formDraftSlotForRoute("/orders", "?tab=general")?.target).toBe("orders:general")
    expect(formDraftSlotForRoute("/orders", "")?.target).toBe("orders")
    expect(formDraftSlotForRoute("/orders", "?tab=all")?.target).toBe("orders")
  })

  it("orders с ?recover=1 остаётся слотом orders (не general)", () => {
    expect(formDraftSlotForRoute("/orders", "?recover=1")?.target).toBe("orders")
  })

  it("групповой слот отсутствий определяется только по ?recoverGroup=1", () => {
    expect(formDraftSlotForRoute("/unpaid-leaves", "?recoverGroup=1")?.target).toBe("unpaid-leaves:group")
    expect(formDraftSlotForRoute("/unpaid-leaves", "")?.target).toBe("unpaid-leaves")
    expect(formDraftSlotForRoute("/unpaid-leaves", "?recover=1")?.target).toBe("unpaid-leaves")
    expect(formDraftSlotForRoute("/weekend-calls", "?recoverGroup=1")?.target).toBe("weekend-calls:group")
  })

  it("совпадение по подстроке пути не засчитывается (/vacations vs /vacations/recall)", () => {
    expect(formDraftSlotForRoute("/vacations/extension", "")?.target).toBe("vacations:extension")
    expect(formDraftSlotForRoute("/vacations/postpone", "")?.target).toBe("vacations:postpone")
  })
})
