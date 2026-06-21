import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Users, Plus, Shield, Search, Edit2, Trash2, Loader2, ArrowLeft, AlertCircle, Link } from "lucide-react"
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
import api from "@/shared/api/axios"
import { fetchEmployees, fetchEmployee } from "@/entities/employee/api"
import type { Employee } from "@/entities/employee/types"
import { EmployeeSearch } from "@/features/employee-search"

interface User {
  id: number
  username: string
  full_name: string
  role: string
  employee_id: number | null
  employee_name: string | null
  created_at: string
}


export function UsersPage() {
  const navigate = useNavigate()
  
  // Данные
  const [users, setUsers] = useState<User[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  
  // Состояние диалога создания/редактирования
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  
  // Поля формы
  const [username, setUsername] = useState("")
  const [fullName, setFullName] = useState("")
  const [linkEmployee, setLinkEmployee] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Состояние диалога удаления
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        (u.employee_name && u.employee_name.toLowerCase().includes(q))
    )
  }, [users, search])

  const openCreate = () => {
    setSelectedUser(null)
    setDialogMode("create")
    setUsername("")
    setFullName("")
    setLinkEmployee(true)
    setSelectedEmployee(null)
    setPassword("")
    setError("")
    setDialogOpen(true)
  }

  const openEdit = async (user: User) => {
    setSelectedUser(user)
    setDialogMode("edit")
    setUsername(user.username)
    setFullName(user.full_name)
    setLinkEmployee(user.employee_id !== null)
    setPassword("")
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
      setFullName(emp.name)
    } else {
      setFullName("")
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      setError("Имя пользователя обязательно")
      return
    }
    if (linkEmployee && !selectedEmployee) {
      setError("Выберите сотрудника для привязки")
      return
    }
    if (!linkEmployee && !fullName.trim()) {
      setError("Введите ФИО пользователя")
      return
    }

    setSubmitting(true)
    setError("")

    const payload: Record<string, unknown> = {
      username: username.trim(),
      full_name: linkEmployee ? undefined : fullName.trim(),
      employee_id: linkEmployee && selectedEmployee ? selectedEmployee.id : null,
      role: "admin", // Единственная главная роль
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
    } catch (err: any) {
      setError(err.response?.data?.detail || "Произошла ошибка при сохранении")
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
              Управление учетными записями, имеющими доступ к кадровой системе через сквозную авторизацию (SSO).
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить пользователя
          </Button>
        </div>
      </div>

      {/* Информационный Alert */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300 flex gap-3">
        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Важная информация по сквозной авторизации (SSO)</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Пользователи авторизуются через единый ключ JWT от KTM-2000. Для успешного входа:
          </p>
          <ul className="list-disc list-inside text-xs text-muted-foreground pl-1 space-y-1">
            <li>Логин в списке ниже должен <strong>в точности совпадать</strong> с логином пользователя в KTM-2000.</li>
            <li>Любому зарегистрированному здесь пользователю автоматически выдаются полные права администратора кадровой системы (роль `admin`).</li>
          </ul>
        </div>
      </div>

      {/* Панель поиска */}
      <div className="flex gap-3 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по логину или ФИО..."
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
                    {u.full_name}
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
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800/30">
                      <Shield className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      Администратор
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
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "Добавление пользователя" : "Редактирование пользователя"}
            </DialogTitle>
            <DialogDescription>
              Настройте учетные данные и привязку к сотруднику.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Имя пользователя (логин) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Логин (точно как в KTM-2000)
              </label>
              <Input
                placeholder="Например, ivanov_i"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {/* Опция привязки к сотруднику */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="link-employee-chk"
                checked={linkEmployee}
                onChange={(e) => {
                  setLinkEmployee(e.target.checked)
                  if (!e.target.checked) {
                    setSelectedEmployee(null)
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="link-employee-chk" className="text-sm font-medium text-foreground cursor-pointer select-none">
                Связать с сотрудником из реестра
              </label>
            </div>

            {/* Выбор сотрудника */}
            {linkEmployee ? (
              <div className="space-y-1.5">
                <EmployeeSearch
                  value={selectedEmployee}
                  onChange={handleEmployeeChange}
                  label="Выберите сотрудника"
                  placeholder="Начните вводить ФИО..."
                  width="w-full"
                />
              </div>
            ) : (
              /* Ручной ввод ФИО */
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  ФИО Пользователя
                </label>
                <Input
                  placeholder="Иванов Иван Иванович"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Локальный пароль для резервного входа */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Локальный пароль (резервный вход)
              </label>
              <Input
                type="password"
                placeholder={dialogMode === "edit" ? "Оставьте пустым, чтобы не менять" : "Оставьте пустым для входа только через SSO"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-[11px] text-muted-foreground">
                Позволяет входить по логину и паролю, если сервер авторизации KTM-2000 недоступен.
              </p>
            </div>

            <DialogFooter className="pt-4">
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
              Пользователь <strong>{userToDelete?.username}</strong> ({userToDelete?.full_name}) больше не сможет авторизоваться в кадровой системе HRMS через SSO. Вы можете добавить его повторно в любой момент.
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
    </div>
  )
}
