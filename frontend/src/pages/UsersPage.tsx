import { useEffect, useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  Users,
  Plus,
  Shield,
  ShieldCheck,
  UserCheck,
  Search,
  Edit2,
  Trash2,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Link,
  User as UserIcon,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import api from "@/shared/api/axios"
import { fetchEmployees, fetchEmployee } from "@/entities/employee/api"
import type { Employee } from "@/entities/employee/types"
import { EmployeeSearch } from "@/features/employee-search"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { getUserSeed } from "@/shared/lib/avatar"
import {
  fetchIdpConfig,
  fetchIdpUsers,
  setIdpUserAccess,
  type IdpConfig,
  type IdpUser,
  type IdpAccessLevel,
} from "@/shared/api/idpAdmin"
import { fetchOidcConfig } from "@/shared/api/oidcAuth"

interface User {
  id: number
  username: string
  full_name: string
  role: string
  employee_id: number | null
  employee_name: string | null
  created_at: string
  avatar_seed?: string | null
}

const rusToEng: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
  "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
  "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts",
  "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
  "я": "ya"
}

function transliterate(text: string): string {
  return text
    .split("")
    .map((char) => {
      const lowChar = char.toLowerCase()
      if (rusToEng[lowChar] !== undefined) {
        const trans = rusToEng[lowChar]
        return char === char.toUpperCase() ? trans.toUpperCase() : trans
      }
      return char
    })
    .join("")
}

function generateUsername(fullName: string): string {
  const clean = fullName.trim().replace(/\s+/g, " ")
  if (!clean) return ""
  const parts = clean.split(" ")
  if (parts.length >= 2) {
    const lastName = transliterate(parts[0]).toLowerCase()
    const firstNameChar = transliterate(parts[1][0]).toLowerCase()
    return `${lastName}_${firstNameChar}`.replace(/[^a-z0-9._-]/g, "")
  }
  return transliterate(parts[0]).toLowerCase().replace(/[^a-z0-9._-]/g, "")
}

function formatApiError(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { status?: number; data?: unknown } }).response
    const status = response?.status
    const data = response?.data

    if (data && typeof data === "object" && "detail" in data) {
      const detail = (data as { detail: unknown }).detail

      if (typeof detail === "string") {
        const lower = detail.toLowerCase()
        if (status === 403 || lower === "forbidden" || lower.includes("forbidden")) {
          return "Недостаточно прав (нужен admin)."
        }
        if (status === 404 || lower.includes("not found")) {
          return "Пользователь не найден."
        }
        if (detail === "role_managed_by_idp") {
          return "Роль задаётся в IdP (группы). Используйте блок «Доступ Authentik»."
        }
        return detail
      }

      if (Array.isArray(detail)) {
        return detail
          .map((item) => {
            if (!item || typeof item !== "object") {
              return JSON.stringify(item)
            }
            const loc =
              "loc" in item && Array.isArray(item.loc) ? item.loc : []
            const field =
              loc.length > 0 ? String(loc[loc.length - 1]) : ""
            const fieldNameRu =
              field === "username"
                ? "Логин"
                : field === "full_name"
                  ? "ФИО"
                  : field === "password"
                    ? "Пароль"
                    : field
            const msg =
              "msg" in item && typeof item.msg === "string"
                ? item.msg
                : JSON.stringify(item)
            return `${fieldNameRu ? fieldNameRu + ": " : ""}${msg}`
          })
          .join("; ")
      }

      if (detail && typeof detail === "object") {
        const d = detail as { detail?: unknown; message?: unknown }
        if (d.detail === "role_managed_by_idp") {
          return "Роль задаётся в IdP (группы). Используйте блок «Доступ Authentik»."
        }
        if (typeof d.message === "string" && d.message) {
          return d.message
        }
        return JSON.stringify(detail)
      }
    }

    if (status === 403) return "Недостаточно прав (нужен admin)."
    if (status === 404) return "Пользователь не найден."
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return "Произошла ошибка при сохранении"
}

function RoleBadge({ role, oidcManaged }: { role: string; oidcManaged: boolean }) {
  const label =
    role === "admin" ? "Администратор" : role === "viewer" ? "Наблюдатель" : role
  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${
        role === "admin"
          ? "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800/30"
          : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/30"
      }`}
    >
      {role === "admin" ? (
        <ShieldCheck className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
      ) : (
        <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
      )}
      {label}
    </span>
  )

  if (!oidcManaged) return badge

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        Роль управляется IdP (группы Authentik)
      </TooltipContent>
    </Tooltip>
  )
}

export function UsersPage() {
  const navigate = useNavigate()

  // Данные
  const [users, setUsers] = useState<User[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // OIDC / IdP (IdP-first when enabled; local IAM when off)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [oidcConfigLoaded, setOidcConfigLoaded] = useState(false)
  const [idpConfig, setIdpConfig] = useState<IdpConfig | null>(null)
  const [idpUsers, setIdpUsers] = useState<IdpUser[]>([])
  const [idpLoading, setIdpLoading] = useState(false)
  const [idpError, setIdpError] = useState("")
  const [idpSearch, setIdpSearch] = useState("")
  const [idpSaving, setIdpSaving] = useState<Record<number, boolean>>({})

  const [search, setSearch] = useState("")

  // Состояние диалога создания/редактирования
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  // Поля формы
  const [username, setUsername] = useState("")
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [role, setRole] = useState("viewer")
  const [password, setPassword] = useState("")
  const [usernameError, setUsernameError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Состояние диалога удаления
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  const validateUsername = (val: string) => {
    if (!val.trim()) {
      return "Имя пользователя обязательно"
    }
    if (val.trim().length < 2) {
      return "Логин должен содержать от 2 до 100 символов"
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(val.trim())) {
      return "Логин может содержать только латинские буквы, цифры, точки, дефисы и подчеркивания"
    }
    const normalized = val.trim().toLowerCase()
    const duplicate = users.some(
      (u) => u.username.toLowerCase() === normalized && (!selectedUser || u.id !== selectedUser.id),
    )
    if (duplicate) {
      return "Пользователь с таким именем пользователя уже существует"
    }
    return ""
  }

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [usersResponse, employeesResponse] = await Promise.all([
        api.get<User[]>("/users"),
        fetchEmployees({ page: 1, per_page: 1000, status: "active" }),
      ])
      setUsers(usersResponse.data)
      setEmployees(employeesResponse.items || [])
    } catch (err: unknown) {
      setError("Не удалось загрузить пользователей или список сотрудников")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadIdpSection = useCallback(async () => {
    setIdpError("")
    try {
      const oidc = await fetchOidcConfig()
      const enabled = Boolean(oidc.enabled)
      setOidcEnabled(enabled)
      if (!enabled) {
        setIdpConfig(null)
        setIdpUsers([])
        return
      }
      setIdpLoading(true)
      try {
        const cfg = await fetchIdpConfig()
        setIdpConfig(cfg)
        if (cfg.idp_admin_enabled) {
          const items = await fetchIdpUsers()
          setIdpUsers(items)
        } else {
          setIdpUsers([])
        }
      } catch (err) {
        console.error("IdP config/users failed:", err)
        setIdpError("Не удалось загрузить данные единого входа")
        setIdpConfig(null)
        setIdpUsers([])
      } finally {
        setIdpLoading(false)
      }
    } catch {
      setOidcEnabled(false)
    } finally {
      setOidcConfigLoaded(true)
    }
  }, [])

  useEffect(() => {
    void loadIdpSection()
  }, [loadIdpSection])

  // Local users only when OIDC is off (avoid flash of local IAM)
  useEffect(() => {
    if (!oidcConfigLoaded) return
    if (oidcEnabled) {
      setLoading(false)
      return
    }
    void loadData()
    // loadData is stable enough for mount-after-config; intentionally not memoized
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once mode is known
  }, [oidcConfigLoaded, oidcEnabled])

  const filteredIdpUsers = useMemo(() => {
    const q = idpSearch.trim().toLowerCase()
    if (!q) return idpUsers
    return idpUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q),
    )
  }, [idpUsers, idpSearch])

  const handleIdpAccessChange = async (pk: number, level: IdpAccessLevel) => {
    setIdpSaving((prev) => ({ ...prev, [pk]: true }))
    setIdpError("")
    try {
      const updated = await setIdpUserAccess(pk, level)
      setIdpUsers((prev) =>
        prev.map((u) =>
          u.pk === pk
            ? {
                ...u,
                ...updated,
                access_level: updated.access_level || level,
                groups: updated.groups || u.groups,
              }
            : u,
        ),
      )
    } catch (err) {
      console.error(err)
      setIdpError(formatApiError(err) || "Не удалось изменить доступ")
    } finally {
      setIdpSaving((prev) => ({ ...prev, [pk]: false }))
    }
  }

  const idpAccessOf = (u: IdpUser): IdpAccessLevel => {
    const raw = (u.access_level || "").toString()
    if (raw === "admin" || raw === "viewer" || raw === "none") return raw
    if (u.groups?.includes("hrms-admin")) return "admin"
    if (u.groups?.includes("hrms-viewer")) return "viewer"
    return "none"
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        (u.employee_name && u.employee_name.toLowerCase().includes(q)),
    )
  }, [users, search])

  const openCreate = () => {
    setSelectedUser(null)
    setDialogMode("create")
    setUsername("")
    setSelectedEmployee(null)
    setRole("viewer")
    setPassword("")
    setUsernameError("")
    setError("")
    setDialogOpen(true)
  }

  const openEdit = async (user: User) => {
    setSelectedUser(user)
    setDialogMode("edit")
    setUsername(user.username)
    setRole(user.role)
    setPassword("")
    setUsernameError("")
    setError("")
    setDialogOpen(true)

    if (user.employee_id !== null) {
      const existing = employees.find((e) => e.id === user.employee_id)
      if (existing) {
        setSelectedEmployee(existing)
      } else {
        try {
          const emp = await fetchEmployee(user.employee_id)
          setSelectedEmployee(emp)
        } catch (err) {
          console.error("Не удалось загрузить данные привязанного сотрудника", err)
          setSelectedEmployee({
            id: user.employee_id,
            name: user.employee_name || user.full_name,
            tab_number: null,
          } as Employee)
        }
      }
    } else {
      setSelectedEmployee(null)
    }
  }

  const handleEmployeeChange = (emp: Employee | null) => {
    setSelectedEmployee(emp)
    if (emp) {
      const generated = generateUsername(emp.name)
      setUsername(generated)
      setUsernameError(validateUsername(generated))
    } else {
      setUsername("")
      setUsernameError("")
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const currentError = validateUsername(username)
    if (currentError) {
      setUsernameError(currentError)
      setError(currentError)
      return
    }
    if (!selectedEmployee) {
      setError("Выберите сотрудника")
      return
    }
    if (password && password.length < 4) {
      setError("Пароль должен содержать не менее 4 символов")
      return
    }

    setSubmitting(true)
    setError("")

    const payload: Record<string, unknown> = {
      username: username.trim(),
      full_name: selectedEmployee.name,
      employee_id: selectedEmployee.id,
    }
    // Dual-run: local role Select only when OIDC is off
    if (!oidcEnabled) {
      payload.role = role
    }
    if (password.trim()) {
      payload.password = password.trim()
    }

    try {
      if (dialogMode === "create") {
        await api.post("/users", payload)
      } else if (dialogMode === "edit" && selectedUser) {
        await api.put(`/users/${selectedUser.id}`, payload)
      }
      setDialogOpen(false)
      loadData()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const openDelete = (user: User) => {
    setUserToDelete(user)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!userToDelete) return
    setDeleting(true)
    try {
      await api.delete(`/users/${userToDelete.id}`)
      setDeleteOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
      alert(formatApiError(err))
    } finally {
      setDeleting(false)
    }
  }

  // ── Wait for OIDC config (no flash of local IAM) ──
  if (!oidcConfigLoaded) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Назад в настройки</span>
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Пользователи
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Загрузка настроек доступа...</span>
        </div>
      </div>
    )
  }

  // ── OIDC on: IdP-first (Authentik SoT) ──
  if (oidcEnabled) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          <div>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Назад в настройки</span>
            </button>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  Пользователи и доступ
                </h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Каталог учёток ведётся в Authentik (единый IdP). HRMS получает роли из групп при
                  входе.
                </p>
              </div>
            </div>
          </div>

          {/* SoT banner + deep links */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Каталог пользователей — в Authentik
                </p>
                <p className="text-sm text-muted-foreground">
                  Создание, пароль и MFA пользователей выполняются в IdP. Здесь можно открыть
                  Admin UI Authentik и (при настроенном API-токене) менять группы доступа к HRMS.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {idpConfig?.admin_url ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    window.open(idpConfig.admin_url!, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Открыть Authentik Admin
                </Button>
              ) : null}
              {idpConfig?.user_settings_url ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    window.open(
                      idpConfig.user_settings_url!,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Кабинет пользователя
                </Button>
              ) : null}
            </div>
          </div>

          {/* HRMS access via IdP groups */}
          <div className="space-y-3 border rounded-lg p-4 bg-card">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Доступ к HRMS (группы)
              </h2>
              <p className="text-sm text-muted-foreground">
                Группы Authentik{" "}
                <span className="font-mono text-xs">hrms-admin</span> /{" "}
                <span className="font-mono text-xs">hrms-viewer</span>. Изменения применяются после
                нового входа.
              </p>
            </div>

            {idpError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{idpError}</span>
              </div>
            )}

            {idpLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
                Загрузка пользователей IdP...
              </div>
            ) : !idpConfig?.idp_admin_enabled ? (
              <div className="p-4 rounded-md border border-amber-500/30 bg-amber-500/10 text-sm space-y-3">
                <p className="text-foreground">
                  Настройте{" "}
                  <span className="font-mono text-xs">AUTHENTIK_API_TOKEN</span> для смены групп
                  из HRMS, либо управляйте доступом в Admin UI.
                </p>
                {idpConfig?.admin_url && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      window.open(idpConfig.admin_url!, "_blank", "noopener,noreferrer")
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Открыть Authentik Admin
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex gap-3 max-w-md">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Поиск IdP: логин, имя, email..."
                      value={idpSearch}
                      onChange={(e) => setIdpSearch(e.target.value)}
                      className="pl-9 bg-background"
                    />
                  </div>
                </div>
                {filteredIdpUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Пользователи IdP не найдены
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b text-muted-foreground font-medium">
                          <th className="px-4 py-2.5 text-left">Логин</th>
                          <th className="px-4 py-2.5 text-left">Имя</th>
                          <th className="px-4 py-2.5 text-left">Email</th>
                          <th className="px-4 py-2.5 text-left">Доступ HRMS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredIdpUsers.map((iu) => {
                          const level = idpAccessOf(iu)
                          return (
                            <tr key={iu.pk} className="hover:bg-muted/20">
                              <td className="px-4 py-3 font-mono font-medium">{iu.username}</td>
                              <td className="px-4 py-3">{iu.name || "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {iu.email || "—"}
                              </td>
                              <td className="px-4 py-3">
                                <Select
                                  value={level}
                                  onValueChange={(v) =>
                                    void handleIdpAccessChange(iu.pk, v as IdpAccessLevel)
                                  }
                                  disabled={Boolean(idpSaving[iu.pk])}
                                >
                                  <SelectTrigger
                                    className="w-[200px]"
                                    aria-label={`Доступ ${iu.username}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Администратор</SelectItem>
                                    <SelectItem value="viewer">Наблюдатель</SelectItem>
                                    <SelectItem value="none">Нет доступа</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </TooltipProvider>
    )
  }

  // ── OIDC off: local users (login/password/roles) ──
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Назад в настройки</span>
          </button>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                Пользователи
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Управление учётными записями HRMS: логин, пароль и роли.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить пользователя
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-3 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по логину, ФИО..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
            {search && (
              <Button variant="ghost" onClick={() => setSearch("")}>
                Сбросить
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Загрузка пользователей...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-lg bg-card/50">
              <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold text-lg">Пользователи не найдены</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                {search
                  ? "Попробуйте изменить поисковый запрос"
                  : "Добавьте первого пользователя с помощью кнопки выше"}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b text-muted-foreground font-medium">
                    <th className="px-6 py-3 text-left">Логин в KTM-2000</th>
                    <th className="px-6 py-3 text-left">ФИО пользователя</th>
                    <th className="px-6 py-3 text-left">Связанный сотрудник</th>
                    <th className="px-6 py-3 text-left">Роль в HRMS</th>
                    <th className="px-6 py-3 text-left">Дата добавления</th>
                    <th className="px-6 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium text-foreground">
                        {u.username}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        <div className="flex items-center gap-3">
                          <UserAvatar seed={getUserSeed(u)} size={32} />
                          <span>{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {u.employee_name ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-primary/5 border border-primary/10 rounded-full px-2.5 py-0.5 font-medium">
                            <Link className="h-3.5 w-3.5 text-primary" />
                            {u.employee_name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60 italic">
                            Без привязки
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge role={u.role} oidcManaged={false} />
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => void openEdit(u)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDelete(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>
                {dialogMode === "create"
                  ? "Добавление пользователя"
                  : "Редактирование пользователя"}
              </DialogTitle>
              <DialogDescription>
                Настройте учётную запись пользователя и привязку к сотруднику.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={(e) => void handleSave(e)} className="space-y-3.5 py-1">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                  <UserIcon className="h-4 w-4 text-primary" />
                  <span>Сотрудник и имя</span>
                </div>
                <div className="space-y-1">
                  <EmployeeSearch
                    value={selectedEmployee}
                    onChange={handleEmployeeChange}
                    label="Связать с сотрудником"
                    placeholder="Начните вводить ФИО..."
                    width="w-full"
                  />
                </div>
              </div>

              <div className="space-y-2.5 border-t border-border/40 pt-3">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                  <Shield className="h-4 w-4 text-primary" />
                  <span>Учетные данные</span>
                </div>

                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Логин
                    </label>
                    <Input
                      placeholder="ivanov_i"
                      value={username}
                      onChange={(e) => {
                        const val = e.target.value
                        setUsername(val)
                        setUsernameError(validateUsername(val))
                      }}
                      required
                      className={
                        usernameError
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                    />
                    {usernameError && (
                      <p className="text-[11px] text-destructive mt-0.5">{usernameError}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Роль
                    </label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Выберите роль" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Наблюдатель</SelectItem>
                        <SelectItem value="admin">Администратор</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {dialogMode === "create"
                      ? "Пароль (необязательно)"
                      : "Новый пароль (необязательно)"}
                  </label>
                  <Input
                    type="password"
                    placeholder={
                      dialogMode === "create"
                        ? "Оставьте пустым, чтобы задать позже"
                        : "Оставьте пустым, чтобы не менять"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    "Сохранить"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
              <AlertDialogDescription>
                Пользователь <strong>{userToDelete?.username}</strong> (
                {userToDelete?.full_name}) больше не сможет войти в HRMS. Вы можете добавить его
                повторно в любой момент.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {deleting ? "Удаление..." : "Да, удалить"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
