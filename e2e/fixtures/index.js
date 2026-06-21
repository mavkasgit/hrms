import { test as base, expect } from '@playwright/test';
import { uid } from '../helpers/test-utils';
// =============================================================================
// CONSTANTS
// =============================================================================
export const API_BASE = process.env.E2E_API_URL
    ? process.env.E2E_API_URL.replace(/\/api$/, '')
    : 'http://127.0.0.1:8000';
// =============================================================================
// API OPERATIONS - DEPARTMENTS
// =============================================================================
async function apiCreateDepartment(request, name, overrides = {}) {
    const resp = await request.post(`${API_BASE}/api/departments`, {
        data: { name, sort_order: 0, ...overrides },
    });
    expect([200, 201]).toContain(resp.status());
    return resp.json();
}
async function apiDeleteDepartment(request, id) {
    const resp = await request.delete(`${API_BASE}/api/departments/${id}`);
    expect([200, 204]).toContain(resp.status());
}
// =============================================================================
// API OPERATIONS - POSITIONS
// =============================================================================
async function apiCreatePosition(request, name, overrides = {}) {
    const resp = await request.post(`${API_BASE}/api/positions`, {
        data: { name, sort_order: 0, ...overrides },
    });
    expect([200, 201]).toContain(resp.status());
    return resp.json();
}
async function apiDeletePosition(request, id) {
    const resp = await request.delete(`${API_BASE}/api/positions/${id}`);
    expect([200, 204]).toContain(resp.status());
}
// =============================================================================
// API OPERATIONS - EMPLOYEES
// =============================================================================
async function apiCreateEmployee(request, departmentId, positionId, overrides = {}) {
    const u = uid();
    const empData = {
        name: `Сотрудник-${u}`,
        gender: 'М',
        birth_date: '1990-05-15',
        tab_number: Math.floor(100000 + Math.random() * 900000),
        department_id: departmentId,
        position_id: positionId,
        hire_date: '2024-01-15',
        contract_start: '2024-01-15',
        contract_end: '2025-01-14',
        citizenship: true,
        residency: true,
        rate: 25.5,
        payment_form: 'Повременная',
        ...overrides,
    };
    const resp = await request.post(`${API_BASE}/api/employees`, { data: empData });
    expect([200, 201]).toContain(resp.status());
    return resp.json();
}
async function apiGetEmployee(request, id) {
    const resp = await request.get(`${API_BASE}/api/employees/${id}`);
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiUpdateEmployee(request, id, data) {
    const resp = await request.put(`${API_BASE}/api/employees/${id}`, { data });
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiDismissEmployee(request, id) {
    const resp = await request.post(`${API_BASE}/api/employees/${id}/dismiss`);
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiRestoreEmployee(request, id) {
    const resp = await request.post(`${API_BASE}/api/employees/${id}/restore`);
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiSearchEmployees(request, query) {
    const resp = await request.get(`${API_BASE}/api/employees`, {
        params: { q: query, per_page: 100 },
    });
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    return data.items || [];
}
async function apiDeleteEmployee(request, id) {
    // Сначала удаляем связанные планы отпусков
    const plansResp = await request.get(`${API_BASE}/api/vacation-plans?employee_id=${id}`);
    if (plansResp.status() === 200) {
        const plans = await plansResp.json();
        for (const plan of plans) {
            await request.delete(`${API_BASE}/api/vacation-plans/${plan.id}`);
        }
    }
    const resp = await request.delete(`${API_BASE}/api/employees/${id}?hard=true&confirm=true`);
    expect([200, 204]).toContain(resp.status());
}
// =============================================================================
// API OPERATIONS - VACATIONS
// =============================================================================
async function apiCreateVacation(request, employeeId, overrides = {}) {
    const vacData = {
        employee_id: employeeId,
        start_date: '2024-06-01',
        end_date: '2024-06-14',
        vacation_type: 'Трудовой',
        order_date: '2024-05-25',
        ...overrides,
    };
    const resp = await request.post(`${API_BASE}/api/vacations`, { data: vacData });
    expect([200, 201]).toContain(resp.status());
    return resp.json();
}
async function apiDeleteVacation(request, id) {
    const resp = await request.delete(`${API_BASE}/api/vacations/${id}`);
    expect([200, 204]).toContain(resp.status());
}
async function apiGetVacationBalance(request, employeeId) {
    const resp = await request.get(`${API_BASE}/api/vacations/balance`, {
        params: { employee_id: employeeId },
    });
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiGetVacationPeriods(request, employeeId) {
    const resp = await request.get(`${API_BASE}/api/vacation-periods`, {
        params: { employee_id: employeeId },
    });
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiGetPeriodBalance(request, periodId) {
    const resp = await request.get(`${API_BASE}/api/vacation-periods/${periodId}/balance`);
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiClosePeriod(request, periodId) {
    const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/close`);
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiPartialClosePeriod(request, periodId, remainingDays) {
    const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/partial-close`, {
        data: { remaining_days: remainingDays },
    });
    expect(resp.status()).toBe(200);
    return resp.json();
}
async function apiAdjustPeriod(request, periodId, additionalDays) {
    const resp = await request.post(`${API_BASE}/api/vacation-periods/${periodId}/adjust`, {
        data: { additional_days: additionalDays },
    });
    expect(resp.status()).toBe(200);
    return resp.json();
}
// =============================================================================
// API OPERATIONS - ORDERS
// =============================================================================
async function apiGetOrderTypes(request) {
    const resp = await request.get(`${API_BASE}/api/order-types`);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    return data.items || [];
}
async function apiGetOrderTypeId(request, params) {
    const types = await apiGetOrderTypes(request);
    const found = types.find((item) => {
        if (params.visibleOnly && !item.show_in_orders_page) {
            return false;
        }
        if (params.code) {
            return item.code === params.code;
        }
        if (params.name) {
            return item.name === params.name;
        }
        return false;
    });
    expect(found, `Order type not found: ${params.code ?? params.name}`).toBeTruthy();
    return found.id;
}
async function apiCreateOrder(request, employeeId, data) {
    let orderTypeId = data.order_type_id;
    if (!orderTypeId) {
        orderTypeId = await apiGetOrderTypeId(request, {
            code: data.order_type_code,
            name: data.order_type_name,
            visibleOnly: true,
        });
    }
    const orderData = {
        employee_id: employeeId,
        order_type_id: orderTypeId,
        order_date: data.order_date,
        order_number: data.order_number,
        extra_fields: data.extra_fields || {},
    };
    const resp = await request.post(`${API_BASE}/api/orders`, { data: orderData });
    expect([200, 201]).toContain(resp.status());
    return resp.json();
}
async function apiDeleteOrder(request, id) {
    const resp = await request.delete(`${API_BASE}/api/orders/${id}?hard=true&confirm=true`);
    expect([200, 204]).toContain(resp.status());
}
async function apiGetOrders(request, filters = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        params.append(key, String(value));
    }
    const resp = await request.get(`${API_BASE}/api/orders/all?${params.toString()}`);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    return data.items || [];
}
// =============================================================================
// FIXTURE IMPLEMENTATION
// =============================================================================
export const test = base.extend({
    apiOps: async ({ request }, use) => {
        const resources = {
            orders: [],
            vacations: [],
            employees: [],
            positions: [],
            departments: [],
        };
        const apiOps = {
            uid,
            // Departments
            createDepartment: async (name, overrides) => {
                const dept = await apiCreateDepartment(request, name, overrides);
                resources.departments.push(dept.id);
                return dept;
            },
            deleteDepartment: async (id) => {
                await apiDeleteDepartment(request, id);
            },
            // Positions
            createPosition: async (name, overrides) => {
                const pos = await apiCreatePosition(request, name, overrides);
                resources.positions.push(pos.id);
                return pos;
            },
            deletePosition: async (id) => {
                await apiDeletePosition(request, id);
            },
            // Employees
            createEmployee: async (deptIdOrOverrides, posIdOrOverrides, overrides) => {
                let deptId;
                let posId;
                let employeeOverrides;
                if (typeof deptIdOrOverrides === 'number') {
                    deptId = deptIdOrOverrides;
                    posId = posIdOrOverrides;
                    employeeOverrides = overrides;
                }
                else {
                    const autoOverrides = deptIdOrOverrides;
                    const autoUid = uid();
                    const dept = await apiCreateDepartment(request, `Fixture-Dept-${autoUid}`);
                    const pos = await apiCreatePosition(request, `Fixture-Pos-${autoUid}`);
                    resources.departments.push(dept.id);
                    resources.positions.push(pos.id);
                    deptId = dept.id;
                    posId = pos.id;
                    employeeOverrides = autoOverrides;
                }
                const emp = await apiCreateEmployee(request, deptId, posId, employeeOverrides);
                resources.employees.push(emp.id);
                return emp;
            },
            getEmployee: async (id) => apiGetEmployee(request, id),
            updateEmployee: async (id, data) => apiUpdateEmployee(request, id, data),
            dismissEmployee: async (id) => apiDismissEmployee(request, id),
            restoreEmployee: async (id) => apiRestoreEmployee(request, id),
            searchEmployees: async (query) => apiSearchEmployees(request, query),
            deleteEmployee: async (id) => {
                await apiDeleteEmployee(request, id);
            },
            // Vacations
            createVacation: async (empId, overrides) => {
                const vac = await apiCreateVacation(request, empId, overrides);
                resources.vacations.push(vac.id);
                return vac;
            },
            deleteVacation: async (id) => {
                await apiDeleteVacation(request, id);
            },
            getVacationBalance: async (empId) => apiGetVacationBalance(request, empId),
            getVacationPeriods: async (empId) => apiGetVacationPeriods(request, empId),
            getBalance: async (empId) => apiGetVacationBalance(request, empId),
            getPeriods: async (empId) => apiGetVacationPeriods(request, empId),
            getPeriodBalance: async (periodId) => apiGetPeriodBalance(request, periodId),
            closePeriod: async (periodId) => apiClosePeriod(request, periodId),
            partialClosePeriod: async (periodId, remainingDays) => apiPartialClosePeriod(request, periodId, remainingDays),
            adjustPeriod: async (periodId, additionalDays) => apiAdjustPeriod(request, periodId, additionalDays),
            // Orders
            getOrderTypes: async () => apiGetOrderTypes(request),
            getOrderTypeId: async (params) => apiGetOrderTypeId(request, params),
            createOrder: async (empId, data) => {
                const order = await apiCreateOrder(request, empId, data);
                resources.orders.push(order.id);
                return order;
            },
            deleteOrder: async (id) => apiDeleteOrder(request, id),
            getOrders: async (filters) => apiGetOrders(request, filters),
            // Cleanup
            cleanup: async () => {
                // Cleanup в правильном порядке: orders -> vacations -> employees -> positions -> departments
                for (const orderId of [...resources.orders].reverse()) {
                    await apiDeleteOrder(request, orderId).catch(() => { });
                }
                resources.orders = [];
                for (const vacId of [...resources.vacations].reverse()) {
                    await apiDeleteVacation(request, vacId).catch(() => { });
                }
                resources.vacations = [];
                for (const empId of [...resources.employees].reverse()) {
                    await apiDeleteEmployee(request, empId).catch(() => { });
                }
                resources.employees = [];
                for (const posId of [...resources.positions].reverse()) {
                    await apiDeletePosition(request, posId).catch(() => { });
                }
                resources.positions = [];
                for (const deptId of [...resources.departments].reverse()) {
                    await apiDeleteDepartment(request, deptId).catch(() => { });
                }
                resources.departments = [];
            },
            cleanupEmployee: async (id) => {
                await apiDeleteEmployee(request, id).catch(() => { });
            },
        };
        await use(apiOps);
        // Автоматический cleanup после теста
        // Порядок важен: сначала зависимые сущности (orders, vacations),
        // потом employees, затем positions и departments
        for (const orderId of [...resources.orders].reverse()) {
            await apiDeleteOrder(request, orderId).catch(() => { });
        }
        for (const vacId of [...resources.vacations].reverse()) {
            await apiDeleteVacation(request, vacId).catch(() => { });
        }
        for (const empId of [...resources.employees].reverse()) {
            await apiDeleteEmployee(request, empId).catch(() => { });
        }
        for (const posId of [...resources.positions].reverse()) {
            await apiDeletePosition(request, posId).catch(() => { });
        }
        for (const deptId of [...resources.departments].reverse()) {
            await apiDeleteDepartment(request, deptId).catch(() => { });
        }
    },
});
export { expect } from '@playwright/test';
