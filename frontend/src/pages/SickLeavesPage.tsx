import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Plus, Stethoscope, Calendar, User } from "lucide-react"
import { EmptyState } from "@/shared/ui/empty-state"

export function SickLeavesPage() {
  const [sickLeaves] = useState([])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Больничные листы</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Учет временной нетрудоспособности сотрудников
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Добавить больничный
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Stethoscope className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Активных</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">За месяц</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <User className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Сотрудников</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </div>
        </div>
      </div>

      {sickLeaves.length === 0 ? (
        <EmptyState
          message="Нет больничных листов"
          description="Добавьте первый больничный лист для учета временной нетрудоспособности"
        />
      ) : (
        <div className="border rounded-lg">
          {/* Здесь будет таблица больничных */}
        </div>
      )}
    </div>
  )
}
