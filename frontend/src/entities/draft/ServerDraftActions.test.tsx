// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ServerDraftActions } from "./ServerDraftActions"

interface HostProps {
  onFill: () => void
  onOpenView: () => void
  onOpenEdit: () => void
  onDelete: () => void
  filling?: boolean
  fillDisabled?: boolean
}

function Host({ onFill, onOpenView, onOpenEdit, onDelete, filling = false, fillDisabled }: HostProps) {
  const [armed, setArmed] = useState(false)
  return (
    <ServerDraftActions
      filling={filling}
      fillDisabled={fillDisabled}
      armed={armed}
      onArmedChange={setArmed}
      onFill={onFill}
      onOpenView={onOpenView}
      onOpenEdit={onOpenEdit}
      onDelete={onDelete}
      deletePending={false}
    />
  )
}

describe("ServerDraftActions", () => {
  it("вызывает onFill по кнопке «Заполнить»", async () => {
    const onFill = vi.fn()
    render(
      <Host onFill={onFill} onOpenView={vi.fn()} onOpenEdit={vi.fn()} onDelete={vi.fn()} />
    )
    await userEvent.click(screen.getByRole("button", { name: "Заполнить" }))
    expect(onFill).toHaveBeenCalledTimes(1)
  })

  it("вызывает onOpenView по кнопке «Открыть»", async () => {
    const onOpenView = vi.fn()
    render(<Host onFill={vi.fn()} onOpenView={onOpenView} onOpenEdit={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: "Открыть" }))
    expect(onOpenView).toHaveBeenCalledTimes(1)
  })

  it("вызывает onOpenEdit по кнопке «Восстановить»", async () => {
    const onOpenEdit = vi.fn()
    render(<Host onFill={vi.fn()} onOpenView={vi.fn()} onOpenEdit={onOpenEdit} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: "Восстановить" }))
    expect(onOpenEdit).toHaveBeenCalledTimes(1)
  })

  it("вооружает и разоружает кнопку удаления", async () => {
    const onDelete = vi.fn()
    render(<Host onFill={vi.fn()} onOpenView={vi.fn()} onOpenEdit={vi.fn()} onDelete={onDelete} />)

    await userEvent.click(screen.getByRole("button", { name: "Удалить черновик" }))
    expect(screen.getByRole("button", { name: "Отменить удаление" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Отменить удаление" }))
    expect(screen.queryByRole("button", { name: "Отменить удаление" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Удалить черновик" })).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("снимает вооружение удаления при «Заполнить»", async () => {
    const onFill = vi.fn()
    render(<Host onFill={onFill} onOpenView={vi.fn()} onOpenEdit={vi.fn()} onDelete={vi.fn()} />)

    await userEvent.click(screen.getByRole("button", { name: "Удалить черновик" }))
    expect(screen.getByRole("button", { name: "Отменить удаление" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Заполнить" }))
    expect(screen.queryByRole("button", { name: "Отменить удаление" })).not.toBeInTheDocument()
    expect(onFill).toHaveBeenCalledTimes(1)
  })

  it("блокирует «Заполнить» и показывает спиннер при filling", () => {
    render(
      <Host
        onFill={vi.fn()}
        onOpenView={vi.fn()}
        onOpenEdit={vi.fn()}
        onDelete={vi.fn()}
        filling
      />
    )
    expect(screen.getByRole("button", { name: "Заполнить" })).toBeDisabled()
  })

  it("блокирует «Заполнить» при fillDisabled без спиннера", () => {
    render(
      <Host
        onFill={vi.fn()}
        onOpenView={vi.fn()}
        onOpenEdit={vi.fn()}
        onDelete={vi.fn()}
        fillDisabled
      />
    )
    expect(screen.getByRole("button", { name: "Заполнить" })).toBeDisabled()
  })
})
