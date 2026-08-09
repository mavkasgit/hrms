/**
 * Регрессия #64/#66: отпуск создаётся ровно один раз, повтор → 409.
 *
 * Раньше POST /vacations создавал две записи отпуска (автозапись в
 * order_service + явная запись в vacation_service). Тест доказывает, что
 * один запрос даёт ровно одну запись, а повторный — понятную ошибку 409
 * (в form-пути это VacationOverlapError от пересечения дат — оба сценария
 * возвращают 409 с сообщением, а не 500).
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

test.describe('Vacation single creation @api', () => {
  test.setTimeout(30_000)

  test('@api one POST /vacations → exactly one record; repeat → 409', async ({
    apiOps,
    playwright,
  }) => {
    const emp = await apiOps.createEmployee({
      hire_date: '2024-01-15',
      contract_start: '2024-01-15',
    })

    const payload = {
      employee_id: emp.id,
      start_date: '2024-06-01',
      end_date: '2024-06-05',
      vacation_type: 'Трудовой',
      order_date: '2024-05-25',
    }

    const vac = await apiOps.createVacation(emp.id, {
      start_date: '2024-06-01',
      end_date: '2024-06-05',
      vacation_type: 'Трудовой',
      order_date: '2024-05-25',
    })
    expect(vac.id).toBeTruthy()

    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      // Ровно одна запись отпуска для сотрудника (а не две).
      const listResp = await request.get('/api/vacations', {
        params: { employee_id: emp.id, per_page: 100 },
      })
      expect(listResp.status()).toBe(200)
      const list = await listResp.json()
      expect(list.total).toBe(1)
      expect(list.items).toHaveLength(1)
      expect(list.items[0].employee_id).toBe(emp.id)

      // Повторное создание (те же даты/сотрудник) → 409 с понятным сообщением.
      // Form-путь каждый раз создаёт новый приказ, поэтому дубль перехватывает
      // проверка пересечения дат (VacationOverlapError) — тоже 409.
      const repeatResp = await request.post('/api/vacations', { data: payload })
      expect(repeatResp.status()).toBe(409)
      const body = await repeatResp.json()
      expect(body.detail).toBeTruthy()
      expect(body.detail).not.toContain('Internal Server Error')
    } finally {
      await dispose()
    }
  })
})
