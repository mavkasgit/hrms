import { useState, useRef } from "react"
import { Check, Download, Upload, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { useAllOrderTypes, useUploadTemplate } from "@/entities/order/useOrders"
import type { OrderType } from "@/entities/order/types"

interface ImportTemplatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface UploadStatus {
  [orderTypeId: number]: "uploading" | "success" | "error"
}

export function ImportTemplatesModal({ open, onOpenChange }: ImportTemplatesModalProps) {
  const { data: orderTypes = [] } = useAllOrderTypes()
  const uploadMutation = useUploadTemplate()
  const [uploading, setUploading] = useState<UploadStatus>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileForType = (orderType: OrderType, file: File) => {
    setUploading((prev) => ({ ...prev, [orderType.id]: "uploading" }))
    uploadMutation.mutate(
      { orderTypeId: orderType.id, file },
      {
        onSuccess: () => {
          setUploading((prev) => ({ ...prev, [orderType.id]: "success" }))
          setTimeout(() => {
            setUploading((prev) => {
              const next = { ...prev }
              delete next[orderType.id]
              return next
            })
          }, 2000)
        },
        onError: () => {
          setUploading((prev) => ({ ...prev, [orderType.id]: "error" }))
          setTimeout(() => {
            setUploading((prev) => {
              const next = { ...prev }
              delete next[orderType.id]
              return next
            })
          }, 3000)
        },
      }
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return

    // Match files to order types by code
    for (const file of selected) {
      if (!file.name.endsWith(".docx")) continue
      const code = file.name.replace(/\.docx$/i, "")
      const matchingType = orderTypes.find((ot) => ot.code === code)
      if (matchingType) {
        handleFileForType(matchingType, file)
      }
    }

    // Reset input so same files can be selected again
    e.target.value = ""
  }

  const handleUploadClick = (orderType: OrderType) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".docx"
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0]
      if (file) handleFileForType(orderType, file)
    }
    input.click()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Шаблоны приказов</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">
            Загружено: {orderTypes.filter((ot) => ot.template_exists).length} из {orderTypes.length}
          </p>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Загрузить несколько
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {orderTypes.map((orderType) => {
            const status = uploading[orderType.id]
            return (
              <div
                key={orderType.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-green-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{orderType.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {orderType.template_exists ? orderType.display_name || orderType.template_filename : "Нет шаблона"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {status === "uploading" && (
                    <span className="text-xs text-muted-foreground">Загрузка...</span>
                  )}
                  {status === "success" && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Загружено
                    </span>
                  )}
                  {status === "error" && (
                    <span className="text-xs text-red-600 flex items-center gap-1">
                      <X className="h-3 w-3" /> Ошибка
                    </span>
                  )}
                  {!status && orderType.template_exists && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      onClick={() => {
                        // delete template - delegate to parent
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => handleUploadClick(orderType)}
                    disabled={uploadMutation.isPending}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    {orderType.template_exists ? "Заменить" : "Загрузить"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
