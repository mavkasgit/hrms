import { test, expect } from './fixtures/vacations-fixtures'
import type { VacationPeriodData, BalanceData } from './fixtures/vacations-fixtures'

const API_BASE = 'http://127.0.0.1:8000'

test.describe('Vacation Balance API tests', () => {
  test.setTimeout(180000)

  test('1) employee without vacations - balance by all past periods', async ({ request }) => {
    const uid = 'T1-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()

    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    const balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] Balance (all periods): available=${balance.available_days}, used=${balance.used_days}, remaining=${balance.remaining_days}`)

    expect(balance.available_days).toBeGreaterThan(0)
    expect(balance.used_days).toBe(0)
    expect(balance.remaining_days).toBe(balance.available_days)

    const balance2024 = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] Balance 2024: available=${balance2024.available_days}, used=${balance2024.used_days}, remaining=${balance2024.remaining_days}`)
    expect(balance2024.available_days).toBe(24)

    console.log(`[${uid}] === Done ===`)
  })

  test('2) after vacation creation - balance decreases', async ({ request }) => {
    const uid = 'T2-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    const balanceBefore = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] Balance before vacation: available=${balanceBefore.available_days}, used=${balanceBefore.used_days}, remaining=${balanceBefore.remaining_days}`)

    console.log(`[${uid}] Creating vacation for 3 days`)
    const vacResp = await request.post(`${API_BASE}/api/vacations`, {
      data: {
        employee_id: emp.id,
        start_date: '2024-06-01',
        end_date: '2024-06-03',
        vacation_type: 'Трудовой',
        order_date: '2024-05-25',
      }
    })
    const vac = await vacResp.json()
    console.log(`[${uid}] Vacation created: id=${vac.id}, days=${vac.days_count}`)

    const periodsAfter = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    const periodYear1 = periodsAfter.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Period after vacation: used=${periodYear1.used_days}`)

    expect(periodYear1.used_days).toBe(3)

    const balanceAfter = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] Balance after vacation: available=${balanceAfter.available_days}, used=${balanceAfter.used_days}, remaining=${balanceAfter.remaining_days}`)

    expect(balanceAfter.used_days).toBe(3)
    expect(balanceAfter.remaining_days).toBe(balanceAfter.available_days - 3)

    await request.delete(`${API_BASE}/api/vacations/${vac.id}`)
    console.log(`[${uid}] Vacation deleted`)

    const periodsRestored = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    const periodYear1Restored = periodsRestored.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Period after deletion: used=${periodYear1Restored.used_days}`)
    expect(periodYear1Restored.used_days).toBe(0)

    const balanceRestored = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] Balance after deletion: available=${balanceRestored.available_days}, used=${balanceRestored.used_days}, remaining=${balanceRestored.remaining_days}`)

    expect(balanceRestored.used_days).toBe(0)
    expect(balanceRestored.remaining_days).toBe(balanceRestored.available_days)

    console.log(`[${uid}] === Done ===`)
  })

  test('3) full period close - remaining = 0', async ({ request }) => {
    const uid = 'T3-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee with additional days`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
        additional_vacation_days: 5,
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}, add days=5`)

    const periodsResp = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    })
    const periods = await periodsResp.json()
    const year1 = periods.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Year 1: total=${year1.total_days}`)

    console.log(`[${uid}] Closing period fully`)
    const closeResp = await request.post(`${API_BASE}/api/vacation-periods/${year1.period_id}/close`)
    const closed = await closeResp.json()
    console.log(`[${uid}] After close: used=${closed.used_days}, remaining=${closed.remaining_days}`)

    const balance2024 = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] Balance 2024: available=${balance2024.available_days}, used=${balance2024.used_days}, remaining=${balance2024.remaining_days}`)

    expect(balance2024.available_days).toBe(29)
    expect(balance2024.used_days).toBe(29)
    expect(balance2024.remaining_days).toBe(0)

    console.log(`[${uid}] === Done ===`)
  })

  test('4) partial close - remaining = N', async ({ request }) => {
    const uid = 'T4-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    const periodsResp = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    })
    const periods = await periodsResp.json()
    const year1 = periods.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Year 1: total=${year1.total_days}`)

    console.log(`[${uid}] Partial close: leave 5 days`)
    const partialResp = await request.post(`${API_BASE}/api/vacation-periods/${year1.period_id}/partial-close`, {
      data: { remaining_days: 5 }
    })
    const partial = await partialResp.json()
    console.log(`[${uid}] After partial-close: used=${partial.used_days}, remaining=${partial.remaining_days}`)

    const balance2024 = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] Balance 2024: available=${balance2024.available_days}, used=${balance2024.used_days}, remaining=${balance2024.remaining_days}`)

    expect(balance2024.available_days).toBe(24)
    expect(balance2024.used_days).toBe(19)
    expect(balance2024.remaining_days).toBe(5)

    console.log(`[${uid}] === Done ===`)
  })

  test('5) overclose - used > total', async ({ request }) => {
    const uid = 'T5-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    const periodsResp = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    })
    const periods = await periodsResp.json()
    const year1 = periods.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Year 1: total=${year1.total_days}`)

    console.log(`[${uid}] Overclose: used=30 with total=24`)
    const overcloseResp = await request.post(`${API_BASE}/api/vacation-periods/${year1.period_id}/set-used-days`, {
      data: { used_days: 30 }
    })
    const overclose = await overcloseResp.json()
    console.log(`[${uid}] After overclose: used=${overclose.used_days}, remaining=${overclose.remaining_days}`)

    const balance2024 = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] Balance 2024: available=${balance2024.available_days}, used=${balance2024.used_days}, remaining=${balance2024.remaining_days}`)

    expect(balance2024.available_days).toBe(24)
    expect(balance2024.used_days).toBe(30)
    expect(balance2024.remaining_days).toBe(-6)

    console.log(`[${uid}] === Done ===`)
  })

  test('6) multiple years - total balance', async ({ request }) => {
    const uid = 'T6-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2027-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    const periodsResp = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    })
    const periods = await periodsResp.json()
    console.log(`[${uid}] Periods: ${periods.length}`)
    for (const p of periods) {
      console.log(`[${uid}]   Year ${p.year_number}: total=${p.total_days}`)
    }

    const totalFromPeriods = periods.reduce((sum: number, p: VacationPeriodData) => sum + p.total_days, 0)
    console.log(`[${uid}] Sum of total from periods: ${totalFromPeriods}`)

    const balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] Balance: available=${balance.available_days}, used=${balance.used_days}, remaining=${balance.remaining_days}`)

    expect(balance.available_days).toBe(totalFromPeriods)
    expect(balance.remaining_days).toBe(balance.available_days - balance.used_days)

    console.log(`[${uid}] === Done ===`)
  })

  test('7) additional days of employee - in balance', async ({ request }) => {
    const uid = 'T7-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee with additional days=7`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
        additional_vacation_days: 7,
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}, add days=7`)

    const periodsResp = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    })
    const periods = await periodsResp.json()
    const year1 = periods.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Year 1: main=${year1.main_days}, add=${year1.additional_days}, total=${year1.total_days}`)

    expect(year1.main_days).toBe(24)
    expect(year1.additional_days).toBe(7)
    expect(year1.total_days).toBe(31)

    const balance2024 = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] Balance 2024: available=${balance2024.available_days}, used=${balance2024.used_days}, remaining=${balance2024.remaining_days}`)

    expect(balance2024.available_days).toBe(31)

    console.log(`[${uid}] === Done ===`)
  })

  test('8) combined scenario: additional days + vacation + close', async ({ request }) => {
    const uid = 'T8-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee with additional days=3`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
        additional_vacation_days: 3,
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    let balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] 1) Empty balance: available=${balance.available_days}, used=${balance.used_days}, remaining=${balance.remaining_days}`)
    expect(balance.used_days).toBe(0)

    await request.get(`${API_BASE}/api/vacation-periods`, { params: { employee_id: emp.id } })
    balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] 2) After periods: available=${balance.available_days}, used=${balance.used_days}, remaining=${balance.remaining_days}`)
    expect(balance.available_days).toBe(27)

    await request.post(`${API_BASE}/api/vacations`, {
      data: {
        employee_id: emp.id,
        start_date: '2024-06-01',
        end_date: '2024-06-05',
        vacation_type: 'Трудовой',
        order_date: '2024-05-25',
      }
    })
    balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] 3) After vacation (5 days): available=${balance.available_days}, used=${balance.used_days}, remaining=${balance.remaining_days}`)
    expect(balance.used_days).toBe(5)
    expect(balance.remaining_days).toBe(22)

    const periodsResp = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    })
    const periods = await periodsResp.json()
    const year1 = periods.find((p: VacationPeriodData) => p.year_number === 1)
    await request.post(`${API_BASE}/api/vacation-periods/${year1.period_id}/close`)
    balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] 4) After close: available=${balance.available_days}, used=${balance.used_days}, remaining=${balance.remaining_days}`)
    expect(balance.remaining_days).toBe(0)

    console.log(`[${uid}] === Done ===`)
  })

  test('9) balance recalculation on vacation deletion', async ({ request }) => {
    const uid = 'T9-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    await request.get(`${API_BASE}/api/vacation-periods`, { params: { employee_id: emp.id } })

    const vacResp = await request.post(`${API_BASE}/api/vacations`, {
      data: {
        employee_id: emp.id,
        start_date: '2024-06-01',
        end_date: '2024-06-10',
        vacation_type: 'Трудовой',
        order_date: '2024-05-25',
      }
    })
    const vac = await vacResp.json()
    console.log(`[${uid}] Vacation id=${vac.id}, days=${vac.days_count}`)

    const periodsWith = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    const periodWith = periodsWith.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Period with vacation: used=${periodWith.used_days}`)
    expect(periodWith.used_days).toBe(10)

    let balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] Balance with vacation: used=${balance.used_days}, remaining=${balance.remaining_days}`)

    await request.delete(`${API_BASE}/api/vacations/${vac.id}`)
    console.log(`[${uid}] Vacation deleted`)

    const periodsDeleted = await request.get(`${API_BASE}/api/vacation-periods`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    const periodDeleted = periodsDeleted.find((p: VacationPeriodData) => p.year_number === 1)
    console.log(`[${uid}] Period after deletion: used=${periodDeleted.used_days}`)
    expect(periodDeleted.used_days).toBe(0)

    balance = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id }
    }).then(r => r.json())
    console.log(`[${uid}] Balance after deletion: used=${balance.used_days}, remaining=${balance.remaining_days}`)

    expect(balance.used_days).toBe(0)
    expect(balance.remaining_days).toBe(balance.available_days)

    console.log(`[${uid}] === Done ===`)
  })

  test('10) balance by specific year', async ({ request }) => {
    const uid = 'T10-BALANCE-' + Date.now().toString(36)
    console.log(`\n[${uid}] Creating employee`)

    const deptResp = await request.post(`${API_BASE}/api/departments`, { data: { name: `Dept-${uid}`, sort_order: 0 } })
    const dept = await deptResp.json()
    const posResp = await request.post(`${API_BASE}/api/positions`, { data: { name: `Pos-${uid}`, sort_order: 0 } })
    const pos = await posResp.json()

    const empResp = await request.post(`${API_BASE}/api/employees`, {
      data: {
        name: `Employee-${uid}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(200000 + Math.random() * 800000),
        department_id: dept.id,
        position_id: pos.id,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2027-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
      }
    })
    const emp = await empResp.json()
    console.log(`[${uid}] Employee id=${emp.id}`)

    await request.get(`${API_BASE}/api/vacation-periods`, { params: { employee_id: emp.id } })

    await request.post(`${API_BASE}/api/vacations`, {
      data: {
        employee_id: emp.id,
        start_date: '2024-06-01',
        end_date: '2024-06-02',
        vacation_type: 'Трудовой',
        order_date: '2024-05-25',
      }
    })

    const balance2024 = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2024 }
    }).then(r => r.json())
    console.log(`[${uid}] Balance 2024: available=${balance2024.available_days}, used=${balance2024.used_days}, remaining=${balance2024.remaining_days}`)

    const balance2025 = await request.get(`${API_BASE}/api/vacations/balance`, {
      params: { employee_id: emp.id, year: 2025 }
    }).then(r => r.json())
    console.log(`[${uid}] Balance 2025: available=${balance2025.available_days}, used=${balance2025.used_days}, remaining=${balance2025.remaining_days}`)

    expect(balance2024.used_days).toBe(2)
    expect(balance2025.used_days).toBe(0)

    console.log(`[${uid}] === Done ===`)
  })
})
