/**
 * @deprecated Используйте import { test, expect } from './fixtures'
 *
 * Этот файл оставлен для обратной совместимости.
 * Он реэкспортирует современные фикстуры из index.ts
 * с маппингом старых имен (employeesApi -> apiOps)
 */
import { test as base, expect } from '@playwright/test';
const API_BASE = 'http://127.0.0.1:8000';
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
export const test = base.extend({
    employeesApi: async ({ request }, use) => {
        const employees = [];
        const departments = [];
        const positions = [];
        await use({
            uid,
            createEmployee: async (overrides) => {
                const u = uid();
                const deptResp = await request.post(`${API_BASE}/api/departments`, {
                    data: { name: `EmpFix-Отдел-${u}`, sort_order: 0 }
                });
                const dept = await deptResp.json();
                departments.push(dept.id);
                const posResp = await request.post(`${API_BASE}/api/positions`, {
                    data: { name: `EmpFix-Должность-${u}`, sort_order: 0 }
                });
                const pos = await posResp.json();
                positions.push(pos.id);
                const empData = {
                    name: `EmpFix-Сотрудник-${u}`,
                    gender: 'М',
                    birth_date: '1990-05-15',
                    tab_number: Math.floor(100000 + Math.random() * 900000),
                    department_id: dept.id,
                    position_id: pos.id,
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
                const emp = await resp.json();
                employees.push(emp.id);
                return emp;
            },
            dismissEmployee: async (employeeId) => {
                const resp = await request.post(`${API_BASE}/api/employees/${employeeId}/dismiss`);
                expect(resp.status()).toBe(200);
                return resp.json();
            },
            restoreEmployee: async (employeeId) => {
                const resp = await request.post(`${API_BASE}/api/employees/${employeeId}/restore`);
                expect(resp.status()).toBe(200);
                return resp.json();
            },
            getEmployeeById: async (employeeId) => {
                const resp = await request.get(`${API_BASE}/api/employees/${employeeId}`);
                expect(resp.status()).toBe(200);
                return resp.json();
            },
            searchEmployees: async (query) => {
                const resp = await request.get(`${API_BASE}/api/employees`, {
                    params: { q: query, per_page: 100 }
                });
                expect(resp.status()).toBe(200);
                const data = await resp.json();
                return data.items || [];
            },
            deleteEmployee: async (employeeId) => {
                const resp = await request.delete(`${API_BASE}/api/employees/${employeeId}?hard=true&confirm=true`);
                expect([200, 204]).toContain(resp.status());
            },
            cleanup: async () => {
                for (const empId of employees.reverse()) {
                    await request.delete(`${API_BASE}/api/employees/${empId}?hard=true&confirm=true`).catch(() => { });
                }
                for (const posId of positions.reverse()) {
                    await request.delete(`${API_BASE}/api/positions/${posId}`).catch(() => { });
                }
                for (const deptId of departments.reverse()) {
                    await request.delete(`${API_BASE}/api/departments/${deptId}`).catch(() => { });
                }
            },
        });
        // Cleanup
        for (const empId of employees.reverse()) {
            await request.delete(`${API_BASE}/api/employees/${empId}?hard=true&confirm=true`).catch(() => { });
        }
        for (const posId of positions.reverse()) {
            await request.delete(`${API_BASE}/api/positions/${posId}`).catch(() => { });
        }
        for (const deptId of departments.reverse()) {
            await request.delete(`${API_BASE}/api/departments/${deptId}`).catch(() => { });
        }
    }
});
export { expect } from '@playwright/test';
