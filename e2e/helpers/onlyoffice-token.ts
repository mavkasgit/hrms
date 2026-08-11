/**
 * Подписанный JWT для OnlyOffice-колбэков.
 *
 * Callback-токен подписывается тем же JWT-секретом, что и бэкенд
 * (ONLYOFFICE_JWT_SECRET). Значение обязано быть задано и совпадать с
 * backend-окружением под тестом (dev / test / CI) — без фолбэка, чтобы
 * не подписывать токен молча неверным secret'ом (J2).
 * HS256 + base64url — как у бэкенда (python-jose / onlyoffice_service).
 */
import { createHmac } from 'node:crypto'

const OO_JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET
if (!OO_JWT_SECRET) {
  throw new Error(
    'ONLYOFFICE_JWT_SECRET не задан: задайте его в e2e/.env (см. e2e/.env.example). ' +
      'Значение должно совпадать с OnlyOffice-секретом backend-окружения под тестом.',
  )
}

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** Подписать payload как HS256-JWT для OnlyOffice callback (header {alg,typ}). */
export function onlyOfficeToken(payload: Record<string, unknown>): string {
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url(payload)
  const signature = createHmac('sha256', OO_JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${signature}`
}
