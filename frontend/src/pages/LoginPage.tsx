import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

export function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">HRMS</h1>
          <p className="text-muted-foreground mt-1">Вход в систему</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Логин</label>
            <Input placeholder="Введите логин" />
          </div>
          <div>
            <label className="text-sm font-medium">Пароль</label>
            <Input type="password" placeholder="Введите пароль" />
          </div>
          <Button className="w-full">Войти</Button>
        </div>
      </div>
    </div>
  )
}
