import { useState } from "react"
import { Building2, Briefcase } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { DepartmentsTab } from "./DepartmentsTab"
import { PositionsTab } from "./PositionsTab"
import { TagsPanel } from "./TagsPanel"

export function StructurePage() {
  const [activeTab, setActiveTab] = useState("departments")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Структура компании</h1>
          <p className="text-sm text-muted-foreground">
            Подразделения, должности и теги
          </p>
        </div>
      </div>

      {/* Двухколоночный layout: контент слева, теги справа */}
      <div className="flex gap-4">
        {/* Левая колонка — табы */}
        <div className="flex-1 min-w-0">
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
            </TabsList>

            <TabsContent value="departments">
              <DepartmentsTab />
            </TabsContent>
            <TabsContent value="positions">
              <PositionsTab />
            </TabsContent>
          </Tabs>
        </div>

        {/* Правая колонка — теги */}
        <div className="w-[280px] flex-shrink-0">
          <div className="border rounded-lg bg-card p-3 sticky top-4" style={{ maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            <TagsPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
