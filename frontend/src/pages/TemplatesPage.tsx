import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, Download, Trash2, FileText, ChevronDown, ChevronRight, Eye } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/shared/api/axios"

interface TemplateInfo {
  name: string
  order_type: string
  exists: boolean
  file_size?: number
  last_modified?: string
}

interface TemplateVariable {
  name: string
  description: string
  category: string
}

export function TemplatesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const [variablesExpanded, setVariablesExpanded] = useState(() => {
    const saved = localStorage.getItem("templatesPage.variablesExpanded")
    return saved !== null ? JSON.parse(saved) : true
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const response = await api.get<{ templates: TemplateInfo[] }>("templates")
      return response.data
    },
  })

  const { data: variablesData, isLoading: variablesLoading } = useQuery({
    queryKey: ["template-variables"],
    queryFn: async () => {
      const response = await api.get<{ variables: TemplateVariable[] }>("templates/variables")
      return response.data
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ orderType, file }: { orderType: string; file: File }) => {
      const formData = new FormData()
      formData.append("file", file)
      const response = await api.post(`templates/${orderType}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] })
      setUploadingType(null)
    },
    onError: () => {
      alert("Ошибка при загрузке шаблона")
      setUploadingType(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (orderType: string) => {
      const response = await api.delete(`templates/${orderType}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] })
    },
    onError: () => {
      alert("Ошибка при удалении шаблона")
    },
  })

  const handleDownload = async (orderType: string) => {
    try {
      const response = await api.get(`templates/${orderType}`, {
        responseType: "blob",
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `${orderType}.docx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert("Ошибка при скачивании шаблона")
    }
  }

  const handleUpload = (orderType: string) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".docx"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        setUploadingType(orderType)
        uploadMutation.mutate({ orderType, file })
      }
    }
    input.click()
  }

  const handleDelete = (orderType: string) => {
    if (confirm(`Удалить шаблон "${orderType}"?`)) {
      deleteMutation.mutate(orderType)
    }
  }

  const handlePreview = async (orderType: string) => {
    try {
      const url = `${import.meta.env.VITE_API_URL || "/api"}/templates/${encodeURIComponent(orderType)}/preview`
      window.open(url, "_blank")
    } catch {
      alert("Ошибка при просмотре шаблона")
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "—"
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—"
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
  }

  const toggleVariables = () => {
    const newValue = !variablesExpanded
    setVariablesExpanded(newValue)
    localStorage.setItem("templatesPage.variablesExpanded", JSON.stringify(newValue))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/orders")}
          title="Назад к приказам"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Управление шаблонами приказов</h1>
      </div>

      <div className="border rounded-lg bg-card">
        <button
          onClick={toggleVariables}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/50 transition-colors"
        >
          {variablesExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h3 className="font-semibold">Доступные переменные для шаблонов</h3>
        </button>
        {variablesExpanded && (
          <div className="border-t px-4 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Используйте эти переменные в фигурных скобках в ваших .docx шаблонах. Они будут автоматически заменены на данные сотрудника при создании приказа.
            </p>
            <div className="bg-muted/50 border rounded-md p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Пример названия файла:</p>
              <code className="text-xs">
                Приказ_№{"{order_number}"}_к_{"{order_date}"}_{"{order_type_lower}"}_{"{short_name}"}.docx
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Результат: <span className="font-mono">Приказ_№05_к_15_03_прием_Иванов_И.О..docx</span>
              </p>
            </div>
            {variablesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  {["Приказ", "ФИО"].map((category) => {
                    const categoryVars = variablesData?.variables.filter(v => v.category === category) || []
                    if (categoryVars.length === 0) return null
                    
                    return (
                      <div key={category}>
                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{category}</h4>
                        <div className="space-y-2 text-sm">
                          {categoryVars.map((variable) => (
                            <div key={variable.name}>
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{variable.name}</code>
                              <span className="text-muted-foreground ml-2">— {variable.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="space-y-4">
                  {["Работа", "Даты", "Прочее"].map((category) => {
                    const categoryVars = variablesData?.variables.filter(v => v.category === category) || []
                    if (categoryVars.length === 0) return null
                    
                    return (
                      <div key={category}>
                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{category}</h4>
                        <div className="space-y-2 text-sm">
                          {categoryVars.map((variable) => (
                            <div key={variable.name}>
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{variable.name}</code>
                              <span className="text-muted-foreground ml-2">— {variable.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {(error as Error).message || "Ошибка загрузки данных"}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data?.templates?.length ? (
        <EmptyState
          message="Шаблоны не найдены"
          description="Загрузите первый шаблон приказа"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тип приказа</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Размер файла</TableHead>
              <TableHead>Последнее изменение</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.templates.map((template) => (
              <TableRow key={template.order_type}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {template.order_type}
                  </div>
                </TableCell>
                <TableCell>
                  {template.exists ? (
                    <span className="text-green-600 text-sm">✓ Загружен</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">Не загружен</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatFileSize(template.file_size)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(template.last_modified)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {template.exists && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Быстрый просмотр"
                          onClick={() => handlePreview(template.order_type)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Скачать шаблон"
                          onClick={() => handleDownload(template.order_type)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Удалить шаблон"
                          onClick={() => handleDelete(template.order_type)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={template.exists ? "Обновить шаблон" : "Загрузить шаблон"}
                      onClick={() => handleUpload(template.order_type)}
                      disabled={uploadingType === template.order_type}
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
