// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DRAFT_ORDER_SAVE_CHANNEL,
  DRAFT_ORDER_SAVE_TYPE,
  publishDraftOrderSave,
  subscribeAllDraftOrderSaves,
  subscribeDraftOrderSave,
} from "./draftOrderSaveChannel"

function makeMessage(draftId: string) {
  return { type: DRAFT_ORDER_SAVE_TYPE, draftId }
}

/**
 * jsdom не заполняет `event.origin` в window.postMessage (в браузере он ставится
 * корректно), поэтому диспатчим MessageEvent с явным origin — тот же путь,
 * что и реальный браузерный обработчик `message`.
 */
function dispatchWindowMessage(message: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", { data: message, origin: window.location.origin })
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("subscribeDraftOrderSave", () => {
  it("возвращает noop при null/undefined — контракт страниц (#102)", () => {
    const unsubNull = subscribeDraftOrderSave(null, () => {})
    const unsubUndef = subscribeDraftOrderSave(undefined, () => {})
    expect(() => unsubNull()).not.toThrow()
    expect(() => unsubUndef()).not.toThrow()
  })

  it("слушает только конкретный draftId", async () => {
    const handler = vi.fn()
    const unsub = subscribeDraftOrderSave("draft-1", handler)

    dispatchWindowMessage(makeMessage("draft-1"))
    dispatchWindowMessage(makeMessage("draft-2"))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].draftId).toBe("draft-1")
    unsub()
  })

  it("дедуплицирует повторную доставку того же draftId (#102)", async () => {
    const handler = vi.fn()
    const unsub = subscribeDraftOrderSave("dup-1", handler)

    dispatchWindowMessage(makeMessage("dup-1"))
    dispatchWindowMessage(makeMessage("dup-1"))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })

  it("перестаёт получать сообщения после unsubscribe", async () => {
    const handler = vi.fn()
    const unsub = subscribeDraftOrderSave("draft-1", handler)
    unsub()

    dispatchWindowMessage(makeMessage("draft-1"))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handler).not.toHaveBeenCalled()
  })
})

describe("subscribeAllDraftOrderSaves", () => {
  it("получает сохранения любого черновика (#102)", async () => {
    const handler = vi.fn()
    const unsub = subscribeAllDraftOrderSaves(handler)

    dispatchWindowMessage(makeMessage("any-1"))
    dispatchWindowMessage(makeMessage("any-2"))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handler).toHaveBeenCalledTimes(2)
    unsub()
  })

  it("доставляет publishDraftOrderSave через BroadcastChannel (без opener)", async () => {
    const handler = vi.fn()
    const unsub = subscribeAllDraftOrderSaves(handler)

    publishDraftOrderSave({ draftId: "publish-1" })

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    expect(handler.mock.calls[0][0].draftId).toBe("publish-1")
    unsub()
  })

  it("дедуплицирует postMessage + BroadcastChannel для одного draftId (#102)", async () => {
    const handler = vi.fn()
    const unsub = subscribeAllDraftOrderSaves(handler)
    const bc = new BroadcastChannel(DRAFT_ORDER_SAVE_CHANNEL)

    dispatchWindowMessage(makeMessage("both-1"))
    bc.postMessage(makeMessage("both-1"))
    bc.close()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })
})


