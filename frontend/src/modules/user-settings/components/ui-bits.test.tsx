// @vitest-environment jsdom

import { fireEvent, render, screen, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "../ui"
import { CopyButton } from "./ui-bits"

/**
 * Кнопка копирования — локальная обёртка `useCopyWithReset` над
 * `useCopy` из `@siberiacancode/reactuse` (#415).
 * Тест держит то, что зависит от проекта, а не от обёртки: значение уходит в
 * буфер как есть, а галочка живёт ровно 1600 мс и возвращается к иконке сама.
 *
 * Отдельный кейс — регрессия siberiacancode/reactuse#515: повторный клик
 * раньше срока не должен гасить галочку таймером предыдущего копирования.
 */
describe("CopyButton", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom (в отличие от happy-dom) не реализует Clipboard API — подставляем
    // заглушку, чтобы `vi.spyOn(navigator.clipboard, "writeText")` было на чём.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn() },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, "execCommand")
  })

  const checkIcon = (container: HTMLElement) =>
    container.querySelector(".text-green-500")

  const renderCopyButton = () =>
    render(
      <TooltipProvider>
        <CopyButton value="session-42" label="Копировать" copiedLabel="Скопировано" />
      </TooltipProvider>,
    )

  it("копирует значение и показывает галочку на 1600 мс", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    const { container } = renderCopyButton()
    expect(checkIcon(container)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Копировать" }))
    await act(async () => {})

    expect(writeText).toHaveBeenCalledWith("session-42")
    expect(checkIcon(container)).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1599)
    })
    expect(checkIcon(container)).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(checkIcon(container)).toBeNull()
  })

  it("двойной клик не гасит галочку раньше нового таймера", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    const { container } = renderCopyButton()
    const button = screen.getByRole("button", { name: "Копировать" })

    fireEvent.click(button)
    await act(async () => {})
    expect(checkIcon(container)).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(700)
    })

    fireEvent.click(button)
    await act(async () => {})
    expect(checkIcon(container)).not.toBeNull()

    // 1400 мс от первого клика: таймер предыдущего копирования обязан быть снят.
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(checkIcon(container)).not.toBeNull()

    // 1599 мс от второго клика — галочка ещё на месте.
    act(() => {
      vi.advanceTimersByTime(899)
    })
    expect(checkIcon(container)).not.toBeNull()

    // 1600 мс от второго клика — сброс ровно здесь.
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(checkIcon(container)).toBeNull()
  })

  it("не рисует галочку, если копирование не удалось", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    )
    // На HTTP по LAN-IP Clipboard API недоступен, и обёртка уходит в
    // `execCommand`. Отказ обоих путей — единственный способ провалить копию.
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })
    const { container } = renderCopyButton()

    fireEvent.click(screen.getByRole("button", { name: "Копировать" }))
    await act(async () => {})

    expect(checkIcon(container)).toBeNull()
  })
})
