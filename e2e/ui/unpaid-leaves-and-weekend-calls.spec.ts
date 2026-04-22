import { expect, test } from "../fixtures"

test.describe("Страницы отпуска за свой счет и вызовов в выходной", () => {
  test("показывает ссылки в сайдбаре", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("button", { name: "Отсутствия" }).click()

    await expect(page.getByRole("link", { name: "Трудовой отпуск" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Отпуск за свой счет" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Вызовы в выходные дни" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Больничные" })).toBeVisible()
  })

  test("рендерит страницу /unpaid-leaves и отправляет фильтр order_type_code", async ({ page }) => {
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "GET" &&
        request.url().includes("/api/orders/all") &&
        request.url().includes("order_type_code=vacation_unpaid")
    )

    await page.goto("/unpaid-leaves")

    await expect(page.getByRole("heading", { name: "Отпуск за свой счет" })).toBeVisible()
    await requestPromise
  })

  test("рендерит страницу /weekend-calls и отправляет фильтр order_type_code", async ({ page }) => {
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "GET" &&
        request.url().includes("/api/orders/all") &&
        request.url().includes("order_type_code=weekend_call")
    )

    await page.goto("/weekend-calls")

    await expect(page.getByRole("heading", { name: "Вызовы в выходные дни" })).toBeVisible()
    await requestPromise
  })

  test("рендерит страницу /sick-leaves после обновления блока отсутствий", async ({ page }) => {
    await page.goto("/sick-leaves")
    await expect(page.getByRole("heading", { name: "Больничные листы" })).toBeVisible()
  })

  test("на странице отпуска за свой счет доступны действия с приказом", async ({ page, apiOps }) => {
    const employee = await apiOps.createEmployee({ name: `E2E-Unpaid-${Date.now()}` })
    const unpaidTypeId = await apiOps.getOrderTypeId({ code: "vacation_unpaid" })

    await apiOps.createOrder(employee.id, {
      order_type_id: unpaidTypeId,
      order_date: "2026-04-03",
      order_number: `92${Date.now() % 100}`,
      extra_fields: {
        vacation_start: "2026-04-10",
        vacation_end: "2026-04-12",
        vacation_days: 3,
      },
    })

    await page.goto("/unpaid-leaves")

    await expect(page.getByTitle("Быстрый просмотр").first()).toBeVisible()
    await expect(page.getByTitle("Скачать приказ").first()).toBeVisible()
    await expect(page.getByTitle("Отменить приказ").first()).toBeVisible()
    await expect(page.getByTitle("Удалить приказ").first()).toBeVisible()
  })

  test("ведет учет вызовов и считает общее количество за выбранный период", async ({ page, apiOps }) => {
    const employee = await apiOps.createEmployee({ name: `E2E-Weekend-${Date.now()}` })
    const weekendTypeId = await apiOps.getOrderTypeId({ code: "weekend_call" })

    await apiOps.createOrder(employee.id, {
      order_type_id: weekendTypeId,
      order_date: "2026-04-01",
      order_number: `90${Date.now() % 100}`,
      extra_fields: { call_date: "2026-04-04" },
    })

    await apiOps.createOrder(employee.id, {
      order_type_id: weekendTypeId,
      order_date: "2026-04-02",
      order_number: `91${Date.now() % 100}`,
      extra_fields: { call_date_start: "2026-04-10", call_date_end: "2026-04-12" },
    })

    await page.goto("/weekend-calls")

    await page.locator('[data-testid="weekend-period-from"] input').fill("01.04.2026")
    await page.locator('[data-testid="weekend-period-to"] input').fill("12.04.2026")

    await expect(page.getByTestId("weekend-total-calls")).toHaveText("Всего вызовов за период: 2")
    await expect(page.getByTestId("weekend-total-days")).toHaveText("Всего дней вызова: 4")
    await expect(page.getByRole("cell", { name: employee.name }).first()).toBeVisible()

    await page.locator('[data-testid="weekend-period-to"] input').fill("04.04.2026")

    await expect(page.getByTestId("weekend-total-calls")).toHaveText("Всего вызовов за период: 1")
    await expect(page.getByTestId("weekend-total-days")).toHaveText("Всего дней вызова: 1")

    await expect(page.getByTitle("Быстрый просмотр").first()).toBeVisible()
    await expect(page.getByTitle("Скачать приказ").first()).toBeVisible()
    await expect(page.getByTitle("Отменить приказ").first()).toBeVisible()
    await expect(page.getByTitle("Удалить приказ").first()).toBeVisible()
  })
})
