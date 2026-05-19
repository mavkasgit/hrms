// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { DocumentPrintPage } from "@/pages/DocumentPrintPage"

describe("DocumentPrintPage", () => {
  it("builds orders print-pdf URL from route id", () => {
    render(
      <MemoryRouter initialEntries={["/orders/15/print"]}>
        <Routes>
          <Route
            path="/orders/:id/print"
            element={(
              <DocumentPrintPage
                routeParam="id"
                endpoint="orders"
                titlePrefix="Приказ"
                invalidIdMessage="bad"
              />
            )}
          />
        </Routes>
      </MemoryRouter>
    )

    const frame = screen.getByTitle("Печать: Приказ 15") as HTMLIFrameElement
    expect(frame.getAttribute("src")).toContain("/orders/15/print-pdf")
  })

  it("builds notifications print-pdf URL from route id", () => {
    render(
      <MemoryRouter initialEntries={["/notifications/21/print"]}>
        <Routes>
          <Route
            path="/notifications/:notificationId/print"
            element={(
              <DocumentPrintPage
                routeParam="notificationId"
                endpoint="notifications"
                titlePrefix="Уведомление"
                invalidIdMessage="bad"
              />
            )}
          />
        </Routes>
      </MemoryRouter>
    )

    const frame = screen.getByTitle("Печать: Уведомление 21") as HTMLIFrameElement
    expect(frame.getAttribute("src")).toContain("/notifications/21/print-pdf")
  })

  it("builds statements print-pdf URL from route id", () => {
    render(
      <MemoryRouter initialEntries={["/statements/34/print"]}>
        <Routes>
          <Route
            path="/statements/:statementId/print"
            element={(
              <DocumentPrintPage
                routeParam="statementId"
                endpoint="statements"
                titlePrefix="Заявление"
                invalidIdMessage="bad"
              />
            )}
          />
        </Routes>
      </MemoryRouter>
    )

    const frame = screen.getByTitle("Печать: Заявление 34") as HTMLIFrameElement
    expect(frame.getAttribute("src")).toContain("/statements/34/print-pdf")
  })
})
