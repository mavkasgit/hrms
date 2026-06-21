import { expect } from '@playwright/test';
export function expectPeriodInvariant(period) {
    expect(period.remaining_days, `remaining_days invariant failed for period ${period.period_id}`).toBe(period.total_days - period.used_days);
}
export function expectBalanceInvariant(balance) {
    expect(balance.remaining_days, 'balance remaining_days invariant failed').toBe(balance.available_days - balance.used_days);
}
export function expectNonNegativeAvailable(balance) {
    expect(balance.available_days).toBeGreaterThanOrEqual(0);
}
