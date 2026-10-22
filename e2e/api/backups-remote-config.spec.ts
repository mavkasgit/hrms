/**
 * @api Контракт настроек дополнительной копии бэкапов (#126).
 *
 * Проверяет главное, что нельзя проверить юнит-тестами backend:
 * - пароль never выходит наружу (ни `password_enc`, ни открытым текстом);
 * - `has_password` отражает наличие сохранённого пароля;
 * - ошибки настроек приходят как 422 (Pydantic/валидация), а не 500/502;
 * - режимы, несовместимые с хранилищем, отклоняются на сохранении
 *   (гостевой SFTP, учётная запись для NFS/готового remote rclone).
 *
 * Реальное копирование (rclone) здесь не вызывается: для этого нужен
 * настроенный внешний диск, проверка — ручная (см. docs/deployment.md).
 */
import { test, expect } from '../fixtures/index'
import { createAuthenticatedRequest } from '../helpers/api-request'

type RemoteConfig = {
  enabled: boolean
  destination: string
  auth_mode: 'guest' | 'credentials'
  username: string
  domain: string
  bwlimit: string
  retention: { daily: number; weekly: number; monthly: number; manual: number }
  has_password: boolean
}

type BackupConfig = {
  auto_enabled: boolean
  time_of_day: string
  remote: RemoteConfig
}

test.describe('Backup remote config contract @api', () => {
  test.setTimeout(30_000)

  test('@api маскирует пароль и валидирует режимы внешней копии', async ({ playwright }) => {
    const { request, dispose } = await createAuthenticatedRequest(playwright)
    try {
      const initialResponse = await request.get('/api/backups/config')
      expect(initialResponse.status()).toBe(200)
      const original = (await initialResponse.json()) as BackupConfig

      // Публичный контракт: пароля нет, но признак наличия — булево.
      expect(typeof original.remote.has_password).toBe('boolean')
      expect(original.remote).not.toHaveProperty('password_enc')
      expect(JSON.stringify(original)).not.toContain('password_enc')

      // Неверное время — 422 (валидация Pydantic), конфиг не меняется.
      const invalidTime = await request.patch('/api/backups/config', {
        data: { time_of_day: '25:99' },
      })
      expect(invalidTime.status()).toBe(422)

      // Включённая копия без адреса — 422.
      const noDestination = await request.patch('/api/backups/config', {
        data: { remote: { enabled: true, destination: '' } },
      })
      expect(noDestination.status()).toBe(422)

      // Гостевой SFTP невозможен: нужна учётная запись.
      const guestSftp = await request.patch('/api/backups/config', {
        data: {
          remote: {
            enabled: false,
            destination: 'sftp://backup-host/backups/hrms',
            auth_mode: 'guest',
            username: '',
          },
        },
      })
      expect(guestSftp.status()).toBe(422)

      // NFS не принимает логин/пароль из настроек приложения.
      const nfsCredentials = await request.patch('/api/backups/config', {
        data: {
          remote: {
            enabled: false,
            destination: 'nfs://nas/export/hrms',
            auth_mode: 'credentials',
            username: 'backup',
          },
        },
      })
      expect(nfsCredentials.status()).toBe(422)

      // Пароль сохраняется, но наружу отдаётся только has_password.
      const savedResponse = await request.patch('/api/backups/config', {
        data: {
          remote: {
            enabled: false,
            destination: 'smb://nas/backup/hrms',
            auth_mode: 'credentials',
            username: 'backup',
            domain: 'CORP',
            password: 'e2e-remote-secret',
          },
        },
      })
      expect(savedResponse.status()).toBe(200)
      const savedBody = await savedResponse.json()
      expect(savedBody.remote.has_password).toBe(true)
      expect(savedBody.remote.password_enc).toBeUndefined()
      expect(JSON.stringify(savedBody)).not.toContain('e2e-remote-secret')

      // PATCH без поля password не сбрасывает сохранённый пароль.
      const keptResponse = await request.patch('/api/backups/config', {
        data: { remote: { bwlimit: '10M' } },
      })
      expect(keptResponse.status()).toBe(200)
      expect((await keptResponse.json()).remote.has_password).toBe(true)

      // Пустая строка — явная очистка.
      const clearedResponse = await request.patch('/api/backups/config', {
        data: { remote: { password: '' } },
      })
      expect(clearedResponse.status()).toBe(200)
      expect((await clearedResponse.json()).remote.has_password).toBe(false)

      // Восстанавливаем исходные настройки, чтобы не влиять на другие тесты.
      const restored = await request.patch('/api/backups/config', {
        data: {
          auto_enabled: original.auto_enabled,
          time_of_day: original.time_of_day,
          remote: {
            enabled: original.remote.enabled,
            destination: original.remote.destination,
            auth_mode: original.remote.auth_mode,
            username: original.remote.username,
            domain: original.remote.domain,
            bwlimit: original.remote.bwlimit,
            retention: original.remote.retention,
            // Исходный пароль не восстановим: он не отдаётся наружу.
            password: '',
          },
        },
      })
      expect(restored.status()).toBe(200)
    } finally {
      await dispose()
    }
  })
})
