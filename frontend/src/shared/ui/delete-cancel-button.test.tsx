// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { DeleteCancelButton, DELETE_CANCEL_COUNTDOWN_MS } from "./delete-cancel-button"

/** Обёртка, держащая вооружение (как реальный родитель) — для интеграционных сценариев. */
function Harness({
  onDelete,
  idleLabel = "Удалить",
  ...rest
}: {
  onDelete: () => void
  idleLabel?: string
  countdownMs?: number
  isPending?: boolean
}) {
  const [armed, setArmed] = useState(false)
  return (
    <DeleteCancelButton
      armed={armed}
      onArmedChange={setArmed}
      onDelete={onDelete}
      idleLabel={idleLabel}
      {...rest}
    />
  )
}

describe("DeleteCancelButton", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("показывает корзину в спокойном состоянии с label удаления", () => {
    render(<DeleteCancelButton armed={false} onArmedChange={() => {}} onDelete={() => {}} idleLabel="Удалить черновик" />)
    const btn = screen.getByRole("button", { name: "Удалить черновик" })
    expect(btn).toBeInTheDocument()
  })

  it("первый клик вооружает кнопку — label меняется на отмену", () => {
    const onArmedChange = vi.fn()
    render(<DeleteCancelButton armed={false} onArmedChange={onArmedChange} onDelete={() => {}} idleLabel="Удалить" />)
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))
    expect(onArmedChange).toHaveBeenCalledWith(true)
  })

  it("повторный клик в окне отмены разоружает и не удаляет", () => {
    const onArmedChange = vi.fn()
    const onDelete = vi.fn()
    render(<DeleteCancelButton armed={true} onArmedChange={onArmedChange} onDelete={onDelete} idleLabel="Удалить" />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole("button", { name: "Отменить удаление" }))
    expect(onArmedChange).toHaveBeenCalledWith(false)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("по истечении окна отмены разоружается и вызывает onDelete один раз", () => {
    const onArmedChange = vi.fn()
    const onDelete = vi.fn()
    render(<DeleteCancelButton armed={true} onArmedChange={onArmedChange} onDelete={onDelete} idleLabel="Удалить" />)
    act(() => {
      vi.advanceTimersByTime(DELETE_CANCEL_COUNTDOWN_MS + 100)
    })
    expect(onArmedChange).toHaveBeenCalledWith(false)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it("интеграция: клик-арм → клик-отмена не удаляет; повторный арм → истечение удаляет", () => {
    const onDelete = vi.fn()
    render(<Harness onDelete={onDelete} />)

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))
    expect(screen.getByRole("button", { name: "Отменить удаление" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Отменить удаление" }))
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))
    act(() => {
      vi.advanceTimersByTime(DELETE_CANCEL_COUNTDOWN_MS + 100)
    })
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it("показывает спиннер, пока мутация в полёте", () => {
    render(
      <DeleteCancelButton armed={false} onArmedChange={() => {}} onDelete={() => {}} isPending idleLabel="Удалить" />,
    )
    expect(screen.getByRole("button", { name: "Удалить" })).toBeDisabled()
  })
})
