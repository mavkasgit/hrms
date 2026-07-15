import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Users, Plus, Shield, ShieldCheck, UserCheck, Search, Edit2, Trash2, Loader2, ArrowLeft, AlertCircle, Link, Copy, Check, User as UserIcon } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { TelegramIcon } from "@/shared/ui/icons"
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
import api from "@/shared/api/axios"
import { fetchEmployees, fetchEmployee } from "@/entities/employee/api"
import type { Employee } from "@/entities/employee/types"
import { EmployeeSearch } from "@/features/employee-search"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { getUserSeed } from "@/shared/lib/avatar"
import { TelegramBotModal } from "@/features/admin-settings/TelegramBotModal"
interface User {
  id: number
  username: string
  full_name: string
  role: string
  employee_id: number | null
  employee_name: string | null
  created_at: string
  telegram_id: number | null
  telegram_username: string | null
  phone: string | null
  phone_verified_at: string | null
  invite_code: string | null
  avatar_seed?: string | null
}

function TelegramIdDisplay({ telegramId }: { telegramId: number }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(telegramId))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Не удалось скопировать ID:", err)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[#2AABEE] hover:text-[#229ED9] transition-colors font-mono focus:outline-none"
      title="Нажмите, чтобы скопировать Telegram ID"
    >
      <span>ID: {telegramId}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500 animate-in fade-in zoom-in-95 duration-150" />
      ) : (
        <Copy className="h-3 w-3 opacity-60 hover:opacity-100" />
      )}
    </button>
  )
}

function InviteCodeDisplay({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Не удалось скопировать код:", err)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded focus:outline-none transition-colors font-mono"
      title="Нажмите, чтобы скопировать инвайт-код"
    >
      <span>Инвайт: {inviteCode}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 opacity-60 hover:opacity-100" />
      )}
    </button>
  )
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
    const response = err.response
    if (response && typeof response === "object" && "data" in response) {
      const data = response.data
      if (data && typeof data === "object" && "detail" in data) {
        const detail = data.detail
        if (typeof detail === "string") {
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
                    : field === "telegram_id"
                      ? "Telegram ID"
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
          if ("message" in detail && typeof detail.message === "string") {
            return detail.message
          }
          return JSON.stringify(detail)
        }
      }
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return "Произошла ошибка при сохранении"
}

export function UsersPage() {
  const navigate = useNavigate()
  
  // Данные
  const [users, setUsers] = useState<User[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingInvites, setGeneratingInvites] = useState<Record<number, boolean>>({})

  const handleGenerateInvite = async (userId: number) => {
    setGeneratingInvites(prev => ({ ...prev, [userId]: true }))
    try {
      const response = await api.post<{ invite_code: string }>(`/users/${userId}/generate-invite`)
      setUsers(prevUsers =>
        prevUsers.map(u => (u.id === userId ? { ...u, invite_code: response.data.invite_code } : u))
      )
    } catch (err) {
      console.error("Не удалось сгенерировать инвайт:", err)
      alert("Не удалось сгенерировать инвайт-код")
    } finally {
      setGeneratingInvites(prev => ({ ...prev, [userId]: false }))
    }
  }
  const [search, setSearch] = useState("")
  
  // Состояние диалога создания/редактирования
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  
  // Поля формы
  const [username, setUsername] = useState("")
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [role, setRole] = useState("viewer")
  const [usernameError, setUsernameError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Состояние диалога удаления
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Состояние модалки Telegram Bot
  const [telegramModalOpen, setTelegramModalOpen] = useState(false)

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
      (u) => u.username.toLowerCase() === normalized && (!selectedUser || u.id !== selectedUser.id)
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
    } catch (err: any) {
      setError("Не удалось загрузить пользователей или список сотрудников")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Фильтрация
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const tg = u.telegram_id != null ? String(u.telegram_id) : ""
      const phoneVal = (u.phone || "").toLowerCase()
      return (
        u.username.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        (u.employee_name && u.employee_name.toLowerCase().includes(q)) ||
        tg.includes(q) ||
        phoneVal.includes(q)
      )
    })
  }, [users, search])

  const openCreate = () => {
    setSelectedUser(null)
    setDialogMode("create")
    setUsername("")
    setSelectedEmployee(null)
    setRole("viewer")
    setUsernameError("")
    setError("")
    setDialogOpen(true)
  }

  const openEdit = async (user: User) => {
    setSelectedUser(user)
    setDialogMode("edit")
    setUsername(user.username)
    setRole(user.role)
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

    setSubmitting(true)
    setError("")

    const payload: Record<string, unknown> = {
      username: username.trim(),
      full_name: selectedEmployee.name,
      employee_id: selectedEmployee.id,
      role: role,
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
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Вернуться в настройки */}
      <div>
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Назад в настройки</span>
        </button>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Пользователи кадровой системы
            </h1>
            <p className="text-sm text-muted-foreground">
              Управление учетными записями HRMS: вход по логину/паролю, Telegram или invite.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setTelegramModalOpen(true)}>
              <TelegramIcon className="mr-2 h-4 w-4" />
              Telegram Bot
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить пользователя
            </Button>
          </div>
        </div>
      </div>

      {/* Панель поиска */}
      <div className="flex gap-3 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по логину, ФИО, Telegram ID..."
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

      {/* Список пользователей */}
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
            {search ? "Попробуйте изменить поисковый запрос" : "Добавьте первого пользователя с помощью кнопки выше"}
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
                <th className="px-6 py-3 text-left">Telegram</th>
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
                      <UserAvatar
                        seed={getUserSeed(u)}
                        size={32}
                      />
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
                    {u.telegram_id != null ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800/30">
                          <span
                            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2AABEE] text-[9px] font-bold text-white"
                            aria-hidden
                          >
                            TG
                          </span>
                          Привязан
                        </span>
                        <div className="text-[11px] text-muted-foreground font-mono pl-0.5 space-y-0.5">
                          {u.telegram_username ? (
                            <a
                              href={`https://t.me/${u.telegram_username.replace("@", "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#2AABEE] hover:underline underline-offset-2 font-medium"
                              title="Открыть профиль в Telegram"
                            >
                              @{u.telegram_username.replace("@", "")}
                            </a>
                          ) : (
                            <TelegramIdDisplay telegramId={u.telegram_id} />
                          )}
                          {u.phone ? <span className="block">Тел: {u.phone}</span> : null}
                          {u.phone_verified_at ? (
                            <span className="block text-emerald-600 dark:text-emerald-400">
                              Телефон подтверждён
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {u.invite_code ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-muted-foreground/60 italic">Не привязан</span>
                            <InviteCodeDisplay inviteCode={u.invite_code} />
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1 border-dashed hover:border-solid transition-all"
                            onClick={() => handleGenerateInvite(u.id)}
                            disabled={generatingInvites[u.id]}
                          >
                            {generatingInvites[u.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            Сгенерировать инвайт
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${
                      u.role === "admin"
                        ? "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800/30"
                        : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/30"
                    }`}>
                      {u.role === "admin" ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                      {u.role === "admin" ? "Администратор" : u.role === "viewer" ? "Наблюдатель" : u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => openDelete(u)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Диалог создания/редактирования */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "Добавление пользователя" : "Редактирование пользователя"}
            </DialogTitle>
            <DialogDescription>
              Настройте учётную запись пользователя и привязку к сотруднику.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-3.5 py-1">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Секция 1: Сотрудник и имя */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                <UserIcon className="h-4 w-4 text-primary" />
                <span>Сотрудник и имя</span>
              </div>

              {/* Выбор сотрудника */}
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

            {/* Секция 2: Доступ */}
            <div className="space-y-2.5 border-t border-border/40 pt-3">
              <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                <Shield className="h-4 w-4 text-primary" />
                <span>Учетные данные</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Логин */}
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
                    className={usernameError ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {usernameError && (
                    <p className="text-[11px] text-destructive mt-0.5">{usernameError}</p>
                  )}
                </div>

                {/* Роль в системе */}
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
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
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

      {/* Подтверждение удаления */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
            <AlertDialogDescription>
              Пользователь <strong>{userToDelete?.username}</strong> ({userToDelete?.full_name}) больше не сможет войти в HRMS (логин/пароль, Telegram или invite). Вы можете добавить его повторно в любой момент.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? "Удаление..." : "Да, удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Telegram Bot: токен хранится в system_settings */}
      <TelegramBotModal
        open={telegramModalOpen}
        onOpenChange={setTelegramModalOpen}
      />
    </div>
  )
}
