// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DESKTOP_MEDIA_QUERY } from "@/shared/lib/mobileLayout"
import { Sidebar } from "./sidebar"

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}))

vi.mock("@/features/notifications", () => ({
  HrmsNotificationBell: () => null,
}))

vi.mock("@/features/user-settings/HrmsUserSettingsDialog", () => ({
  HrmsUserSettingsDialog: () => null,
}))

type ChangeListener = (event: MediaQueryListEvent) => void

/** Подменяет window.matchMedia управляемым MediaQueryList — jsdom его не реализует. */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>()
  const mediaQueryList = {
    matches: initialMatches,
    media: DESKTOP_MEDIA_QUERY,
    onchange: null,
    addEventListener: vi.fn((type: string, listener: ChangeListener) => {
      if (type === "change") listeners.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: ChangeListener) => {
      if (type === "change") listeners.delete(listener)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }

  const matchMedia = vi.fn(() => mediaQueryList as unknown as MediaQueryList)
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia

  return {
    matchMedia,
    listenerCount: () => listeners.size,
    setMatches(next: boolean) {
      mediaQueryList.matches = next
      act(() => {
        listeners.forEach((listener) =>
          listener({ matches: next, media: DESKTOP_MEDIA_QUERY } as MediaQueryListEvent)
        )
      })
    },
  }
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  )
}

describe("Sidebar — адаптивная раскладка по медиазапросу", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", undefined)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("начальное значение берётся из matchMedia: desktop", () => {
    const media = installMatchMedia(true)
    renderSidebar()

    expect(media.matchMedia).toHaveBeenCalledWith(DESKTOP_MEDIA_QUERY)
    expect(screen.getByRole("complementary")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Открыть меню" })).not.toBeInTheDocument()
  })

  it("начальное значение берётся из matchMedia: mobile", () => {
    installMatchMedia(false)
    renderSidebar()

    expect(screen.getByRole("button", { name: "Открыть меню" })).toBeInTheDocument()
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
  })

  it("подписывается на change и перестраивает разметку при смене медиазапроса", () => {
    const media = installMatchMedia(false)
    renderSidebar()
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument()

    media.setMatches(true)
    expect(screen.getByRole("complementary")).toBeInTheDocument()

    media.setMatches(false)
    expect(screen.getByRole("button", { name: "Открыть меню" })).toBeInTheDocument()
  })

  it("отписывается от change при размонтировании", () => {
    const media = installMatchMedia(false)
    const { unmount } = renderSidebar()
    expect(media.listenerCount()).toBe(1)

    unmount()
    expect(media.listenerCount()).toBe(0)
  })
})
