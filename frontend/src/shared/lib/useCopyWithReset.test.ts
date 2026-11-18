// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCopyWithReset } from "./useCopyWithReset";

/**
 * Локальная обёртка над `useCopy` (siberiacancode/reactuse#515): один таймер
 * на хук. Тест держит именно то, чем обёртка отличается от пакета, — повторный
 * клик не должен гасить галочку по таймеру предыдущего.
 */
describe("useCopyWithReset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom (в отличие от happy-dom) не реализует Clipboard API — подставляем
    // заглушку, чтобы `vi.spyOn(navigator.clipboard, "writeText")` было на чём.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn() },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("двойной клик не сбрасывает галочку раньше нового таймера", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyWithReset(1000));

    await act(async () => {
      await result.current.copy("session-42");
    });
    expect(result.current.copied).toBe(true);
    expect(result.current.value).toBe("session-42");

    act(() => void vi.advanceTimersByTime(700));

    await act(async () => {
      await result.current.copy("session-43");
    });
    expect(result.current.copied).toBe(true);
    expect(result.current.value).toBe("session-43");

    // 1400 мс от первого клика — старый таймер обязан быть снят.
    act(() => void vi.advanceTimersByTime(700));
    expect(result.current.copied).toBe(true);

    // 1000 мс от второго клика — сброс наступает ровно здесь.
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current.copied).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.copied).toBe(false);
  });

  it("при отказе Clipboard API копирует через execCommand и ставит галочку", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("not allowed"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    const { result } = renderHook(() => useCopyWithReset(1000));

    await act(async () => {
      await result.current.copy("session-42");
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(result.current.copied).toBe(true);
  });

  it("не оставляет таймер после размонтирования", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useCopyWithReset(1000));

    await act(async () => {
      await result.current.copy("session-42");
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
