import { describe, expect, it } from "vitest"
import { cellToClipboardValue, parseClipboardValue } from "./clipboard"
import type { ShiftTypeMap } from "./types"

const shiftTypeMap: ShiftTypeMap = {
  day: {
    code: "day",
    name: "День (08:00-16:30)",
    start_time: "08:00",
    end_time: "16:30",
    planned_hours: 8,
    is_working: true,
    is_night: false,
    sort_order: 10,
    color: "#10b981",
    letter: null,
  },
  day_long: {
    code: "day_long",
    name: "День 12ч",
    start_time: "08:00",
    end_time: "20:00",
    planned_hours: 12,
    is_working: true,
    is_night: false,
    sort_order: 20,
    color: "#22c55e",
    letter: null,
  },
  night: {
    code: "night",
    name: "Ночь 12ч",
    start_time: "20:00",
    end_time: "08:00",
    planned_hours: 12,
    is_working: true,
    is_night: true,
    sort_order: 30,
    color: "#1e3a8a",
    letter: null,
  },
  evening: {
    code: "evening",
    name: "Вечер",
    start_time: "14:00",
    end_time: "22:00",
    planned_hours: 8,
    is_working: true,
    is_night: false,
    sort_order: 60,
    color: "#f59e0b",
    letter: null,
  },
  vacation: {
    code: "vacation",
    name: "Отпуск",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 110,
    color: "#3b82f6",
    letter: "О",
  },
  sick: {
    code: "sick",
    name: "Больничный",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 120,
    color: "#ef4444",
    letter: "Б",
  },
  A: {
    code: "A",
    name: "За свой счет",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 125,
    color: "#a855f7",
    letter: "А",
  },
  VK: {
    code: "VK",
    name: "Военкомат",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 145,
    color: "#059669",
    letter: "ВК",
  },
}

describe("cellToClipboardValue (видимое значение для буфера)", () => {
  it("рабочая смена копируется кодом, а не часами (однозначный round-trip)", () => {
    expect(
      cellToClipboardValue(
        { auto: null, manual: { shift_type_code: "day", planned_hours_override: null, note: null }, result: "day", conflict: false, order_changed: false },
        shiftTypeMap
      )
    ).toBe("day")
  })

  it("статус копируется видимой буквой (отпуск → О)", () => {
    expect(
      cellToClipboardValue(
        { auto: { shift_type_code: "vacation", source: "vacation", order_id: null }, manual: null, result: "vacation", conflict: false, order_changed: false },
        shiftTypeMap
      )
    ).toBe("О")
  })

  it("ячейка со значением из авто-слоя копируется не пустой", () => {
    expect(
      cellToClipboardValue(
        { auto: { shift_type_code: "sick", source: "sick_leave", order_id: null }, manual: null, result: "sick", conflict: false, order_changed: false },
        shiftTypeMap
      )
    ).toBe("Б")
  })

  it("многобуквенный статус ВК копируется как ВК", () => {
    expect(
      cellToClipboardValue(
        { auto: null, manual: { shift_type_code: "VK", planned_hours_override: null, note: null }, result: "VK", conflict: false, order_changed: false },
        shiftTypeMap
      )
    ).toBe("ВК")
  })

  it("пустая ячейка копируется пустой строкой", () => {
    expect(cellToClipboardValue(undefined, shiftTypeMap)).toBe("")
    expect(
      cellToClipboardValue({ auto: null, manual: null, result: null, conflict: false, order_changed: false }, shiftTypeMap)
    ).toBe("")
  })
})

describe("parseClipboardValue (чтение из буфера)", () => {
  it("читает код смены без учёта регистра", () => {
    expect(parseClipboardValue("Day", shiftTypeMap)).toBe("day")
    expect(parseClipboardValue(" NIGHT ", shiftTypeMap)).toBe("night")
  })

  it("читает букву статуса", () => {
    expect(parseClipboardValue("О", shiftTypeMap)).toBe("vacation")
    expect(parseClipboardValue("б", shiftTypeMap)).toBe("sick")
    expect(parseClipboardValue("ВК", shiftTypeMap)).toBe("VK")
    expect(parseClipboardValue("А", shiftTypeMap)).toBe("A")
  })

  it("читает число часов как рабочую смену (8 → day, не evening)", () => {
    expect(parseClipboardValue("8", shiftTypeMap)).toBe("day")
  })

  it("читает 12 часов как day_long (меньший sort_order, не night)", () => {
    expect(parseClipboardValue("12", shiftTypeMap)).toBe("day_long")
  })

  it("читает код, введённый руками в Excel", () => {
    expect(parseClipboardValue("vacation", shiftTypeMap)).toBe("vacation")
  })

  it("не распознаёт мусор и пустоту", () => {
    expect(parseClipboardValue("qqq", shiftTypeMap)).toBeNull()
    expect(parseClipboardValue("", shiftTypeMap)).toBeNull()
    expect(parseClipboardValue("   ", shiftTypeMap)).toBeNull()
  })
})
