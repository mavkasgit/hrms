import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Plus, Building2, Briefcase, Tag } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { useDepartments } from "@/entities/department"
import { usePositions } from "@/entities/position"
import { useTags } from "@/entities/tag"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"

export function StructurePage() {
  const [activeTab, setActiveTab] = useState("departments")
  const { data: departments = [], isLoading: depsLoading } = useDepartments()
  const { data: positions = [], isLoading: posLoading } = usePositions()
  const { data: tags = [], isLoading: tagsLoading } = useTags()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Структура компании</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="departments">
            <Building2 className="h-4 w-4 mr-2" />
            Подразделения
          </TabsTrigger>
          <TabsTrigger value="positions">
            <Briefcase className="h-4 w-4 mr-2" />
            Должности
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tag className="h-4 w-4 mr-2" />
            Теги
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Управление подразделениями компании
            </p>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Добавить подразделение
            </Button>
          </div>

          {depsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : departments.length === 0 ? (
            <EmptyState
              message="Нет подразделений"
              description="Добавьте первое подразделение"
            />
          ) : (
            <div className="grid gap-3">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">{dept.name}</h3>
                        <p className="text-sm text-muted-foreground">ID: {dept.id}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Управление должностями в компании
            </p>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Добавить должность
            </Button>
          </div>

          {posLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : positions.length === 0 ? (
            <EmptyState
              message="Нет должностей"
              description="Добавьте первую должность"
            />
          ) : (
            <div className="grid gap-3">
              {positions.map((pos) => (
                <div
                  key={pos.id}
                  className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Briefcase className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">{pos.name}</h3>
                        <p className="text-sm text-muted-foreground">ID: {pos.id}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Управление тегами для категоризации сотрудников
            </p>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Добавить тег
            </Button>
          </div>

          {tagsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <EmptyState
              message="Нет тегов"
              description="Добавьте первый тег"
            />
          ) : (
            <div className="grid gap-3">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Tag className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">{tag.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Порядок: {tag.sort_order}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
