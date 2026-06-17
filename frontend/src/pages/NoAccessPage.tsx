import { useState, useEffect } from "react"
import { ShieldAlert, LogOut, KeyRound, ChevronDown, ChevronUp, Loader2, Bug, AlertCircle } from "lucide-react"
import { loginWithPassword, isDevMode, redirectToKtmLogin, pingKtm } from "@/shared/api/axios"

export function NoAccessPage() {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isKtmDown, setIsKtmDown] = useState(false)

  const devMode = isDevMode()

  useEffect(() => {
    async function checkKtm() {
      const isUp = await pingKtm()
      if (!isUp) {
        setIsKtmDown(true)
        setShowPasswordForm(true)
      }
    }
    checkKtm()
  }, [])

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await loginWithPassword(username, password)
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа")
    } finally {
      setLoading(false)
    }
  }

  function loginAsDev(role: "admin" | "viewer") {
    localStorage.setItem("token", role)
    window.location.reload()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white text-slate-900 p-4">
      <div className="max-w-md w-full text-center space-y-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-lg">

        {/* Иконка */}
        <div className="flex justify-center">
          <div className="p-4 bg-red-50 text-red-500 rounded-full border border-red-200">
            <ShieldAlert className="h-12 w-12" />
          </div>
        </div>

        {/* Заголовок */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Доступ к HRMS ограничен</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            У вашей учетной записи нет разрешения на вход в кадровую систему. Пожалуйста, обратитесь к
            администратору панели KTM-2000 для настройки прав доступа.
          </p>
        </div>

        {/* Кнопки */}
        <div className="pt-2 space-y-3">
          {isKtmDown && (
            <div className="flex items-start gap-2 text-left bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3.5 mb-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Сервер авторизации KTM-2000 недоступен</p>
                <p className="text-red-600">Система временно переведена в локальный режим авторизации. Пожалуйста, войдите под своим логином и паролем.</p>
              </div>
            </div>
          )}

          {/* Войти через SSO */}
          <button
            onClick={redirectToKtmLogin}
            disabled={isKtmDown}
            className="inline-flex w-full items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 active:bg-slate-800 disabled:opacity-50 disabled:bg-slate-900 disabled:text-slate-400 text-white font-medium py-2.5 px-4 rounded-xl border border-slate-800 disabled:border-slate-900 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <LogOut className="h-4 w-4" />
            Войти через SSO (KTM-2000) {isKtmDown && "(недоступен)"}
          </button>

          {/* Войти с паролем — сворачиваемый блок */}
          <button
            onClick={() => { setShowPasswordForm((v) => !v); setError(null) }}
            className="inline-flex w-full items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer"
          >
            <KeyRound className="h-4 w-4" />
            Войти с паролем
            {showPasswordForm ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
          </button>

          {/* Форма логин/пароль */}
          {showPasswordForm && (
            <form onSubmit={handlePasswordLogin} className="text-left space-y-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Логин</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин"
                  required
                  autoComplete="username"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 placeholder:text-slate-400"
                />
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Войти
              </button>
            </form>
          )}
        </div>

        {/* Dev-блок — виден только в dev/test режиме */}
        {devMode && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3 text-left mt-2">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Dev / Test режим
              </span>
            </div>
            <p className="text-xs text-amber-600">
              Быстрый вход без KTM-2000. Только в dev/test окружении.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => loginAsDev("admin")}
                className="flex-1 py-2 px-3 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors cursor-pointer"
              >
                Войти как Admin
              </button>
              <button
                onClick={() => loginAsDev("viewer")}
                className="flex-1 py-2 px-3 text-sm font-medium bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 rounded-lg transition-colors cursor-pointer"
              >
                Войти как Viewer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
