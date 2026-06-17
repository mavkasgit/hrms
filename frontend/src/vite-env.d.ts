/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_KTM_PORT?: string
  /** Режим авторизации. 'dev' или 'test' включает кнопки быстрого входа без KTM-2000. */
  readonly VITE_AUTH_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
