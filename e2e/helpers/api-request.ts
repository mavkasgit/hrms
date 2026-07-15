/**
 * Authenticated APIRequestContext for new suite (storageState token → Bearer).
 * Playwright's built-in `request` fixture does not send localStorage JWT.
 */
import type { APIRequestContext, Playwright } from '@playwright/test'
import { getAdminTokenFromStorage } from '../fixtures/auth'
import { API_BASE } from '../fixtures/api'

export async function createAuthenticatedRequest(
  playwright: Playwright
): Promise<{ request: APIRequestContext; dispose: () => Promise<void> }> {
  const token = getAdminTokenFromStorage()
  if (!token) {
    throw new Error(
      'No admin token in e2e/.auth/admin.json — run project setup first'
    )
  }
  const request = await playwright.request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  })
  return {
    request,
    dispose: async () => {
      await request.dispose()
    },
  }
}
