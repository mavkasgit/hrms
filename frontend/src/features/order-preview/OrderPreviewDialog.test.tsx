// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom"
import { OrderPreviewDialog } from "./OrderPreviewDialog"

describe("OrderPreviewDialog", () => {
  it("preserves data-placeholder-key attributes on mark elements", async () => {
    const html = `<p>Сотрудник: <mark data-placeholder-key="full_name">Иванов Иван</mark></p>`

    render(
      <OrderPreviewDialog
        open={true}
        html={html}
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    await waitFor(() => {
      const mark = document.querySelector('.ProseMirror mark[data-placeholder-key="full_name"]')
      expect(mark).toBeInTheDocument()
      expect(mark).toHaveTextContent("Иванов Иван")
    })
  })

  it("preserves multiple placeholder keys", async () => {
    const html = `
      <p>Сотрудник: <mark data-placeholder-key="full_name">Иванов Иван</mark>,
      Должность: <mark data-placeholder-key="position">Разработчик</mark></p>
    `

    render(
      <OrderPreviewDialog
        open={true}
        html={html}
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    await waitFor(() => {
      const nameMark = document.querySelector('.ProseMirror mark[data-placeholder-key="full_name"]')
      const positionMark = document.querySelector('.ProseMirror mark[data-placeholder-key="position"]')
      expect(nameMark).toBeInTheDocument()
      expect(nameMark).toHaveTextContent("Иванов Иван")
      expect(positionMark).toBeInTheDocument()
      expect(positionMark).toHaveTextContent("Разработчик")
    })
  })

  it("calls onConfirm with HTML containing data-placeholder-key", async () => {
    const html = `<p><mark data-placeholder-key="key">value</mark></p>`
    const onConfirm = vi.fn()

    render(
      <OrderPreviewDialog
        open={true}
        html={html}
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror mark[data-placeholder-key="key"]')).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole("button", { name: /Создать приказ/i })
    confirmButton.click()

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    const calledWith = onConfirm.mock.calls[0][0] as string
    expect(calledWith).toContain('data-placeholder-key="key"')
    expect(calledWith).toContain(">value</mark>")
  })
})
